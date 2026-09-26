import { readFileSync } from "node:fs";
import { createApi, type Services } from "../src/server/api";
import { ApiError } from "../src/server/errors";
import { withDatabase } from "../src/server/database";
import { createHash } from "node:crypto";
import { assertLocalTarget } from "../scripts/local-target";
import { localImageProcessor } from "../e2e/image-processor";
export const config = JSON.parse(
  readFileSync(".local/database.json", "utf8"),
) as { testUrl: string; testAdminUrl: string; runtimeUrl: string };
export class TestStore {
  objects = new Map<string, { bytes: ArrayBuffer; etag: string }>();
  async put(key: string, bytes: ArrayBuffer) {
    this.objects.set(key, {
      bytes,
      etag: createHash("sha256").update(new Uint8Array(bytes)).digest("hex"),
    });
  }
  async get(key: string) {
    const value = this.objects.get(key);
    return value
      ? {
          body: new Response(value.bytes).body!,
          httpEtag: value.etag,
          size: value.bytes.byteLength,
        }
      : null;
  }
}
export function fixture(
  connectionString = config.testUrl,
  store = new TestStore(),
) {
  assertLocalTarget(connectionString, "musecity_test", "musecity_app");
  const services: Services = {
    connectionString,
    store,
    origin: "http://localhost",
    images: { process: localImageProcessor, origin: "http://localhost" },
    verify: async (token) => {
      if (!/^fixture:(alice|bob)$/.test(token))
        throw new ApiError(401, "INVALID_CREDENTIAL", "Invalid fixture token");
      return "did:privy:" + token.slice(8);
    },
  };
  const app = createApi(services);
  async function call(
    path: string,
    {
      token = "fixture:alice",
      method = "GET",
      body,
      key = crypto.randomUUID(),
      headers = {},
    }: {
      token?: string | null;
      method?: string;
      body?: unknown;
      key?: string;
      headers?: Record<string, string>;
    } = {},
  ) {
    const r = await app.request(
      "http://localhost" +
        (path.startsWith("/raw-media/")
          ? path.replace("/raw-media/", "/media/")
          : "/api/v1" + path),
      {
        method,
        headers: {
          ...(token ? { Authorization: "Bearer " + token } : {}),
          "Idempotency-Key": key,
          ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
          ...headers,
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      },
    );
    const data = r.headers.get("content-type")?.includes("application/json")
      ? await r.json()
      : null;
    return { status: r.status, data: data as any, response: r };
  }
  return { app, services, call, store };
}
export async function reset() {
  assertLocalTarget(config.testAdminUrl, "musecity_test", "musecity_admin");
  await withDatabase(config.testAdminUrl, (d) =>
    d
      .query(
        "TRUNCATE musecity.accounts,musecity.tags,musecity.agents,musecity.credentials,musecity.invitations,musecity.registrations,musecity.works,musecity.work_revisions,musecity.media,musecity.activity,musecity.idempotency,musecity.rate_limits,musecity.feed_preferences CASCADE",
      )
      .then(async () => {
        await d.query(
          "INSERT INTO musecity.tags(id,name) VALUES('ai-tools','AI tools'),('development','Development'),('design','Design'),('tutorials','Tutorials'),('games','Games'),('experiments','Experiments')",
        );
      }),
  );
}
export const article = {
  type: "article",
  title: "An AI-assisted story",
  description: "A small experiment",
  aiDeclaration: true,
  aiTools: ["Test tool"],
  tagIds: ["design"],
  articleDocument: {
    type: "doc",
    content: [
      {
        type: "heading",
        attrs: { level: 2 },
        content: [{ type: "text", text: "Starting small" }],
      },
      {
        type: "paragraph",
        content: [
          {
            type: "text",
            text: "Hello <script>alert(1)</script>",
            marks: [{ type: "bold" }],
          },
        ],
      },
    ],
  },
};
