import { beforeEach, describe, expect, it } from "vitest";
import { article, config, fixture, reset } from "./helpers";
import { withDatabase } from "../src/server/database";
import { digest } from "../src/server/crypto";
import { assertLocalTarget } from "../scripts/local-target";
import { publishScopes, type Scope } from "../src/shared/contracts";

beforeEach(reset);
const admin = (sql: string, values: unknown[] = []) => {
  assertLocalTarget(config.testAdminUrl, "musecity_test", "musecity_admin");
  return withDatabase(config.testAdminUrl, (db) => db.query(sql, values));
};
async function join(f: ReturnType<typeof fixture>, owner = "alice") {
  const result = await f.call("/me", {
    token: "fixture:" + owner,
    method: "PATCH",
    body: {
      name: owner,
      bio: "Making things together",
      avatarMediaId: null,
      join: true,
    },
  });
  expect(result.status, JSON.stringify(result.data)).toBe(200);
  return result.data;
}
async function agent(f: ReturnType<typeof fixture>, owner = "alice") {
  const scopes: Scope[] = [
    ...publishScopes,
    "community:post",
    "community:reply",
  ];
  const invitation = await f.call("/me/agent-invitations", {
    token: "fixture:" + owner,
    method: "POST",
    body: { name: "Research 设计 Muse", scopes, confirmed: true },
  });
  expect(invitation.status).toBe(201);
  const registration = await f.call("/agent-registrations", {
    token: null,
    method: "POST",
    body: {
      name: "Research 设计 Muse",
      requestedScopes: scopes,
      invitationToken: invitation.data.invitationToken,
    },
  });
  expect(registration.status).toBe(201);
  const activated = await f.call(
    `/agent-registrations/${registration.data.registrationId}/activate`,
    {
      token: registration.data.registrationToken,
      method: "POST",
    },
  );
  expect(activated.status).toBe(201);
  return {
    id: activated.data.agentId as string,
    token: activated.data.credential.token as string,
  };
}
async function publish(
  f: ReturnType<typeof fixture>,
  body: unknown = article,
  token = "fixture:alice",
) {
  const draft = await f.call("/works", { method: "POST", token, body });
  expect(draft.status, JSON.stringify(draft.data)).toBe(201);
  const result = await f.call(`/works/${draft.data.workId}/publish`, {
    method: "POST",
    token,
    body: { revisionId: draft.data.revisionId },
  });
  expect(result.status, JSON.stringify(result.data)).toBe(200);
  return result.data;
}
async function post(
  f: ReturnType<typeof fixture>,
  text: string,
  token = "fixture:alice",
) {
  const result = await f.call("/posts", {
    method: "POST",
    token,
    body: { kind: "update", text },
  });
  expect(result.status, JSON.stringify(result.data)).toBe(201);
  return result.data;
}
const ids = (response: { data: { items: { id: string }[] } }) =>
  response.data.items.map((item) => item.id);
const searchPath = (query: string) => "/feed?q=" + encodeURIComponent(query);

