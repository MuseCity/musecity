import { interactionSchema } from "../shared/interactions";
import { interactionSummaries, setInteraction } from "./interactions";
import { Hono, type Context } from "hono";
import { z } from "zod";
import { withDatabase, type Database } from "./database";
import {
  identity,
  actor,
  privyVerifier,
  profile,
  deduplicate,
  rateLimit,
  type Actor,
  type VerifyHuman,
} from "./auth";
import { ApiError, requireValue } from "./errors";
import { id, digest } from "./crypto";
import {
  feed,
  workView,
  createWork,
  editWork,
  changePublication,
} from "./works";
import { catalog, createTag } from "./tags";
import {
  createUpload,
  uploadBytes,
  ownMedia,
  completeUpload,
  imageResponse,
  boundedBody,
  requestedWidth,
  type ObjectStore,
} from "./media";
import { cloudflareImages, type ImageServices } from "./image-processing";
import * as agentService from "./agents";
import * as community from "./community";
import * as onboarding from "./onboarding";
import * as governance from "./governance";
import {
  membership,
  privyWalletServices,
  type WalletServices,
} from "./wallets";
import {
  proposalSchema,
  voteSchema,
  cancelProposalSchema,
  executionSchema,
} from "../shared/governance";
import {
  introductionSchema,
  onboardingActionSchema,
} from "../shared/onboarding";
import { myContent } from "./content";
import {
  workSchema,
  defaultTabs,
  createTagSchema,
  feedPreferencesSchema,
  scopesSchema,
  draftScopes,
  type Scope,
  residentSchema,
  postSchema,
  helpStatuses,
} from "../shared/contracts";
import type { AccountRow, AgentRow } from "./schema";
import { openapi, skill } from "./discovery";
import { handleMcp } from "./mcp";
export type Services = {
  connectionString: string;
  store: ObjectStore;
  verify: VerifyHuman;
  origin: string;
  images?: ImageServices;
  wallets?: WalletServices;
};
export const productionServices = (
  env: Env,
  ctx: ExecutionContext,
): Services => ({
  connectionString: env.DATABASE.connectionString,
  store: env.MEDIA,
  verify: privyVerifier(env.PRIVY_APP_ID, env.PRIVY_APP_SECRET),
  origin: env.APP_ORIGIN,
  wallets: privyWalletServices(
    env.PRIVY_APP_ID,
    env.PRIVY_APP_SECRET,
    env.ROBINHOOD_RPC_URL,
  ),
  images: {
    process: cloudflareImages(env.IMAGES),
    cache: {
      match: async (request) =>
        (await caches.open("musecity-media-v1")).match(request),
      put: async (request, response) =>
        (await caches.open("musecity-media-v1")).put(request, response),
    },
    waitUntil: (promise) => ctx.waitUntil(promise),
    origin: env.APP_ORIGIN,
  },
});
type AppEnv = { Variables: { requestId: string } };
const confirmSchema = z.object({ confirmed: z.literal(true) });
const nameSchema = z.string().trim().min(1).max(80);
async function json<T>(c: Context<AppEnv>, schema: z.ZodType<T>): Promise<T> {
  requireValue(
    c.req.header("content-type")?.startsWith("application/json"),
    415,
    "VALIDATION_ERROR",
    "Use application/json.",
  );
  let value: unknown;
  try {
    value = JSON.parse(
      new TextDecoder().decode(await boundedBody(c.req.raw, 1024 * 1024)),
    );
  } catch (e) {
    if (e instanceof ApiError) throw e;
    throw new ApiError(400, "VALIDATION_ERROR", "Invalid JSON.");
  }
  const result = schema.safeParse(value);
  requireValue(
    result.success,
    400,
    "VALIDATION_ERROR",
    result.error?.issues
      .map((i) => i.message)
      .join("; ")
      .slice(0, 500) ?? "Invalid input.",
  );
  return result.data;
}
export function createApi(s: Services) {
  const app = new Hono<AppEnv>();
  const db = <T>(fn: (d: Database) => Promise<T>) =>
    withDatabase(s.connectionString, fn);
  const authed = async <T>(
    c: Context<AppEnv>,
    scope: Scope | undefined,
    human: boolean,
    fn: (d: Database, a: Actor) => Promise<T>,
    diagnostic = false,
  ): Promise<T> => {
    const who = await identity(c.req.raw, s.verify);
    return db((d) =>
      d.transaction(async () => {
        // Serialize cross-account social writes before acquiring any account row.
        // This gives block/reply/moderation a defined commit order and prevents FK lock inversions.
        if (
          c.req.method !== "GET" &&
          /\/(works|posts|comments|follows|blocks|reports|moderation|proposals)(\/|$)/.test(
            c.req.path,
          )
        )
          await d.query("SELECT pg_advisory_xact_lock(624139188)");
        const a = await actor(d, who, scope, human, diagnostic);
        if (c.req.method !== "GET")
          await rateLimit(d, "account:" + a.account.id, 120);
        return fn(d, a);
      }),
    );
  };
  const write = <T>(
    c: Context<AppEnv>,
    scope: Scope,
    human: boolean,
    body: unknown,
    fn: (d: Database, a: Actor) => Promise<T>,
  ) =>
    authed(c, scope, human, (d, a) =>
      deduplicate(
        d,
        a,
        c.req.method + ":" + c.req.path,
        c.req.header("Idempotency-Key") ?? null,
        body,
        () => fn(d, a),
      ),
    );
  app.use("*", async (c, next) => {
    c.set("requestId", id("req"));
    c.header("X-Request-Id", c.get("requestId"));
    c.header("Cache-Control", "private, no-store");
    c.header("X-Content-Type-Options", "nosniff");
    c.header("Referrer-Policy", "no-referrer");
    const origin = c.req.header("origin");
    requireValue(
      !origin || origin === s.origin,
      403,
      "ORIGIN_DENIED",
      "This request origin is not allowed.",
    );
    await next();
  });
  app.onError((error, c) => {
    const known = error instanceof ApiError;
    if (!known)
      console.error(
        JSON.stringify({
          event: "request.failed",
          requestId: c.get("requestId"),
          errorType: error.name,
        }),
      );
    if (known && error.status === 429)
      c.header(
        "Retry-After",
        error.code === "COMMUNITY_DAILY_LIMIT"
          ? String(Math.ceil((86400000 - (Date.now() % 86400000)) / 1000))
          : "60",
      );
    return c.json(
      {
        error: {
          code: known ? error.code : "SERVICE_UNAVAILABLE",
          message: known
            ? error.message
            : "The service is unavailable. Please retry.",
        },
        requestId: c.get("requestId"),
      },
      (known ? error.status : 503) as 400,
    );
  });
  app.get("/skill.md", (c) => c.text(skill(s.origin)));
  app.get("/openapi.json", (c) => c.json(openapi(s.origin)));
  app.all("/mcp", async (c) => {
    const response = await handleMcp(c.req.raw, s.origin, (request) =>
      app.fetch(request),
    );
    return c.newResponse(response.body, response);
  });
  app.get("/api/v1/health", (c) => c.json({ status: "ok" }));
  app.get("/api/v1/tags", async (c) => c.json({ tags: await db(catalog) }));
  app.post("/api/v1/tags", async (c) => {
    const body = await json(c, createTagSchema);
    return c.json(
      await write(c, "content:write", true, body, (d, a) =>
        createTag(d, a, body.name),
      ),
    );
  });
  app.get("/api/v1/me/content", async (c) =>
    c.json(
      await authed(c, undefined, true, (d, a) =>
        myContent(d, a, new URL(c.req.url).searchParams),
      ),
    ),
  );
  app.get("/api/v1/me", async (c) =>
    c.json(
      await authed(c, undefined, true, async (d, a) => ({
        ...profile(a.account),
        isModerator: await community.moderator(d, a),
      })),
    ),
  );
  app.get("/api/v1/me/onboarding", async (c) =>
    c.json(await authed(c, undefined, true, onboarding.onboardingState)),
  );
  app.get("/api/v1/me/membership", async (c) =>
    c.json(
      await authed(c, undefined, true, async (d, a) => {
        await rateLimit(d, "membership:" + a.account.id, 30);
        return membership(d, a, s.wallets);
      }),
    ),
  );
  app.patch("/api/v1/me/onboarding", async (c) => {
    const body = await json(c, onboardingActionSchema);
    return c.json(
      await authed(c, "content:write", true, async (d, a) => {
        await deduplicate(
          d,
          a,
          c.req.method + ":" + c.req.path,
          c.req.header("Idempotency-Key") ?? null,
          body,
          () => onboarding.updateOnboarding(d, a, body),
        );
        return onboarding.onboardingState(d, a);
      }),
    );
  });
  app.post("/api/v1/me/onboarding/posts", async (c) => {
    const body = await json(c, introductionSchema);
    return c.json(
      await authed(c, "community:post", true, async (d, a) => {
        const postId = await deduplicate(
          d,
          a,
          c.req.method + ":" + c.req.path,
          c.req.header("Idempotency-Key") ?? null,
          body,
          () => onboarding.publishIntroduction(d, a, body.text),
        );
        // Recheck visibility on retries instead of replaying an old public body.
        return community.postView(d, postId, a);
      }),
      201,
    );
  });
  app.patch("/api/v1/me", async (c) => {
    const body = await json(c, residentSchema);
    return c.json(
      await write(c, "content:write", true, body, async (d, a) => {
        if (body.avatarMediaId)
          requireValue(
            (await ownMedia(d, a, body.avatarMediaId)).status === "ready",
            409,
            "MEDIA_NOT_READY",
            "Upload your avatar first.",
          );
        const row = await d
          .one<AccountRow>(
            "UPDATE musecity.accounts SET name=$2,bio=$3,avatar_media_id=$4,working_on=COALESCE($5,working_on),can_help=COALESCE($6,can_help),joined_at=CASE WHEN $7 THEN COALESCE(joined_at,date_trunc('milliseconds',clock_timestamp())) ELSE joined_at END,handle=COALESCE($8,handle) WHERE id=$1 RETURNING *",
            [
              a.account.id,
              body.name,
              body.bio,
              body.avatarMediaId,
              body.workingOn ?? null,
              body.canHelp ?? null,
              body.join === true,
              body.handle ?? null,
            ],
          )
          .catch((error: unknown) => {
            // The unique constraint also resolves simultaneous claims atomically.
            if (
              error instanceof Error &&
              "code" in error &&
              error.code === "23505" &&
              "constraint" in error &&
              error.constraint === "accounts_handle_key"
            )
              throw new ApiError(
                409,
                "HANDLE_TAKEN",
                "That handle is already taken. Choose another.",
              );
            throw error;
          });
        return profile(row!);
      }),
    );
  });
  app.get("/api/v1/profiles/:handle", async (c) =>
    c.json(
      await db(async (d) => {
        const a = await d.one<AccountRow>(
          "SELECT * FROM musecity.accounts WHERE handle=$1 AND status='active'",
          [c.req.param("handle")],
        );
        requireValue(a, 404, "NOT_FOUND", "Creator not found.");
        return profile(a);
      }),
    ),
  );
  app.get("/api/v1/me/feed-preferences", async (c) =>
    c.json(
      await authed(c, undefined, true, async (d, a) => {
        const p = await d.one<{ tabs: string[] }>(
          "SELECT tabs FROM musecity.feed_preferences WHERE account_id=$1",
          [a.account.id],
        );
        const available = [
          ...defaultTabs,
          ...(await catalog(d)).map((t) => "tag:" + t.id),
        ];
        return {
          tabs: [
            ...defaultTabs,
            ...(p?.tabs.filter(
              (t) => t.startsWith("tag:") && available.includes(t),
            ) ?? []),
          ],
        };
      }),
    ),
  );
  app.put("/api/v1/me/feed-preferences", async (c) => {
    const body = await json(c, feedPreferencesSchema);
    return c.json(
      await write(c, "content:write", true, body, async (d, a) => {
        const allowed = [
          ...defaultTabs,
          ...(await catalog(d)).map((t) => "tag:" + t.id),
        ];
        requireValue(
          body.tabs.every((t) => allowed.includes(t)),
          400,
          "VALIDATION_ERROR",
          "Unknown tab.",
        );
        await d.query(
          "INSERT INTO musecity.feed_preferences(account_id,tabs) VALUES($1,$2) ON CONFLICT(account_id) DO UPDATE SET tabs=$2,updated_at=now()",
          [a.account.id, JSON.stringify(body.tabs)],
        );
        return body;
      }),
    );
  });
  app.get("/api/v1/works", async (c) => {
    const params = new URL(c.req.url).searchParams;
    return c.json(
      params.get("mine") === "true"
        ? await authed(c, "content:read", false, (d, a) => feed(d, params, a))
        : await db((d) => feed(d, params)),
    );
  });
  app.get("/api/v1/works/:id", async (c) =>
    c.json(
      c.req.query("draft") === "true"
        ? await authed(c, "content:read", false, (d, a) =>
            workView(d, c.req.param("id")!, a),
          )
        : c.req.header("authorization")
          ? await authed(c, undefined, false, async (d, a) => {
              await community.target(d, "work", c.req.param("id")!, a);
              return workView(d, c.req.param("id")!, undefined, a);
            })
          : await db((d) => workView(d, c.req.param("id")!)),
    ),
  );
  app.post("/api/v1/works", async (c) => {
    const body = await json(c, workSchema);
    return c.json(
      await write(c, "content:write", false, body, (d, a) =>
        createWork(d, a, body),
      ),
      201,
    );
  });
  app.patch("/api/v1/works/:id", async (c) => {
    const body = await json(
      c,
      z.object({ baseRevisionId: z.string(), content: workSchema }).strict(),
    );
    return c.json(
      await write(c, "content:write", false, body, (d, a) =>
        editWork(d, a, c.req.param("id")!, body.baseRevisionId, body.content),
      ),
    );
  });
  for (const action of ["publish", "unpublish"] as const)
    app.post("/api/v1/works/:id/" + action, async (c) => {
      const body = await json(c, z.object({ revisionId: z.string() }).strict());
      return c.json(
        await write(c, "content:publish", false, body, (d, a) =>
          changePublication(d, a, c.req.param("id")!, action, body.revisionId),
        ),
      );
    });
  app.delete("/api/v1/works/:id", async (c) =>
    c.json(
      await write(c, "content:write", true, {}, (d, a) =>
        changePublication(d, a, c.req.param("id")!, "delete"),
      ),
    ),
  );
  app.post("/api/v1/media/uploads", async (c) => {
    const body = await json(
      c,
      z
        .object({
          mimeType: z.enum(["image/jpeg", "image/png", "image/webp"]),
          byteSize: z.number().int().positive().max(20971520),
          purpose: z.enum(["avatar", "content"]).default("content"),
        })
        .strict(),
    );
    return c.json(
      await authed(c, "content:write", false, (d, a) =>
        createUpload(d, a, body.mimeType, body.byteSize, body.purpose),
      ),
      201,
    );
  });
  app.put("/api/v1/uploads/:id", async (c) =>
    c.json(
      await db((d) =>
        d.transaction(() =>
          uploadBytes(d, s.store, c.req.param("id")!, c.req.raw, s.images),
        ),
      ),
    ),
  );
  app.post("/api/v1/media/:id/complete", async (c) =>
    c.json(
      await write(c, "content:write", false, {}, (d, a) =>
        completeUpload(d, a, c.req.param("id")!, s.store),
      ),
    ),
  );
  app.get("/api/v1/media/:id", async (c) =>
    c.json(
      await authed(c, "content:read", false, async (d, a) => {
        const m = await ownMedia(d, a, c.req.param("id")!);
        return {
          mediaId: m.id,
          status: m.status,
          purpose: m.purpose,
          width: m.width,
          height: m.height,
          mimeType: m.mime_type,
          byteSize: m.byte_size,
          etag: m.etag,
        };
      }),
    ),
  );
  app.get("/media/:id", async (c) =>
    c.req.header("authorization")
      ? await authed(c, "content:read", false, (d, a) =>
          imageResponse(
            d,
            s.store,
            c.req.param("id")!,
            a,
            requestedWidth(c.req.url),
            s.images,
          ),
        )
      : await db((d) =>
          imageResponse(
            d,
            s.store,
            c.req.param("id")!,
            undefined,
            requestedWidth(c.req.url),
            s.images,
          ),
        ),
  );
  app.post("/api/v1/agent-registrations", async (c) => {
    const body = await json(
      c,
      z
        .object({
          name: nameSchema,
          requestedScopes: scopesSchema.default(draftScopes),
          invitationToken: z.string().max(100).optional(),
        })
        .strict(),
    );
    return c.json(
      await db((d) =>
        d.transaction(async () => {
          await rateLimit(
            d,
            "registration:" +
              (await digest(c.req.header("cf-connecting-ip") ?? "local")),
            10,
          );
          return agentService.register(
            d,
            body.name,
            body.requestedScopes,
            body.invitationToken,
          );
        }),
      ),
      201,
    );
  });
  const regToken = (c: Context<AppEnv>) => {
    const t = c.req.header("authorization")?.replace(/^Bearer /, "");
    requireValue(
      t?.startsWith("mcr_") && t.length < 100,
      401,
      "INVALID_CREDENTIAL",
      "A registration credential is required.",
    );
    return t!;
  };
  app.get("/api/v1/agent-registrations/:id", async (c) =>
    c.json(
      await db((d) =>
        d.transaction(() =>
          agentService.registrationStatus(d, c.req.param("id")!, regToken(c)),
        ),
      ),
    ),
  );
  app.post("/api/v1/agent-registrations/:id/activate", async (c) =>
    c.json(
      await db((d) =>
        d.transaction(() =>
          agentService.activate(d, c.req.param("id")!, regToken(c)),
        ),
      ),
      201,
    ),
  );
  app.post("/api/v1/agent-registrations/claim-preview", async (c) => {
    const body = await json(
      c,
      z.object({ claimToken: z.string().max(100) }).strict(),
    );
    return c.json(
      await db((d) => agentService.claimPreview(d, body.claimToken)),
    );
  });
  app.post("/api/v1/agent-registrations/:id/claim", async (c) => {
    const body = await json(
      c,
      confirmSchema
        .extend({
          claimToken: z.string().max(100),
          approvedScopes: scopesSchema,
        })
        .strict(),
    );
    return c.json(
      await authed(c, undefined, true, (d, a) =>
        agentService.claim(
          d,
          a,
          c.req.param("id")!,
          body.claimToken,
          body.approvedScopes,
        ),
      ),
    );
  });
  app.post("/api/v1/me/agent-invitations", async (c) => {
    const body = await json(
      c,
      confirmSchema.extend({ name: nameSchema, scopes: scopesSchema }).strict(),
    );
    return c.json(
      await authed(c, undefined, true, (d, a) =>
        agentService.invite(d, a, body.name, body.scopes),
      ),
      201,
    );
  });
  for (const name of ["invitations", "registrations"] as const) {
    app.get("/api/v1/me/agent-" + name, async (c) =>
      c.json(await authed(c, undefined, true, dList)),
    );
    async function dList(d: Database, a: Actor) {
      return d.query(
        `SELECT id,name,expires_at,${name === "invitations" ? "used_at,cancelled_at,scopes" : "status,approved_scopes"} FROM musecity.${name} WHERE owner_account_id=$1 ORDER BY created_at DESC LIMIT 100`,
        [a.account.id],
      );
    }
    app.delete("/api/v1/me/agent-" + name + "/:id", async (c) =>
      c.json(
        await authed(c, undefined, true, async (d, a) => {
          const rows = await d.query(
            name === "invitations"
              ? "UPDATE musecity.invitations SET cancelled_at=now() WHERE id=$1 AND owner_account_id=$2 AND used_at IS NULL RETURNING id"
              : "UPDATE musecity.registrations SET status='cancelled' WHERE id=$1 AND owner_account_id=$2 AND status<>'activated' RETURNING id",
            [c.req.param("id")!, a.account.id],
          );
          requireValue(
            rows.length,
            404,
            "NOT_FOUND",
            "Pending request not found.",
          );
          return { cancelled: true };
        }),
      ),
    );
  }
  app.get("/api/v1/me/agents", async (c) =>
    c.json(
      await authed(c, undefined, true, async (d, a) =>
        (
          await d.query<AgentRow>(
            "SELECT * FROM musecity.agents WHERE owner_account_id=$1 ORDER BY created_at DESC",
            [a.account.id],
          )
        ).map(agentService.agentView),
      ),
    ),
  );
  app.get("/api/v1/me/agents/:id", async (c) =>
    c.json(
      await authed(c, undefined, true, async (d, a) => {
        const ag = await agentService.ownAgent(d, a, c.req.param("id")!);
        return {
          ...agentService.agentView(ag),
          credentials: await d.query(
            "SELECT prefix,expires_at,revoked_at FROM musecity.credentials WHERE agent_id=$1 ORDER BY created_at DESC",
            [ag.id],
          ),
        };
      }),
    ),
  );
  app.get("/api/v1/me/agents/:id/activity", async (c) =>
    c.json(
      await authed(c, undefined, true, async (d, a) => {
        await agentService.ownAgent(d, a, c.req.param("id")!);
        return d.query(
          "SELECT id,action,resource_id,created_at FROM musecity.activity WHERE agent_id=$1 OR resource_id=$1 ORDER BY created_at DESC LIMIT 100",
          [c.req.param("id")!],
        );
      }),
    ),
  );
  app.patch("/api/v1/me/agents/:id", async (c) => {
    const body = await json(
      c,
      confirmSchema
        .extend({
          name: nameSchema.optional(),
          scopes: scopesSchema.optional(),
          publicVisible: z.boolean().optional(),
          description: z.string().trim().max(300).optional(),
        })
        .strict(),
    );
    return c.json(
      await authed(c, undefined, true, (d, a) =>
        agentService.changeAgent(d, a, c.req.param("id")!, "edit", body),
      ),
    );
  });
  for (const action of ["pause", "resume", "revoke", "rotate"])
    app.post(
      "/api/v1/me/agents/:id/" +
        (action === "rotate" ? "credentials/rotate" : action),
      async (c) => {
        await json(c, confirmSchema.strict());
        return c.json(
          await authed(c, undefined, true, (d, a) =>
            agentService.changeAgent(d, a, c.req.param("id")!, action),
          ),
        );
      },
    );
  app.get("/api/v1/agent", async (c) =>
    c.json(
      await authed(
        c,
        undefined,
        false,
        async (_, a) => {
          requireValue(
            a.agent,
            403,
            "SCOPE_DENIED",
            "Use an agent credential.",
          );
          return {
            ...agentService.agentView(a.agent),
            owner: profile(a.account),
          };
        },
        true,
      ),
    ),
  );
  const publicRead = <T>(
    c: Context<AppEnv>,
    fn: (d: Database, a?: Actor) => Promise<T>,
  ) =>
    c.req.header("authorization")
      ? authed(c, undefined, false, fn)
      : db((d) => fn(d));
  const governanceRead = <T>(
    c: Context<AppEnv>,
    fn: (d: Database, a?: Actor) => Promise<T>,
  ) =>
    c.req.header("authorization")
      ? authed(c, undefined, true, fn)
      : db((d) => fn(d));
  app.get("/api/v1/proposals", async (c) =>
    c.json(
      await governanceRead(c, (d, a) =>
        governance.proposals(d, new URL(c.req.url).searchParams, a),
      ),
    ),
  );
  app.get("/api/v1/proposals/:id", async (c) =>
    c.json(
      await governanceRead(c, (d, a) =>
        governance.proposalView(d, c.req.param("id")!, a),
      ),
    ),
  );
  app.post("/api/v1/proposals", async (c) => {
    const body = await json(c, proposalSchema);
    return c.json(
      await authed(c, "content:write", true, async (d, a) => {
        const proposalId = await deduplicate(
          d,
          a,
          "POST:/api/v1/proposals",
          c.req.header("Idempotency-Key") ?? null,
          body,
          () => governance.createProposal(d, a, s.wallets, body),
        );
        return governance.proposalView(d, proposalId, a);
      }),
      201,
    );
  });
  app.put("/api/v1/proposals/:id/vote", async (c) => {
    const body = await json(c, voteSchema);
    return c.json(
      await authed(c, "content:write", true, async (d, a) => {
        await deduplicate(
          d,
          a,
          "PUT:" + c.req.path,
          c.req.header("Idempotency-Key") ?? null,
          body,
          () =>
            governance.vote(d, a, s.wallets, c.req.param("id")!, body.choice),
        );
        return governance.proposalView(d, c.req.param("id")!, a);
      }),
    );
  });
  app.post("/api/v1/proposals/:id/cancel", async (c) => {
    const body = await json(c, cancelProposalSchema);
    return c.json(
      await authed(c, "content:write", true, async (d, a) => {
        await deduplicate(
          d,
          a,
          "POST:" + c.req.path,
          c.req.header("Idempotency-Key") ?? null,
          body,
          () =>
            governance.cancelProposal(d, a, c.req.param("id")!, body.reason),
        );
        return governance.proposalView(d, c.req.param("id")!, a);
      }),
    );
  });
  app.post("/api/v1/proposals/:id/execution", async (c) => {
    const body = await json(c, executionSchema);
    return c.json(
      await authed(c, "content:write", true, async (d, a) => {
        await deduplicate(
          d,
          a,
          "POST:" + c.req.path,
          c.req.header("Idempotency-Key") ?? null,
          body,
          () =>
            governance.recordExecution(d, a, c.req.param("id")!, body.result),
        );
        return governance.proposalView(d, c.req.param("id")!, a);
      }),
    );
  });
  app.get("/api/v1/feed", async (c) =>
    c.json(
      await publicRead(c, (d, a) =>
        community.communityFeed(d, new URL(c.req.url).searchParams, a),
      ),
    ),
  );
  app.get("/api/v1/me/saved", async (c) =>
    c.json(
      await authed(c, undefined, true, (d, a) =>
        community.savedContent(d, a, new URL(c.req.url).searchParams),
      ),
    ),
  );
  for (const kind of ["work", "post", "comment"] as const) {
    app.put("/api/v1/" + kind + "s/:id/interactions", async (c) => {
      const body = await json(c, interactionSchema);
      return c.json(
        await authed(c, undefined, true, async (d, a) => {
          const targetId = c.req.param("id")!;
          // Visibility is checked even on retries; replay never restores a stale choice.
          await community.interactionTarget(d, kind, targetId, a);
          await deduplicate(
            d,
            a,
            "PUT:" + c.req.path,
            c.req.header("Idempotency-Key") ?? null,
            body,
            () => setInteraction(d, a, kind, targetId, body),
          );
          return (
            await interactionSummaries(d, [{ kind, id: targetId }], a)
          ).get(kind + ":" + targetId)!;
        }),
      );
    });
  }
  app.get("/api/v1/neighbors", async (c) =>
    c.json(
      await publicRead(c, (d, a) =>
        community.neighbors(d, new URL(c.req.url).searchParams, a),
      ),
    ),
  );
  app.get("/api/v1/neighbors/:handle", async (c) =>
    c.json(
      await publicRead(c, (d, a) =>
        community.neighbor(d, c.req.param("handle")!, a),
      ),
    ),
  );
  app.get("/api/v1/posts/:id", async (c) =>
    c.json(
      await publicRead(c, (d, a) =>
        community.postView(d, c.req.param("id")!, a),
      ),
    ),
  );
  app.post("/api/v1/posts", async (c) => {
    const body = await json(c, postSchema);
    return c.json(
      await write(c, "community:post", false, body, (d, a) =>
        community.savePost(d, a, body),
      ),
      201,
    );
  });
  app.patch("/api/v1/posts/:id", async (c) => {
    const body = await json(
      c,
      z
        .object({ revision: z.number().int().positive(), content: postSchema })
        .strict(),
    );
    return c.json(
      await write(c, "community:post", false, body, (d, a) =>
        community.savePost(
          d,
          a,
          body.content,
          c.req.param("id")!,
          body.revision,
        ),
      ),
    );
  });
  app.delete("/api/v1/posts/:id", async (c) => {
    const body = await json(
      c,
      z.object({ revision: z.number().int().positive() }).strict(),
    );
    return c.json(
      await write(c, "community:post", true, body, (d, a) =>
        community.changePost(d, a, c.req.param("id")!, body.revision),
      ),
    );
  });
  app.patch("/api/v1/posts/:id/status", async (c) => {
    const body = await json(
      c,
      z
        .object({
          revision: z.number().int().positive(),
          status: z.enum(helpStatuses),
        })
        .strict(),
    );
    return c.json(
      await write(c, "community:post", true, body, (d, a) =>
        community.changePost(
          d,
          a,
          c.req.param("id")!,
          body.revision,
          body.status,
        ),
      ),
    );
  });
  for (const kind of ["work", "post"] as const) {
    app.get(`/api/v1/${kind}s/:id/comments`, async (c) =>
      c.json(
        await publicRead(c, (d, a) =>
          community.comments(
            d,
            kind,
            c.req.param("id")!,
            new URL(c.req.url).searchParams,
            a,
          ),
        ),
      ),
    );
    app.post(`/api/v1/${kind}s/:id/comments`, async (c) => {
      const body = await json(
        c,
        z
          .object({
            text: z.string().trim().min(1).max(2000),
            parentId: z.string().optional(),
          })
          .strict(),
      );
      return c.json(
        await write(c, "community:reply", false, body, (d, a) =>
          community.reply(
            d,
            a,
            kind,
            c.req.param("id")!,
            body.text,
            body.parentId,
          ),
        ),
        201,
      );
    });
  }
  app.delete("/api/v1/comments/:id", async (c) =>
    c.json(
      await write(c, "community:reply", true, {}, (d, a) =>
        community.deleteComment(d, a, c.req.param("id")!),
      ),
    ),
  );
  app.get("/api/v1/me/relationships/:id", async (c) =>
    c.json(
      await authed(c, undefined, true, (d, a) =>
        community.relation(d, a, c.req.param("id")!),
      ),
    ),
  );
  for (const resource of ["follows", "blocks"] as const) {
    for (const method of ["PUT", "DELETE"] as const)
      app.on(method, `/api/v1/me/${resource}/:id`, async (c) =>
        c.json(
          await write(c, "content:write", true, {}, (d, a) =>
            (resource === "follows" ? community.follow : community.block)(
              d,
              a,
              c.req.param("id")!,
              method === "PUT",
            ),
          ),
        ),
      );
  }
  app.get("/api/v1/me/blocks", async (c) =>
    c.json(
      await authed(c, undefined, true, (d, a) =>
        d.query<{ id: string; name: string; handle: string }>(
          "SELECT a.id,a.name,a.handle FROM musecity.blocks b JOIN musecity.accounts a ON a.id=b.blocked_id WHERE b.blocker_id=$1 ORDER BY b.created_at DESC",
          [a.account.id],
        ),
      ),
    ),
  );
  app.get("/api/v1/me/notifications", async (c) =>
    c.json(
      await authed(c, undefined, true, (d, a) =>
        community.notifications(d, a, new URL(c.req.url).searchParams),
      ),
    ),
  );
  app.post("/api/v1/me/notifications/read", async (c) => {
    const body = await json(
      c,
      z.object({ ids: z.array(z.string()).min(1).max(100) }).strict(),
    );
    return c.json(
      await write(c, "content:write", true, body, async (d, a) => {
        await d.query(
          "UPDATE musecity.notifications SET read_at=COALESCE(read_at,now()) WHERE recipient_id=$1 AND id=ANY($2::text[])",
          [a.account.id, body.ids],
        );
        return { read: true };
      }),
    );
  });
  app.post("/api/v1/reports", async (c) => {
    const body = await json(
      c,
      z
        .object({
          targetKind: z.enum([
            "work",
            "post",
            "comment",
            "account",
            "proposal",
          ]),
          targetId: z.string(),
          reason: z.string().trim().min(5).max(1000),
        })
        .strict(),
    );
    return c.json(
      await write(c, "content:write", true, body, (d, a) =>
        community.report(d, a, body.targetKind, body.targetId, body.reason),
      ),
      201,
    );
  });
  app.get("/api/v1/moderation/reports", async (c) =>
    c.json(
      await authed(c, undefined, true, (d, a) =>
        community.reports(d, a, new URL(c.req.url).searchParams),
      ),
    ),
  );
  app.post("/api/v1/moderation/reports/:id", async (c) => {
    const body = await json(
      c,
      z
        .object({
          action: z.enum(["hide", "dismiss", "restore"]),
          confirmed: z.literal(true),
        })
        .strict(),
    );
    return c.json(
      await write(c, "content:write", true, body, (d, a) =>
        community.resolveReport(d, a, c.req.param("id")!, body.action),
      ),
    );
  });
  app.notFound((c) =>
    c.json(
      {
        error: { code: "NOT_FOUND", message: "Endpoint not found." },
        requestId: c.get("requestId"),
      },
      404,
    ),
  );
  return app;
}
