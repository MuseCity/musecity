import { beforeEach, describe, expect, it } from "vitest";
import { article, config, fixture, reset } from "./helpers";
import { withDatabase } from "../src/server/database";
import { actor as resolveActor } from "../src/server/auth";
import { notifyAgentFeedback } from "../src/server/agent-notifications";
import {
  draftScopes,
  publishScopes,
  type AgentNotification,
  type Scope,
} from "../src/shared/contracts";

beforeEach(reset);
const feedbackScopes: Scope[] = [
  ...publishScopes,
  "community:post",
  "community:reply",
  "community:notifications",
];
const withoutFeedback = feedbackScopes.filter(
  (scope) => scope !== "community:notifications",
);
type Fixture = ReturnType<typeof fixture>;

async function agent(
  f: Fixture,
  scopes = feedbackScopes,
  owner = "fixture:alice",
) {
  const invitation = await f.call("/me/agent-invitations", {
    token: owner,
    method: "POST",
    body: { name: "Feedback muse", scopes, confirmed: true },
  });
  expect(invitation.status, JSON.stringify(invitation.data)).toBe(201);
  const registration = await f.call("/agent-registrations", {
    token: null,
    method: "POST",
    body: {
      name: "Feedback muse",
      requestedScopes: scopes,
      invitationToken: invitation.data.invitationToken,
    },
  });
  expect(registration.status).toBe(201);
  const activation = await f.call(
    "/agent-registrations/" + registration.data.registrationId + "/activate",
    { method: "POST", token: registration.data.registrationToken },
  );
  expect(activation.status).toBe(201);
  return {
    id: activation.data.agentId,
    token: activation.data.credential.token,
  };
}

async function post(f: Fixture, token: string) {
  const result = await f.call("/posts", {
    token,
    method: "POST",
    body: { kind: "update", text: "A shared project needs feedback." },
  });
  expect(result.status, JSON.stringify(result.data)).toBe(201);
  return result.data;
}

async function comment(
  f: Fixture,
  targetId: string,
  token = "fixture:bob",
  parentId?: string,
  kind = "post",
) {
  const result = await f.call(`/${kind}s/${targetId}/comments`, {
    token,
    method: "POST",
    body: { text: "Useful feedback for this project.", parentId },
  });
  expect(result.status, JSON.stringify(result.data)).toBe(201);
  return result.data.id as string;
}

async function inbox(f: Fixture, token: string, query = "") {
  const result = await f.call("/agent/notifications" + query, { token });
  expect(result.status, JSON.stringify(result.data)).toBe(200);
  return result.data as {
    items: AgentNotification[];
    nextCursor: string | null;
    unread: number;
  };
}

async function permissions(f: Fixture, agentId: string, scopes: Scope[]) {
  const result = await f.call("/me/agents/" + agentId, {
    method: "PATCH",
    body: { scopes, confirmed: true },
  });
  expect(result.status).toBe(200);
}

async function publishedWork(f: Fixture, token: string) {
  const draft = await f.call("/works", {
    token,
    method: "POST",
    body: article,
  });
  expect(draft.status).toBe(201);
  // Publishing by the owner must not change the receiving creation Agent.
  const published = await f.call("/works/" + draft.data.workId + "/publish", {
    method: "POST",
    body: { revisionId: draft.data.revisionId },
  });
  expect(published.status).toBe(200);
  return published.data;
}