describe("content discovery through the real isolated PostgreSQL API", () => {
  it("rejects the removed help kind, fields, filters and status endpoint for every caller", async () => {
    const f = fixture(),
      ag = await agent(f);
    const update = await post(f, "Only updates remain");
    for (const token of ["fixture:alice", ag.token]) {
      for (const body of [
        { kind: "help", text: "Retired request" },
        { kind: "update", text: "Update", title: "Retired title" },
        { kind: "update", text: "Update", expectedOutcome: "Retired outcome" },
        { kind: "update", text: "Update", helpStatus: "open" },
      ]) {
        expect(
          (await f.call("/posts", { method: "POST", token, body })).status,
        ).toBe(400);
        expect(
          (
            await f.call(`/posts/${update.id}`, {
              method: "PATCH",
              token,
              body: { revision: update.revision, content: body },
            })
          ).status,
        ).toBe(400);
      }
      expect(
        (
          await f.call(`/posts/${update.id}/status`, {
            token,
            method: "PATCH",
            body: { revision: update.revision, status: "resolved" },
          })
        ).status,
      ).toBe(404);
    }
    for (const query of ["kind=help", "help=open", "help=", "help=unanswered"])
      for (const token of [null, "fixture:alice", ag.token])
        expect((await f.call("/feed?" + query, { token })).status).toBe(400);
    for (const query of ["kind=help", "help=open", "help="])
      expect((await f.call("/me/content?" + query)).status).toBe(400);
    for (const path of [`/posts/${update.id}`, "/feed", "/me/content"])
      for (const retired of ["expectedOutcome", "helpStatus"])
        expect(JSON.stringify((await f.call(path)).data)).not.toContain(
          retired,
        );
    expect((await f.call(`/posts/${update.id}`)).data).not.toHaveProperty(
      "title",
    );
  });

  it("replays historical update idempotency snapshots without retired fields or duplicate writes", async () => {
    const f = fixture();
    const content = {
      kind: "update",
      text: "Historical update",
      tagIds: ["design"],
      mediaIds: [],
    };
    const legacy = {
      kind: "update",
      text: content.text,
      title: "",
      expectedOutcome: "",
      tagIds: content.tagIds,
      mediaIds: [],
    };
    const createKey = crypto.randomUUID();
    const created = await f.call("/posts", {
      method: "POST",
      key: createKey,
      body: content,
    });
    expect(created.status).toBe(201);
    await admin(
      "UPDATE musecity.idempotency SET request_hash=$2,response=response||$3::jsonb WHERE key=$1",
      [
        createKey,
        await digest(JSON.stringify(legacy)),
        JSON.stringify({ title: "", expectedOutcome: "", helpStatus: null }),
      ],
    );
    const replay = await f.call("/posts", {
      method: "POST",
      key: createKey,
      body: content,
    });
    expect(replay.status).toBe(201);
    expect(replay.data.id).toBe(created.data.id);
    expect(ids(await f.call("/feed"))).toEqual([created.data.id]);
    const editKey = crypto.randomUUID();
    const editedContent = { ...content, text: "Historical edited update" };
    const editBody = { revision: 1, content: editedContent };
    const edit = await f.call(`/posts/${created.data.id}`, {
      method: "PATCH",
      key: editKey,
      body: editBody,
    });
    expect(edit.status).toBe(200);
    await admin(
      "UPDATE musecity.idempotency SET request_hash=$2,response=response||$3::jsonb WHERE key=$1",
      [
        editKey,
        await digest(
          JSON.stringify({
            revision: 1,
            content: { ...legacy, text: editedContent.text },
          }),
        ),
        JSON.stringify({ title: "", expectedOutcome: "", helpStatus: null }),
      ],
    );
    const editReplay = await f.call(`/posts/${created.data.id}`, {
      method: "PATCH",
      key: editKey,
      body: editBody,
    });
    expect(editReplay.status).toBe(200);
    expect(editReplay.data.revision).toBe(edit.data.revision);
    for (const result of [replay, editReplay])
      for (const field of ["title", "expectedOutcome", "helpStatus"])
        expect(result.data).not.toHaveProperty(field);
    expect(
      (
        await f.call("/posts", {
          method: "POST",
          key: createKey,
          body: { ...content, text: "Different" },
        })
      ).status,
    ).toBe(409);
    const stored = await admin(
      "SELECT response FROM musecity.idempotency WHERE key=ANY($1)",
      [[createKey, editKey]],
    );
    expect(stored).toHaveLength(2);
    for (const row of stored)
      expect(row.response).toHaveProperty("helpStatus", null);
  });

  it("searches published title, description, article text and updates using literal bilingual AND terms", async () => {
    const f = fixture();
    const work = await publish(f, {
      ...article,
      title: "React 设计工具",
      description: "A distinct-description",
      aiTools: ["tool-only-secret"],
      articleDocument: {
        type: "doc",
        content: [
          {
            type: "paragraph",
            content: [
              { type: "text", text: "持久", marks: [{ type: "bold" }] },
              { type: "text", text: "记忆与搜索" },
              {
                type: "text",
                text: " visible-link",
                marks: [
                  {
                    type: "link",
                    attrs: { href: "https://example.com/link-only-secret" },
                  },
                ],
              },
            ],
          },
          {
            type: "codeBlock",
            content: [{ type: "text", text: "code-sentinel" }],
          },
        ],
      },
    });
    const update = await post(f, "更新 REACT 设计 100% _literal_ \\path");
    await f.call(`/works/${work.workId}/comments`, {
      token: "fixture:bob",
      method: "POST",
      body: { text: "comment-only-secret" },
    });
    expect(
      ids(await f.call(searchPath("  react   设计  "), { token: null })),
    ).toEqual([update.id, work.workId]);
    for (const q of ["持久记忆", "distinct-description", "code-sentinel"])
      expect(ids(await f.call(searchPath(q), { token: null }))).toEqual([
        work.workId,
      ]);
    const bodyMatch = await f.call(searchPath("持久记忆"), { token: null });
    expect(bodyMatch.data.items[0].matchExcerpt).toContain("持久记忆");
    expect(bodyMatch.data.items[0].work.body).not.toHaveProperty(
      "articleDocument",
    );
    for (const q of ["%", "_literal_", "\\path"])
      expect(ids(await f.call(searchPath(q), { token: null }))).toEqual([
        update.id,
      ]);
    for (const q of [
      "tool-only-secret",
      "link-only-secret",
      "comment-only-secret",
      "articleDocument",
      "react absentword",
    ])
      expect(ids(await f.call(searchPath(q), { token: null }))).toEqual([]);
    expect(ids(await f.call(searchPath(" \t "), { token: null }))).toEqual([
      update.id,
      work.workId,
    ]);
    expect(
      (await f.call(searchPath("x".repeat(121)), { token: null })).status,
    ).toBe(400);
    expect(
      (await f.call(searchPath("x".repeat(120)), { token: null })).status,
    ).toBe(200);
  });

  it("keeps draft-only text out of search until explicit publication and removes withdrawn content", async () => {
    const f = fixture();
    const work = await publish(f, { ...article, title: "Public-sentinel" });
    const edited = await f.call(`/works/${work.workId}`, {
      method: "PATCH",
      body: {
        baseRevisionId: work.revisionId,
        content: { ...article, title: "Private-sentinel" },
      },
    });
    expect(edited.status).toBe(200);
    const privateDraft = await f.call("/works", {
      method: "POST",
      body: { ...article, title: "Never-public-sentinel" },
    });
    expect(privateDraft.status).toBe(201);
    for (const token of [null, "fixture:alice"]) {
      expect(
        ids(await f.call(searchPath("Private-sentinel"), { token })),
      ).toEqual([]);
      expect(
        ids(await f.call(searchPath("Never-public-sentinel"), { token })),
      ).toEqual([]);
      const visible = await f.call(searchPath("Public-sentinel"), { token });
      expect(ids(visible)).toEqual([work.workId]);
      expect(JSON.stringify(visible.data)).not.toContain("Private-sentinel");
    }
    expect(
      (
        await f.call(`/works/${work.workId}/publish`, {
          method: "POST",
          body: { revisionId: edited.data.revisionId },
        })
      ).status,
    ).toBe(200);
    expect(
      ids(await f.call(searchPath("Public-sentinel"), { token: null })),
    ).toEqual([]);
    expect(
      ids(await f.call(searchPath("Private-sentinel"), { token: null })),
    ).toEqual([work.workId]);
    expect(
      (
        await f.call(`/works/${work.workId}/unpublish`, {
          method: "POST",
          body: { revisionId: edited.data.revisionId },
        })
      ).status,
    ).toBe(200);
    expect(
      ids(await f.call(searchPath("Private-sentinel"), { token: null })),
    ).toEqual([]);
  });

  it("applies visibility before search results, excerpts and pagination", async () => {
    const f = fixture(),
      alice = await join(f);
    await join(f, "bob");
    const work = await publish(f, { ...article, title: "Visibility needle" });
    const update = await post(f, "Visibility needle");
    expect(
      ids(await f.call(searchPath("visibility"), { token: null })),
    ).toEqual([update.id, work.workId]);
    await f.call(`/me/blocks/${alice.id}`, {
      token: "fixture:bob",
      method: "PUT",
    });
    expect(
      ids(await f.call(searchPath("visibility"), { token: "fixture:bob" })),
    ).toEqual([]);
    expect(
      ids(await f.call(searchPath("visibility"), { token: null })),
    ).toHaveLength(2);
    await admin("UPDATE musecity.works SET blocked=true WHERE id=$1", [
      work.workId,
    ]);
    await f.call(`/posts/${update.id}`, {
      method: "DELETE",
      body: { revision: update.revision },
    });
    expect(
      ids(await f.call(searchPath("visibility"), { token: null })),
    ).toEqual([]);
    await admin("UPDATE musecity.works SET blocked=false WHERE id=$1", [
      work.workId,
    ]);
    await admin(
      "UPDATE musecity.accounts SET status='restricted' WHERE id=$1",
      [alice.id],
    );
    expect(
      ids(await f.call(searchPath("visibility"), { token: null })),
    ).toEqual([]);
  });

  it("paginates matched content at tied publication times and binds cursors to query, filters and identity", async () => {
    const f = fixture(),
      alice = await join(f);
    const work = await publish(f, { ...article, title: "分页 React" });
    await admin(
      `INSERT INTO musecity.posts(id,owner_account_id,kind,text,created_at)
      SELECT 'search-post-'||lpad(i::text,2,'0'),$1,'update','分页 REACT match','2026-09-01T00:00:00Z'::timestamptz FROM generate_series(1,23) i`,
      [alice.id],
    );
    await admin(
      "UPDATE musecity.works SET first_published_at='2026-09-01T00:00:00Z' WHERE id=$1",
      [work.workId],
    );
    await post(f, "Newer unrelated content");
    const first = await f.call(searchPath("分页 React"), { token: null });
    expect(first.status).toBe(200);
    expect(first.data.items).toHaveLength(20);
    const cursor = encodeURIComponent(first.data.nextCursor);
    const second = await f.call(
      searchPath("分页 React") + "&cursor=" + cursor,
      { token: null },
    );
    expect(second.data.items).toHaveLength(4);
    expect(second.data.nextCursor).toBeNull();
    const expected = [
      work.workId,
      ...Array.from(
        { length: 23 },
        (_, i) => "search-post-" + String(i + 1).padStart(2, "0"),
      ),
    ]
      .sort()
      .reverse();
    expect([...ids(first), ...ids(second)]).toEqual(expected);
    for (const suffix of [
      searchPath("React"),
      searchPath("分页 React") + "&kind=update",
      "/feed",
    ])
      expect(
        (
          await f.call(
            suffix + (suffix.includes("?") ? "&" : "?") + "cursor=" + cursor,
            { token: null },
          )
        ).status,
      ).toBe(400);
    expect(
      (await f.call(searchPath("分页 React") + "&cursor=" + cursor)).status,
    ).toBe(400);
    const revised = await f.call(`/works/${work.workId}`, {
      method: "PATCH",
      body: {
        baseRevisionId: work.revisionId,
        content: { ...article, title: "分页 React revised" },
      },
    });
    await f.call(`/works/${work.workId}/publish`, {
      method: "POST",
      body: { revisionId: revised.data.revisionId },
    });
    expect(
      ids(await f.call(searchPath("分页 React"), { token: null })),
    ).toEqual(ids(first));
  });

  it("returns at most five recent discussions based on visible replies from other households", async () => {
    const f = fixture(),
      alice = await join(f),
      bob = await join(f, "bob");
    const ag = await agent(f);
    const work = await publish(f);
    const targets = [{ id: work.workId, path: `/works/${work.workId}` }];
    for (let i = 0; i < 6; i++) {
      const created = await post(f, `Older discussion ${i}`);
      targets.push({ id: created.id, path: `/posts/${created.id}` });
    }
    const comments: string[] = [];
    for (const [index, target] of targets.entries()) {
      const reply = await f.call(target.path + "/comments", {
        token: "fixture:bob",
        method: "POST",
        body: { text: `Reply ${index}` },
      });
      expect(reply.status).toBe(201);
      comments.push(reply.data.id);
      await admin(
        "UPDATE musecity.comments SET created_at=date_trunc('milliseconds',now())-$2*interval '1 hour' WHERE id=$1",
        [reply.data.id, index + 1],
      );
    }
    await admin(
      "UPDATE musecity.comments SET created_at=now()-interval '8 days' WHERE id=$1",
      [comments.at(-1)],
    );
    await admin(
      "UPDATE musecity.posts SET created_at=now()-interval '30 days' WHERE owner_account_id=$1",
      [alice.id],
    );
    for (const token of ["fixture:alice", ag.token])
      expect(
        (
          await f.call(targets.at(-1)!.path + "/comments", {
            token,
            method: "POST",
            body: { text: "Own household must not bump a discussion" },
          })
        ).status,
      ).toBe(201);
    expect(ids(await f.call("/discovery", { token: null }))).toEqual(
      targets.slice(0, 5).map((target) => target.id),
    );
    expect(ids(await f.call("/discovery", { token: ag.token }))).toEqual(
      targets.slice(0, 5).map((target) => target.id),
    );
    await admin("UPDATE musecity.comments SET blocked=true WHERE id=$1", [
      comments[0],
    ]);
    expect(ids(await f.call("/discovery", { token: null }))).toEqual(
      targets.slice(1, 6).map((target) => target.id),
    );
    await admin("UPDATE musecity.comments SET deleted=true WHERE id=$1", [
      comments[1],
    ]);
    await admin("UPDATE musecity.posts SET blocked=true WHERE id=$1", [
      targets[2].id,
    ]);
    expect(ids(await f.call("/discovery", { token: null }))).toEqual(
      targets.slice(3, 6).map((target) => target.id),
    );
    await f.call(`/me/blocks/${bob.id}`, { method: "PUT" });
    expect(ids(await f.call("/discovery"))).toEqual([]);
    expect(ids(await f.call("/discovery", { token: ag.token }))).toEqual([]);
    expect(ids(await f.call("/discovery", { token: null }))).toHaveLength(3);
    await admin(
      "UPDATE musecity.accounts SET status='restricted' WHERE id=$1",
      [bob.id],
    );
    expect(ids(await f.call("/discovery", { token: null }))).toEqual([]);
  });

  it("discovers only opted-in Agents of joined active owners, including paused public cards", async () => {
    const f = fixture(),
      alice = await join(f),
      first = await agent(f),
      second = await agent(f, "bob");
    const path = "/neighbors?view=agents";
    expect(ids(await f.call(path, { token: null }))).toEqual([]);
    for (const [id, owner] of [
      [first.id, "alice"],
      [second.id, "bob"],
    ])
      expect(
        (
          await f.call(`/me/agents/${id}`, {
            token: "fixture:" + owner,
            method: "PATCH",
            body: {
              publicVisible: true,
              description: "双语 research",
              confirmed: true,
            },
          })
        ).status,
      ).toBe(200);
    expect(ids(await f.call(path, { token: null }))).toEqual([first.id]);
    await f.call(`/me/agents/${first.id}/pause`, {
      method: "POST",
      body: { confirmed: true },
    });
    const publicCard = (
      await f.call(path + "&q=" + encodeURIComponent("双语"), { token: null })
    ).data.items[0];
    expect(publicCard).toMatchObject({
      id: first.id,
      name: "Research 设计 Muse",
      description: "双语 research",
      owner: { id: alice.id, handle: alice.handle },
    });
    for (const field of [
      "scopes",
      "status",
      "lastActiveAt",
      "credential",
      "token_hash",
      "privy_user_id",
    ])
      expect(JSON.stringify(publicCard)).not.toContain(field);
    const bob = await join(f, "bob");
    expect(new Set(ids(await f.call(path, { token: null })))).toEqual(
      new Set([first.id, second.id]),
    );
    await f.call(`/me/blocks/${bob.id}`, { method: "PUT" });
    expect(ids(await f.call(path))).toEqual([first.id]);
    await admin(
      "UPDATE musecity.accounts SET status='restricted' WHERE id=$1",
      [bob.id],
    );
    expect(ids(await f.call(path, { token: null }))).toEqual([first.id]);
    await f.call(`/me/agents/${first.id}/revoke`, {
      method: "POST",
      body: { confirmed: true },
    });
    expect(ids(await f.call(path, { token: null }))).toEqual([]);
    expect(
      (await f.call("/neighbors?view=unknown", { token: null })).status,
    ).toBe(400);
  });

  it("scopes an Agent feed by the public owner/card and never switches to another household", async () => {
    const f = fixture(),
      alice = await join(f),
      bob = await join(f, "bob"),
      ag = await agent(f);
    const work = await publish(f, article, ag.token),
      update = await post(f, "Agent update", ag.token);
    await post(f, "Human update");
    const path = `/feed?owner=${alice.handle}&agent=${ag.id}`;
    expect((await f.call(path, { token: null })).status).toBe(404);
    await f.call(`/me/agents/${ag.id}`, {
      method: "PATCH",
      body: { publicVisible: true, confirmed: true },
    });
    expect(ids(await f.call(path, { token: null }))).toEqual([
      update.id,
      work.workId,
    ]);
    expect(
      (
        await f.call(`/feed?owner=${bob.handle}&agent=${ag.id}`, {
          token: null,
        })
      ).status,
    ).toBe(404);
    expect((await f.call(`/feed?agent=${ag.id}`, { token: null })).status).toBe(
      400,
    );
    await f.call(`/me/agents/${ag.id}/pause`, {
      method: "POST",
      body: { confirmed: true },
    });
    expect(ids(await f.call(path, { token: null }))).toEqual([
      update.id,
      work.workId,
    ]);
    await f.call(`/me/blocks/${alice.id}`, {
      token: "fixture:bob",
      method: "PUT",
    });
    expect((await f.call(path, { token: "fixture:bob" })).status).toBe(404);
    await f.call(`/me/agents/${ag.id}`, {
      method: "PATCH",
      body: { publicVisible: false, confirmed: true },
    });
    expect((await f.call(path, { token: null })).status).toBe(404);
    expect((await f.call(path)).status).toBe(404);
  });

  it("paginates Agent discovery at tied timestamps with view, search and viewer-bound cursors", async () => {
    const f = fixture(),
      alice = await join(f);
    await admin(
      `INSERT INTO musecity.agents(id,owner_account_id,name,description,scopes,public_visible,created_at)
      SELECT 'directory-agent-'||lpad(i::text,2,'0'),$1,'分页 Research '||i,'Design partner','[]'::jsonb,true,'2026-09-01T00:00:00Z'::timestamptz FROM generate_series(1,23) i`,
      [alice.id],
    );
    const path = "/neighbors?view=agents&q=" + encodeURIComponent("分页");
    const first = await f.call(path, { token: null });
    expect(first.data.items).toHaveLength(20);
    const cursor = encodeURIComponent(first.data.nextCursor);
    const second = await f.call(path + "&cursor=" + cursor, { token: null });
    expect(second.data.items).toHaveLength(3);
    expect(new Set([...ids(first), ...ids(second)]).size).toBe(23);
    for (const query of [
      "/neighbors?view=agents&q=Research",
      "/neighbors?q=" + encodeURIComponent("分页"),
    ])
      expect(
        (await f.call(query + "&cursor=" + cursor, { token: null })).status,
      ).toBe(400);
    expect((await f.call(path + "&cursor=" + cursor)).status).toBe(400);
  });
});
