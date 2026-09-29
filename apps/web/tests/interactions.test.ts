import { beforeEach, describe, expect, it } from "vitest";
import { fixture, reset, article, config } from "./helpers";
import { withDatabase } from "../src/server/database";
import { scopes } from "../src/shared/contracts";
import { openapi } from "../src/server/discovery";
import type { InteractionInput } from "../src/shared/interactions";
beforeEach(reset);
const zero = {
  up: 0,
  down: 0,
  likes: 0,
  viewer: { vote: null, liked: false, saved: false },
};
const write = (
  f: ReturnType<typeof fixture>,
  path: string,
  body: InteractionInput,
  options = {},
) =>
  f.call(path + "/interactions", {
    method: "PUT",
    token: "fixture:bob",
    body,
    ...options,
  });
async function content(f: ReturnType<typeof fixture>, token = "fixture:alice") {
  const draft = await f.call("/works", {
    method: "POST",
    token,
    body: article,
  });
  expect(draft.status).toBe(201);
  const work = await f.call(`/works/${draft.data.workId}/publish`, {
    method: "POST",
    token,
    body: { revisionId: draft.data.revisionId },
  });
  expect(work.status).toBe(200);
  const post = await f.call("/posts", {
    method: "POST",
    token,
    body: { kind: "update", text: "An update with interactions" },
  });
  const secondPost = await f.call("/posts", {
    method: "POST",
    token,
    body: {
      kind: "update",
      text: "Please review",
    },
  });
  const comment = await f.call(`/posts/${post.data.id}/comments`, {
    method: "POST",
    token,
    body: { text: "A thoughtful reply" },
  });
  expect(comment.status).toBe(201);
  return {
    work: work.data,
    post: post.data,
    secondPost: secondPost.data,
    comment: comment.data,
    paths: [
      `/works/${work.data.workId}`,
      `/posts/${post.data.id}`,
      `/posts/${secondPost.data.id}`,
      `/comments/${comment.data.id}`,
    ],
  };
}
async function agent(f: ReturnType<typeof fixture>) {
  const invitation = await f.call("/me/agent-invitations", {
    method: "POST",
    body: { name: "Community Muse", scopes: [...scopes], confirmed: true },
  });
  const registration = await f.call("/agent-registrations", {
    method: "POST",
    token: null,
    body: {
      name: "Community Muse",
      requestedScopes: [...scopes],
      invitationToken: invitation.data.invitationToken,
    },
  });
  const activated = await f.call(
    `/agent-registrations/${registration.data.registrationId}/activate`,
    { method: "POST", token: registration.data.registrationToken },
  );
  expect(activated.status).toBe(201);
  return activated.data.credential.token as string;
}
const admin = (sql: string, values: unknown[] = []) =>
  withDatabase(config.testAdminUrl, (db) => db.query(sql, values));

