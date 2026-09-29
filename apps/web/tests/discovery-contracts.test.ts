import { beforeEach, expect, it } from "vitest";
import { z } from "zod";
import { openapi } from "../src/server/discovery";
import { publishScopes } from "../src/shared/contracts";
import { article, fixture, reset } from "./helpers";

const doc = openapi("http://localhost");
function validate(
  path: string,
  result: { status: number; data: unknown },
  method = "get",
) {
  expect(result.status).toBe(200);
  const schema = (doc.paths[path] as any)[method].responses[200].content[
    "application/json"
  ].schema;
  const validator = z.fromJSONSchema(
    JSON.parse(
      JSON.stringify({ ...schema, $defs: doc.components.schemas }).replaceAll(
        "#/components/schemas/",
        "#/$defs/",
      ),
    ),
  );
  const parsed = validator.safeParse(result.data);
  expect(parsed.success, JSON.stringify(parsed.error)).toBe(true);
}
beforeEach(reset);
it("validates empty/nonempty public directories, mixed search, discovery and scoped feedback responses", async () => {
  const f = fixture();
  validate("/neighbors", await f.call("/neighbors", { token: null }));
  validate(
    "/neighbors",
    await f.call("/neighbors?view=agents&q=no-match", { token: null }),
  );
  const owner = await f.call("/me", {
    method: "PATCH",
    body: { name: "Contract owner", bio: "", avatarMediaId: null, join: true },
  });
  validate("/neighbors", await f.call("/neighbors", { token: null }));
  const permissions = [
    ...publishScopes,
    "community:post",
    "community:notifications",
  ];
  const invitation = await f.call("/me/agent-invitations", {
    method: "POST",
    body: { name: "Contract Muse", scopes: permissions, confirmed: true },
  });
  const registration = await f.call("/agent-registrations", {
    token: null,
    method: "POST",
    body: {
      name: "Contract Muse",
      requestedScopes: permissions,
      invitationToken: invitation.data.invitationToken,
    },
  });
  const active = await f.call(
    `/agent-registrations/${registration.data.registrationId}/activate`,
    { token: registration.data.registrationToken, method: "POST" },
  );
  const token = active.data.credential.token;
  await f.call(`/me/agents/${active.data.agentId}`, {
    method: "PATCH",
    body: { confirmed: true, publicVisible: true },
  });
  validate(
    "/neighbors",
    await f.call("/neighbors?view=agents", { token: null }),
  );
  const draft = await f.call("/works", {
    token,
    method: "POST",
    body: { ...article, title: "Contract creation" },
  });
  await f.call(`/works/${draft.data.workId}/publish`, {
    token,
    method: "POST",
    body: { revisionId: draft.data.revisionId },
  });
  const post = await f.call("/posts", {
    token,
    method: "POST",
    body: { kind: "update", text: "Contract update" },
  });
  validate(
    "/posts/{id}",
    await f.call(`/posts/${post.data.id}`, { token: null }),
  );
  const feed = await f.call(
    `/feed?q=contract&owner=${owner.data.handle}&agent=${active.data.agentId}`,
    { token: null },
  );
  expect(feed.data.items).toHaveLength(2);
  validate("/feed", feed);
  await f.call(`/posts/${post.data.id}/comments`, {
    token: "fixture:bob",
    method: "POST",
    body: { text: "Contract comment" },
  });
  validate("/discovery", await f.call("/discovery", { token: null }));
  const inbox = await f.call("/agent/notifications", { token });
  validate("/agent/notifications", inbox);
  validate(
    "/agent/notifications/read",
    await f.call("/agent/notifications/read", {
      token,
      method: "POST",
      body: { ids: [inbox.data.items[0].id] },
    }),
    "post",
  );
  validate(
    "/agent/notifications",
    await f.call("/agent/notifications", { token }),
  );
});