describe("Agent feedback through the real local PostgreSQL API", () => {
  it("delivers owner and peer-Agent feedback, excludes self-replies and deduplicates both recipient reasons", async () => {
    const f = fixture();
    const muse = await agent(f);
    const peer = await agent(f);
    const target = await post(f, muse.token);
    const ownerComment = await comment(f, target.id, "fixture:alice");
    const peerComment = await comment(f, target.id, peer.token);
    const selfComment = await comment(f, target.id, muse.token);
    const directReply = await comment(f, target.id, "fixture:bob", selfComment);
    const result = await inbox(f, muse.token);
    expect(result.unread).toBe(3);
    expect(new Set(result.items.map((item) => item.commentId))).toEqual(
      new Set([ownerComment, peerComment, directReply]),
    );
    expect(
      result.items.find((item) => item.commentId === directReply),
    ).toMatchObject({
      kind: "reply",
      parentId: selfComment,
      targetId: target.id,
      targetKind: "post",
    });
    expect(
      result.items.find((item) => item.commentId === peerComment)?.agent?.id,
    ).toBe(peer.id);
    expect((await inbox(f, peer.token)).items).toHaveLength(0);
  });

  it("delivers direct replies on another owner's content without subscribing to unrelated discussion", async () => {
    const f = fixture();
    const muse = await agent(f);
    const target = await post(f, "fixture:bob");
    const ownComment = await comment(f, target.id, muse.token);
    const unrelatedParent = await comment(f, target.id, "fixture:alice");
    await comment(f, target.id, "fixture:bob", unrelatedParent);
    await comment(f, target.id, "fixture:bob");
    const directReply = await comment(f, target.id, "fixture:bob", ownComment);
    const result = await inbox(f, muse.token);
    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toMatchObject({
      kind: "reply",
      commentId: directReply,
      parentId: ownComment,
      targetId: target.id,
    });
  });

  it("routes creation feedback to the submitting Agent even when the human publishes it", async () => {
    const f = fixture();
    const muse = await agent(f);
    const work = await publishedWork(f, muse.token);
    const feedback = await comment(
      f,
      work.workId,
      "fixture:bob",
      undefined,
      "work",
    );
    const result = await inbox(f, muse.token);
    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toMatchObject({
      kind: "comment",
      commentId: feedback,
      targetKind: "work",
      targetId: work.workId,
    });
    await f.call("/works/" + work.workId + "/unpublish", {
      method: "POST",
      body: { revisionId: work.revisionId },
    });
    expect((await inbox(f, muse.token)).unread).toBe(0);
    await f.call("/works/" + work.workId + "/publish", {
      method: "POST",
      body: { revisionId: work.revisionId },
    });
    expect((await inbox(f, muse.token)).unread).toBe(1);
  });

  it("does not grant posting or replying authority together with feedback access", async () => {
    const f = fixture();
    const muse = await agent(f, [...draftScopes, "community:notifications"]);
    const work = await publishedWork(f, muse.token);
    await comment(f, work.workId, "fixture:bob", undefined, "work");
    expect((await inbox(f, muse.token)).unread).toBe(1);
    expect(
      (
        await f.call("/works/" + work.workId + "/comments", {
          token: muse.token,
          method: "POST",
          body: { text: "A separate reply permission is still required." },
        })
      ).status,
    ).toBe(403);
    expect(
      (
        await f.call("/posts", {
          token: muse.token,
          method: "POST",
          body: { kind: "update", text: "Posting is also a separate grant." },
        })
      ).status,
    ).toBe(403);
  });

  it("requires an explicit new grant, accumulates while paused and never backfills ungranted periods", async () => {
    const f = fixture();
    const muse = await agent(f, withoutFeedback);
    const target = await post(f, muse.token);
    await comment(f, target.id);
    expect(
      (await f.call("/agent/notifications", { token: muse.token })).status,
    ).toBe(403);
    await permissions(f, muse.id, feedbackScopes);
    expect((await inbox(f, muse.token)).unread).toBe(0);
    await comment(f, target.id);
    await f.call("/me/agents/" + muse.id + "/pause", {
      method: "POST",
      body: { confirmed: true },
    });
    await comment(f, target.id);
    expect(
      (await f.call("/agent/notifications", { token: muse.token })).status,
    ).toBe(403);
    await f.call("/me/agents/" + muse.id + "/resume", {
      method: "POST",
      body: { confirmed: true },
    });
    expect((await inbox(f, muse.token)).unread).toBe(2);
    await permissions(f, muse.id, withoutFeedback);
    await comment(f, target.id);
    expect(
      (await f.call("/agent/notifications", { token: muse.token })).status,
    ).toBe(403);
    await permissions(f, muse.id, feedbackScopes);
    expect((await inbox(f, muse.token)).unread).toBe(2);
    await f.call("/me/agents/" + muse.id + "/revoke", {
      method: "POST",
      body: { confirmed: true },
    });
    await comment(f, target.id);
    expect(
      (await f.call("/agent/notifications", { token: muse.token })).status,
    ).toBe(401);
    const stored = await withDatabase(config.testAdminUrl, (db) =>
      db.one<{ count: number }>(
        "SELECT count(*)::integer AS count FROM musecity.agent_notifications WHERE recipient_agent_id=$1",
        [muse.id],
      ),
    );
    expect(stored?.count).toBe(2);
  });

  it("keeps human and sibling inboxes and read states independent", async () => {
    const f = fixture();
    const muse = await agent(f);
    const peer = await agent(f);
    const target = await post(f, muse.token);
    await comment(f, target.id);
    const feedback = await inbox(f, muse.token);
    const human = (await f.call("/me/notifications")).data;
    expect(human.unread).toBe(1);
    expect(feedback.unread).toBe(1);
    const mark = { method: "POST", body: { ids: [feedback.items[0].id] } };
    expect(
      (
        await f.call("/agent/notifications/read", {
          ...mark,
          token: peer.token,
        })
      ).status,
    ).toBe(200);
    expect((await inbox(f, muse.token)).unread).toBe(1);
    expect(
      (
        await f.call("/agent/notifications/read", {
          ...mark,
          token: muse.token,
        })
      ).status,
    ).toBe(200);
    expect((await inbox(f, muse.token)).unread).toBe(0);
    expect(
      (await inbox(f, muse.token, "?unread=false")).items[0].readAt,
    ).not.toBeNull();
    expect((await f.call("/me/notifications")).data.unread).toBe(1);
    expect((await f.call("/agent/notifications")).status).toBe(403);
    expect(
      (await f.call("/me/notifications", { token: muse.token })).status,
    ).toBe(403);
    expect((await inbox(f, peer.token)).unread).toBe(0);
  });

  it("validates Agent-only input and denies stale permissions before an idempotent read acknowledgement", async () => {
    const f = fixture();
    const muse = await agent(f);
    const target = await post(f, muse.token);
    await comment(f, target.id);
    const feedback = await inbox(f, muse.token);
    expect((await f.call("/agent/notifications", { token: null })).status).toBe(
      401,
    );
    for (const query of [
      "?unread=",
      "?unread=1",
      "?unread=true&unread=false",
      "?owner=alice",
      "?agent=another",
    ])
      expect(
        (await f.call("/agent/notifications" + query, { token: muse.token }))
          .status,
      ).toBe(400);
    for (const body of [
      { ids: [] },
      { ids: Array.from({ length: 101 }, () => "missing") },
      { ids: [feedback.items[0].id], agentId: muse.id },
    ])
      expect(
        (
          await f.call("/agent/notifications/read", {
            token: muse.token,
            method: "POST",
            body,
          })
        ).status,
      ).toBe(400);
    const request = {
      token: muse.token,
      method: "POST",
      key: "feedback-read-replay",
      body: { ids: [feedback.items[0].id] },
    };
    expect((await f.call("/agent/notifications/read", request)).status).toBe(
      200,
    );
    await permissions(f, muse.id, withoutFeedback);
    expect((await f.call("/agent/notifications/read", request)).status).toBe(
      403,
    );
    await permissions(f, muse.id, feedbackScopes);
    const rotated = await f.call(
      "/me/agents/" + muse.id + "/credentials/rotate",
      {
        method: "POST",
        body: { confirmed: true },
      },
    );
    expect(rotated.status).toBe(200);
    expect((await f.call("/agent/notifications/read", request)).status).toBe(
      401,
    );
    expect(
      (await inbox(f, rotated.data.credential.token, "?unread=false")).items,
    ).toHaveLength(1);
  });

  it("uses the same current block, author, comment and target visibility for items and unread counts", async () => {
    const f = fixture();
    const muse = await agent(f);
    const target = await post(f, muse.token);
    const bobComment = await comment(f, target.id);
    await comment(f, target.id, "fixture:alice");
    const bob = (await f.call("/me", { token: "fixture:bob" })).data;
    const count = async (expected: number) => {
      const result = await inbox(f, muse.token);
      expect(result.items).toHaveLength(expected);
      expect(result.unread).toBe(expected);
    };
    await count(2);
    await f.call("/me/blocks/" + bob.id, { method: "PUT" });
    await count(1);
    await f.call("/me/blocks/" + bob.id, { method: "DELETE" });
    await count(2);
    await withDatabase(config.testAdminUrl, (db) =>
      db.query("UPDATE musecity.accounts SET status='restricted' WHERE id=$1", [
        bob.id,
      ]),
    );
    await count(1);
    await withDatabase(config.testAdminUrl, (db) =>
      db.query("UPDATE musecity.accounts SET status='active' WHERE id=$1", [
        bob.id,
      ]),
    );
    await count(2);
    await withDatabase(config.testAdminUrl, (db) =>
      db.query("UPDATE musecity.comments SET blocked=true WHERE id=$1", [
        bobComment,
      ]),
    );
    await count(1);
    await withDatabase(config.testAdminUrl, (db) =>
      db.query("UPDATE musecity.comments SET blocked=false WHERE id=$1", [
        bobComment,
      ]),
    );
    await count(2);
    await f.call("/comments/" + bobComment, {
      token: "fixture:bob",
      method: "DELETE",
    });
    await count(1);
    const remaining = (await inbox(f, muse.token)).items[0];
    await withDatabase(config.testAdminUrl, (db) =>
      db.query("UPDATE musecity.posts SET blocked=true WHERE id=$1", [
        target.id,
      ]),
    );
    await count(0);
    await f.call("/agent/notifications/read", {
      token: muse.token,
      method: "POST",
      body: { ids: [remaining.id] },
    });
    await withDatabase(config.testAdminUrl, (db) =>
      db.query("UPDATE musecity.posts SET blocked=false WHERE id=$1", [
        target.id,
      ]),
    );
    await count(1);
    await f.call("/posts/" + target.id, {
      method: "DELETE",
      body: { revision: target.revision },
    });
    await count(0);
  });

  it("withdraws a direct-reply notification when its parent comment or parent-content owner becomes unavailable", async () => {
    const f = fixture();
    const muse = await agent(f);
    const target = await post(f, "fixture:bob");
    const parentId = await comment(f, target.id, muse.token);
    await comment(f, target.id, "fixture:alice", parentId);
    expect((await inbox(f, muse.token)).unread).toBe(1);
    const bob = (await f.call("/me", { token: "fixture:bob" })).data;
    await f.call("/me/blocks/" + bob.id, { method: "PUT" });
    expect((await inbox(f, muse.token)).unread).toBe(0);
    await f.call("/me/blocks/" + bob.id, { method: "DELETE" });
    expect((await inbox(f, muse.token)).unread).toBe(1);
    await f.call("/comments/" + parentId, { method: "DELETE" });
    const result = await inbox(f, muse.token);
    expect(result.items).toHaveLength(0);
    expect(result.unread).toBe(0);
  });

  it("paginates tied timestamps without marking reads and binds cursors to the Agent and unread filter", async () => {
    const f = fixture();
    const muse = await agent(f);
    const peer = await agent(f);
    const target = await post(f, muse.token);
    for (let i = 0; i < 23; i++) await comment(f, target.id);
    await withDatabase(config.testAdminUrl, (db) =>
      db.query(
        "UPDATE musecity.agent_notifications SET created_at='2026-09-29T00:00:00Z' WHERE recipient_agent_id=$1",
        [muse.id],
      ),
    );
    const first = await inbox(f, muse.token);
    expect(first.items).toHaveLength(20);
    expect(first.unread).toBe(23);
    expect((await inbox(f, muse.token)).unread).toBe(23);
    const cursor = encodeURIComponent(first.nextCursor!);
    expect(
      (
        await f.call("/agent/notifications?cursor=" + cursor, {
          token: peer.token,
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await f.call("/agent/notifications?unread=false&cursor=" + cursor, {
          token: muse.token,
        })
      ).status,
    ).toBe(400);
    await f.call("/agent/notifications/read", {
      token: muse.token,
      method: "POST",
      body: { ids: first.items.map((item) => item.id) },
    });
    const second = await inbox(f, muse.token, "?cursor=" + cursor);
    expect(second.items).toHaveLength(3);
    expect(second.unread).toBe(3);
    expect(second.nextCursor).toBeNull();
    expect(
      new Set([...first.items, ...second.items].map((item) => item.id)).size,
    ).toBe(23);
    expect((await inbox(f, muse.token, "?unread=false")).items).toHaveLength(
      20,
    );
  });

  it("shares comment idempotency, independently deduplicates event delivery and rolls back failed comment transactions", async () => {
    const f = fixture();
    const muse = await agent(f);
    const target = await post(f, muse.token);
    const request = {
      token: "fixture:bob",
      method: "POST",
      key: "feedback-comment-retry",
      body: { text: "Only one comment and one notification." },
    };
    const results = await Promise.all([
      f.call("/posts/" + target.id + "/comments", request),
      f.call("/posts/" + target.id + "/comments", request),
    ]);
    expect(results.map((result) => result.status)).toEqual([201, 201]);
    expect(results[0].data.id).toBe(results[1].data.id);
    expect((await inbox(f, muse.token)).unread).toBe(1);
    await withDatabase(config.testUrl, (db) =>
      db.transaction(async () => {
        await db.query("SELECT pg_advisory_xact_lock(624139188)");
        const actor = await resolveActor(db, {
          kind: "human",
          userId: "did:privy:bob",
        });
        await notifyAgentFeedback(
          db,
          actor,
          results[0].data.id,
          "post",
          target.id,
        );
      }),
    );
    expect((await inbox(f, muse.token)).unread).toBe(1);
    await expect(
      withDatabase(config.testUrl, (db) =>
        db.transaction(async () => {
          await db.query("SELECT pg_advisory_xact_lock(624139188)");
          const actor = await resolveActor(db, {
            kind: "human",
            userId: "did:privy:bob",
          });
          await db.query(
            "INSERT INTO musecity.comments(id,owner_account_id,post_id,text) VALUES($1,$2,$3,$4)",
            [
              "cmt_feedback_rollback",
              actor.account.id,
              target.id,
              "This transaction will fail.",
            ],
          );
          await notifyAgentFeedback(
            db,
            actor,
            "cmt_feedback_rollback",
            "post",
            target.id,
          );
          throw new Error("Abort comment transaction");
        }),
      ),
    ).rejects.toThrow("Abort comment transaction");
    expect((await inbox(f, muse.token)).unread).toBe(1);
    const rolledBack = await withDatabase(config.testAdminUrl, (db) =>
      db.one(
        "SELECT id FROM musecity.comments WHERE id='cmt_feedback_rollback'",
      ),
    );
    expect(rolledBack).toBeUndefined();
  });

  it("finishes cross-household Agent replies alongside scope withdrawal without deadlock or post-withdrawal delivery", async () => {
    const f = fixture();
    const alice = await agent(f);
    const bob = await agent(f, feedbackScopes, "fixture:bob");
    const alicePost = await post(f, alice.token);
    const bobPost = await post(f, bob.token);
    const [toAlice, toBob] = await Promise.all([
      comment(f, alicePost.id, bob.token),
      comment(f, bobPost.id, alice.token),
      permissions(f, alice.id, withoutFeedback),
    ]);
    const bobInbox = await inbox(f, bob.token);
    expect(bobInbox.items).toHaveLength(1);
    expect(bobInbox.items[0].commentId).toBe(toBob);
    expect(
      (await f.call("/agent/notifications", { token: alice.token })).status,
    ).toBe(403);
    const stored = () =>
      withDatabase(config.testAdminUrl, (db) =>
        db.query<{ comment_id: string }>(
          "SELECT comment_id FROM musecity.agent_notifications WHERE recipient_agent_id=$1 ORDER BY id",
          [alice.id],
        ),
      );
    const atWithdrawal = await stored();
    // The racing reply can precede or follow withdrawal; either ordering is
    // valid, but a later committed reply must not add another notification.
    expect(atWithdrawal.every((row) => row.comment_id === toAlice)).toBe(true);
    await comment(f, alicePost.id, bob.token);
    expect(await stored()).toEqual(atWithdrawal);
    await permissions(f, alice.id, feedbackScopes);
    expect((await inbox(f, alice.token)).unread).toBe(atWithdrawal.length);
  });
});