describe("content interactions through real isolated PostgreSQL", () => {
  it("supports votes, independent likes and private saves on human and Agent creations, updates and replies", async () => {
    const f = fixture(),
      token = await agent(f);
    for (const author of ["fixture:alice", token]) {
      const c = await content(f, author);
      for (const path of c.paths) {
        expect(
          (await write(f, path, { action: "vote", value: "up" })).data,
        ).toEqual({ ...zero, up: 1, viewer: { ...zero.viewer, vote: "up" } });
        expect(
          (await write(f, path, { action: "like", value: true })).data,
        ).toMatchObject({
          up: 1,
          likes: 1,
          viewer: { vote: "up", liked: true, saved: false },
        });
        expect(
          (await write(f, path, { action: "save", value: true })).data,
        ).toMatchObject({
          up: 1,
          likes: 1,
          viewer: { vote: "up", liked: true, saved: true },
        });
        expect(
          (await write(f, path, { action: "vote", value: "down" })).data,
        ).toMatchObject({
          up: 0,
          down: 1,
          likes: 1,
          viewer: { vote: "down", saved: true },
        });
        expect(
          (await write(f, path, { action: "vote", value: null })).data,
        ).toMatchObject({ up: 0, down: 0, likes: 1 });
      }
    }
    const saved = await f.call("/me/saved", { token: "fixture:bob" });
    expect(saved.data.items).toHaveLength(8);
    expect(saved.data.items.filter((item: any) => item.agent)).toHaveLength(4);
    expect(saved.response.headers.get("cache-control")).toBe(
      "private, no-store",
    );
  });

  it("keeps totals consistent across detail/feed/comments and hides viewer state from other accounts, guests and Agents", async () => {
    const f = fixture(),
      token = await agent(f),
      c = await content(f, token);
    for (const path of c.paths) {
      await write(f, path, { action: "vote", value: "up" });
      await write(f, path, { action: "like", value: true });
      await write(f, path, { action: "save", value: true });
    }
    for (const viewer of [null, "fixture:alice", "fixture:bob", token]) {
      const expectedViewer =
        viewer === "fixture:bob"
          ? { vote: "up", liked: true, saved: true }
          : viewer === "fixture:alice"
            ? zero.viewer
            : null;
      for (const path of c.paths.slice(0, 3)) {
        expect(
          (await f.call(path, { token: viewer })).data.interactions,
        ).toEqual({ up: 1, down: 0, likes: 1, viewer: expectedViewer });
      }
      const feed = await f.call("/feed", { token: viewer });
      expect(feed.data.items).toHaveLength(3);
      for (const item of feed.data.items)
        expect((item.work ?? item.post).interactions).toEqual({
          up: 1,
          down: 0,
          likes: 1,
          viewer: expectedViewer,
        });
      const comments = await f.call(`/posts/${c.post.id}/comments`, {
        token: viewer,
      });
      expect(comments.data.items[0].interactions).toEqual({
        up: 1,
        down: 0,
        likes: 1,
        viewer: expectedViewer,
      });
    }
    expect((await f.call("/me/saved")).data.items).toEqual([]);
    for (const path of [
      "/me/saved?owner=alice",
      "/me/saved?accountId=anything",
    ])
      expect((await f.call(path)).status).toBe(400);
  });

  it("deduplicates concurrent same-account actions, accepts independent accounts and never reapplies an old replay", async () => {
    const f = fixture(),
      c = await content(f),
      path = c.paths[0],
      key = crypto.randomUUID();
    const votes = await Promise.all(
      Array.from({ length: 8 }, () =>
        write(f, path, { action: "vote", value: "up" }, { key }),
      ),
    );
    expect(votes.every((r) => r.status === 200 && r.data.up === 1)).toBe(true);
    await write(f, path, { action: "vote", value: "up" });
    await write(
      f,
      path,
      { action: "vote", value: "up" },
      { token: "fixture:alice" },
    );
    expect(
      (await write(f, path, { action: "vote", value: "down" })).data,
    ).toMatchObject({ up: 1, down: 1 });
    expect(
      (await write(f, path, { action: "vote", value: "up" }, { key })).data,
    ).toMatchObject({ up: 1, down: 1, viewer: { vote: "down" } });
    expect(
      (await write(f, path, { action: "vote", value: "down" }, { key })).status,
    ).toBe(409);
    expect(
      await admin("SELECT * FROM musecity.content_interactions"),
    ).toHaveLength(2);
  });

  it("unsaves and unlikes without clearing votes, and repeated saves do not reorder the collection", async () => {
    const f = fixture(),
      c = await content(f),
      path = c.paths[0];
    await write(f, path, { action: "save", value: true });
    const first = (await f.call("/me/saved", { token: "fixture:bob" })).data
      .items[0].savedAt;
    await write(f, c.paths[1], { action: "save", value: true });
    await write(f, path, { action: "save", value: true });
    const saved = (await f.call("/me/saved", { token: "fixture:bob" })).data
      .items;
    expect(saved.map((i: any) => i.id)).toEqual([c.post.id, c.work.workId]);
    expect(saved[1].savedAt).toBe(first);
    await write(f, path, { action: "vote", value: "down" });
    await write(f, path, { action: "like", value: true });
    await write(f, path, { action: "like", value: false });
    expect(
      (await write(f, path, { action: "save", value: false })).data,
    ).toEqual({
      up: 0,
      down: 1,
      likes: 0,
      viewer: { vote: "down", liked: false, saved: false },
    });
  });

  it("rejects missing/forged authentication, Agent writes, invalid input and missing idempotency keys", async () => {
    const f = fixture(),
      token = await agent(f),
      c = await content(f);
    for (const actor of [null, "invalid", token]) {
      for (const path of c.paths)
        expect(
          (
            await write(
              f,
              path,
              { action: "save", value: true },
              { token: actor },
            )
          ).status,
        ).toBe(actor === token ? 403 : 401);
      expect((await f.call("/me/saved", { token: actor })).status).toBe(
        actor === token ? 403 : 401,
      );
    }
    for (const body of [
      { action: "vote", value: "up", accountId: "forged" },
      { action: "vote", value: 10 },
      { action: "like", value: "true" },
      { action: "save", value: true, agentId: "forged" },
      { action: "share", value: true },
    ]) {
      expect(
        (await f.call(c.paths[0] + "/interactions", { method: "PUT", body }))
          .status,
      ).toBe(400);
    }
    expect(
      (await write(f, c.paths[0], { action: "vote", value: "up" }, { key: "" }))
        .status,
    ).toBe(400);
    expect(
      (await write(f, "/posts/missing", { action: "like", value: true }))
        .status,
    ).toBe(404);
  });

  it("rechecks visibility on cached retries and excludes blocked households and their comments from saved lists", async () => {
    const f = fixture(),
      c = await content(f),
      alice = (await f.call("/me")).data,
      key = crypto.randomUUID();
    for (const path of c.paths)
      await write(f, path, { action: "save", value: true }, { key });
    await f.call(`/me/blocks/${alice.id}`, {
      token: "fixture:bob",
      method: "PUT",
    });
    expect(
      (await f.call("/me/saved", { token: "fixture:bob" })).data.items,
    ).toEqual([]);
    for (const path of c.paths)
      expect(
        (await write(f, path, { action: "save", value: true }, { key })).status,
      ).toBe(404);
    await f.call(`/me/blocks/${alice.id}`, {
      token: "fixture:bob",
      method: "DELETE",
    });
    expect(
      (await f.call("/me/saved", { token: "fixture:bob" })).data.items,
    ).toHaveLength(4);
  });

  it("removes unavailable parents, moderated comments and restricted authors from actions and saved projections", async () => {
    const f = fixture(),
      c = await content(f),
      alice = (await f.call("/me")).data;
    for (const path of c.paths)
      await write(f, path, { action: "save", value: true });
    await admin("UPDATE musecity.comments SET blocked=true WHERE id=$1", [
      c.comment.id,
    ]);
    expect(
      (await write(f, c.paths[3], { action: "like", value: true })).status,
    ).toBe(404);
    expect(
      (await f.call("/me/saved", { token: "fixture:bob" })).data.items,
    ).toHaveLength(3);
    await admin("UPDATE musecity.comments SET blocked=false WHERE id=$1", [
      c.comment.id,
    ]);
    await f.call(`/works/${c.work.workId}/unpublish`, {
      method: "POST",
      body: { revisionId: c.work.revisionId },
    });
    await f.call(`/posts/${c.post.id}`, {
      method: "DELETE",
      body: { revision: c.post.revision },
    });
    for (const path of [c.paths[0], c.paths[1], c.paths[3]])
      expect(
        (await write(f, path, { action: "like", value: true })).status,
      ).toBe(404);
    expect(
      (await f.call("/me/saved", { token: "fixture:bob" })).data.items.map(
        (i: any) => i.id,
      ),
    ).toEqual([c.secondPost.id]);
    await admin(
      "UPDATE musecity.accounts SET status='restricted' WHERE id=$1",
      [alice.id],
    );
    expect(
      (await f.call("/me/saved", { token: "fixture:bob" })).data.items,
    ).toEqual([]);
    expect(
      (await write(f, c.paths[2], { action: "like", value: true })).status,
    ).toBe(404);
  });

  it("denies restricted voters and preserves deleted-comment placeholders without interaction state", async () => {
    const f = fixture(),
      c = await content(f),
      bob = (await f.call("/me", { token: "fixture:bob" })).data;
    await write(f, c.paths[3], { action: "vote", value: "up" });
    await f.call(c.paths[3], { method: "DELETE" });
    expect(
      (await write(f, c.paths[3], { action: "save", value: true })).status,
    ).toBe(404);
    const comments = await f.call(`/posts/${c.post.id}/comments`);
    expect(comments.data.items[0]).toMatchObject({
      deleted: true,
      text: "",
      interactions: { up: 0, down: 0, likes: 0, viewer: null },
    });
    await admin(
      "UPDATE musecity.accounts SET status='restricted' WHERE id=$1",
      [bob.id],
    );
    expect(
      (await write(f, c.paths[0], { action: "vote", value: "up" })).status,
    ).toBe(403);
  });

  it("paginates private saves and resolves a shared comment beyond the first discussion page", async () => {
    const f = fixture(),
      c = await content(f),
      ids: string[] = [];
    for (let i = 0; i < 22; i++) {
      const comment = await f.call(`/posts/${c.post.id}/comments`, {
        method: "POST",
        body: { text: `Comment ${i}` },
      });
      ids.push(comment.data.id);
      expect(
        (
          await write(f, `/comments/${comment.data.id}`, {
            action: "save",
            value: true,
          })
        ).status,
      ).toBe(200);
    }
    const first = await f.call("/me/saved", { token: "fixture:bob" });
    expect(first.data.items).toHaveLength(20);
    const second = await f.call(
      "/me/saved?cursor=" + encodeURIComponent(first.data.nextCursor),
      { token: "fixture:bob" },
    );
    expect(second.data.items).toHaveLength(2);
    expect(
      new Set([...first.data.items, ...second.data.items].map((i: any) => i.id))
        .size,
    ).toBe(22);
    expect(
      (
        await f.call(
          "/me/saved?cursor=" + encodeURIComponent(first.data.nextCursor),
        )
      ).status,
    ).toBe(400);
    const shared = first.data.items[0];
    expect(shared.path).toBe(
      `/posts/${c.post.id}?comment=${shared.id}#comment-${shared.id}`,
    );
    const focused = await f.call(
      `/posts/${c.post.id}/comments?focus=${shared.id}`,
      { token: null },
    );
    expect(focused.data.items[0].id).toBe(ids.at(-1));
    expect(
      (await f.call(`/posts/${c.secondPost.id}/comments?focus=${shared.id}`))
        .status,
    ).toBe(404);
  });

  it("keeps reactions through edits without moving the publication time or changing the draft boundary", async () => {
    const f = fixture(),
      c = await content(f);
    await write(f, c.paths[0], { action: "vote", value: "up" });
    const before = (await f.call("/feed")).data.items.find(
      (i: any) => i.id === c.work.workId,
    );
    const edit = await f.call(c.paths[0], {
      method: "PATCH",
      body: {
        baseRevisionId: c.work.revisionId,
        content: { ...article, title: "New revision" },
      },
    });
    expect(
      (await f.call(c.paths[0], { token: "fixture:bob" })).data.body.title,
    ).toBe(article.title);
    await f.call(c.paths[0] + "/publish", {
      method: "POST",
      body: { revisionId: edit.data.revisionId },
    });
    const after = (await f.call("/feed")).data.items.find(
      (i: any) => i.id === c.work.workId,
    );
    expect(after.createdAt).toBe(before.createdAt);
    expect(after.work.interactions.up).toBe(1);
    const draft = await f.call("/works", { method: "POST", body: article });
    expect(
      (
        await write(f, "/works/" + draft.data.workId, {
          action: "save",
          value: true,
        })
      ).status,
    ).toBe(404);
  });

  it("publishes strict interaction contracts and leaves the private table unavailable through PUBLIC", async () => {
    const doc = openapi("https://musecity.example");
    for (const path of [
      "/works/{id}/interactions",
      "/posts/{id}/interactions",
      "/comments/{id}/interactions",
    ]) {
      expect(doc.paths[path]).toMatchObject({
        put: { security: [{ bearer: [] }], requestBody: { required: true } },
      });
    }
    for (const operations of Object.values(doc.paths))
      for (const operation of Object.values(
        operations as Record<
          string,
          { parameters: { name: string; in: string }[] }
        >,
      )) {
        const keys = (operation.parameters ?? []).map(
          (p) => p.in + ":" + p.name,
        );
        expect(new Set(keys).size).toBe(keys.length);
      }
    expect(doc.paths["/me/saved"]).toBeTruthy();
    const grants = await admin(
      "SELECT has_table_privilege('musecity_runtime','musecity.content_interactions','SELECT,INSERT,UPDATE') AS runtime, has_table_privilege('musecity_runtime','musecity.content_interactions','DELETE') AS remove",
    );
    expect(grants[0]).toEqual({ runtime: true, remove: false });
    const publicGrants = await admin(
      "SELECT 1 FROM information_schema.table_privileges WHERE table_schema='musecity' AND table_name='content_interactions' AND grantee='PUBLIC'",
    );
    expect(publicGrants).toEqual([]);
  });
});
