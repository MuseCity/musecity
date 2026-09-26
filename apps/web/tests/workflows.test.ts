import { beforeEach, describe, it, expect } from "vitest";
import { fixture, reset, article, config } from "./helpers";
import { withDatabase } from "../src/server/database";
import {
  draftScopes,
  publishScopes,
  defaultTabs,
} from "../src/shared/contracts";
beforeEach(reset);
async function agent(f: ReturnType<typeof fixture>, scopes = publishScopes) {
  const inv = await f.call("/me/agent-invitations", {
    method: "POST",
    body: { name: "Studio", scopes, confirmed: true },
  });
  expect(inv.status).toBe(201);
  const reg = await f.call("/agent-registrations", {
    token: null,
    method: "POST",
    body: {
      name: "Studio",
      requestedScopes: scopes,
      invitationToken: inv.data.invitationToken,
    },
  });
  expect(reg.status).toBe(201);
  const active = await f.call(
    "/agent-registrations/" + reg.data.registrationId + "/activate",
    { token: reg.data.registrationToken, method: "POST" },
  );
  expect(active.status).toBe(201);
  return { id: active.data.agentId, token: active.data.credential.token };
}
describe("real PostgreSQL business workflows, injected test identity and object storage", () => {
  it("uses only the bearer identity when Privy also attaches a browser cookie", async () => {
    const f = fixture();
    const headers = { Cookie: "privy-token=fixture:bob" };
    const tabs = ["all", "tag:design", "type:article"];
    expect(
      (
        await f.call("/me/feed-preferences", {
          method: "PUT",
          body: { tabs },
          headers,
        })
      ).status,
    ).toBe(200);
    expect(
      (await f.call("/me/feed-preferences", { headers })).data.tabs,
    ).toEqual(tabs);
    expect(
      (await f.call("/me/feed-preferences", { token: "fixture:bob", headers }))
        .data.tabs,
    ).toEqual(defaultTabs);
    for (const token of [null, "invalid-token"]) {
      expect(
        (await f.call("/me/feed-preferences", { token, headers })).status,
      ).toBe(401);
    }
    const ag = await agent(f);
    expect(
      (await f.call("/me/feed-preferences", { token: ag.token, headers }))
        .status,
    ).toBe(403);
  });
  it("isolates navigation preferences by account and rejects agent edits", async () => {
    const f = fixture();
    const save = await f.call("/me/feed-preferences", {
      method: "PUT",
      body: { tabs: ["all", "tag:design", "type:article"] },
    });
    expect(save.status).toBe(200);
    expect((await f.call("/me/feed-preferences")).data.tabs).toEqual([
      "all",
      "tag:design",
      "type:article",
    ]);
    expect(
      (await f.call("/me/feed-preferences", { token: "fixture:bob" })).data
        .tabs,
    ).toEqual(defaultTabs);
    expect(
      (
        await f.call("/me/feed-preferences", {
          method: "PUT",
          body: { tabs: ["type:article"] },
        })
      ).status,
    ).toBe(400);
    const ag = await agent(f);
    expect(
      (await f.call("/me/feed-preferences", { token: ag.token })).status,
    ).toBe(403);
    expect(
      (
        await f.call("/me/feed-preferences", {
          method: "PUT",
          body: { tabs: defaultTabs },
        })
      ).status,
    ).toBe(200);
  });
  it("publishes only selected revisions and their tags; enforces ownership and concurrent edits", async () => {
    const f = fixture();
    const created = await f.call("/works", { method: "POST", body: article });
    expect(created.status).toBe(201);
    const work = created.data;
    expect((await f.call("/works", { token: null })).data.items).toHaveLength(
      0,
    );
    expect(
      (
        await f.call("/works/" + work.workId + "?draft=true", {
          token: "fixture:bob",
        })
      ).status,
    ).toBe(404);
    expect(
      (
        await f.call("/works/" + work.workId + "/publish", {
          method: "POST",
          body: { revisionId: work.revisionId },
        })
      ).status,
    ).toBe(200);
    const edited = await f.call("/works/" + work.workId, {
      method: "PATCH",
      body: {
        baseRevisionId: work.revisionId,
        content: { ...article, title: "Revised", tagIds: ["games"] },
      },
    });
    expect(edited.status).toBe(200);
    expect(
      (await f.call("/works?tag=design", { token: null })).data.items[0].body
        .title,
    ).toBe(article.title);
    expect(
      (await f.call("/works?tag=games", { token: null })).data.items,
    ).toHaveLength(0);
    expect(
      (
        await f.call("/works/" + work.workId, {
          method: "PATCH",
          body: { baseRevisionId: work.revisionId, content: article },
        })
      ).status,
    ).toBe(409);
    expect(
      (
        await f.call("/works/" + work.workId + "/publish", {
          method: "POST",
          body: { revisionId: work.revisionId },
        })
      ).status,
    ).toBe(409);
    await f.call("/works/" + work.workId + "/publish", {
      method: "POST",
      body: { revisionId: edited.data.revisionId },
    });
    expect(
      (await f.call("/works?tag=games", { token: null })).data.items[0].body
        .title,
    ).toBe("Revised");
    expect(
      (await f.call("/works?tag=design", { token: null })).data.items,
    ).toHaveLength(0);
    await f.call("/works/" + work.workId + "/unpublish", {
      method: "POST",
      body: { revisionId: edited.data.revisionId },
    });
    expect(
      (await f.call("/works/" + work.workId, { token: null })).status,
    ).toBe(404);
    await f.call("/works/" + work.workId, { method: "DELETE" });
    expect(
      (
        await f.call("/works/" + work.workId + "/publish", {
          method: "POST",
          body: { revisionId: edited.data.revisionId },
        })
      ).status,
    ).toBe(404);
  });
  it("replays same writes, rejects changed keys and rejects impersonated owner fields", async () => {
    const f = fixture();
    const key = "repeat-create-123";
    const [a, b] = await Promise.all([
      f.call("/works", { method: "POST", body: article, key }),
      f.call("/works", { method: "POST", body: article, key }),
    ]);
    expect(a.status).toBe(201);
    expect(a.data.workId).toBe(b.data.workId);
    expect(
      (
        await f.call("/works", {
          method: "POST",
          body: { ...article, title: "Different" },
          key,
        })
      ).status,
    ).toBe(409);
    expect(
      (
        await f.call("/works", {
          method: "POST",
          body: { ...article, ownerAccountId: "not-me" },
        })
      ).status,
    ).toBe(400);
  });
  it("claims once, activates once, denies publication until owner grants it", async () => {
    const f = fixture();
    const reg = await f.call("/agent-registrations", {
      token: null,
      method: "POST",
      body: { name: "Self agent", requestedScopes: publishScopes },
    });
    expect(reg.status).toBe(201);
    const claimToken = new URL(
      "http://localhost" + reg.data.claimPath,
    ).hash.slice(7);
    const body = { claimToken, approvedScopes: draftScopes, confirmed: true };
    const [a, b] = await Promise.all([
      f.call("/agent-registrations/" + reg.data.registrationId + "/claim", {
        method: "POST",
        body,
      }),
      f.call("/agent-registrations/" + reg.data.registrationId + "/claim", {
        token: "fixture:bob",
        method: "POST",
        body,
      }),
    ]);
    expect([a.status, b.status].sort()).toEqual([200, 409]);
    const human = a.status === 200 ? "fixture:alice" : "fixture:bob";
    const active = await f.call(
      "/agent-registrations/" + reg.data.registrationId + "/activate",
      { token: reg.data.registrationToken, method: "POST" },
    );
    expect(active.status).toBe(201);
    expect(
      (
        await f.call(
          "/agent-registrations/" + reg.data.registrationId + "/activate",
          { token: reg.data.registrationToken, method: "POST" },
        )
      ).status,
    ).toBe(409);
    const token = active.data.credential.token;
    const work = (
      await f.call("/works", { token, method: "POST", body: article })
    ).data;
    expect(
      (
        await f.call("/works/" + work.workId + "/publish", {
          token,
          method: "POST",
          body: { revisionId: work.revisionId },
        })
      ).status,
    ).toBe(403);
    await f.call("/me/agents/" + active.data.agentId, {
      token: human,
      method: "PATCH",
      body: { scopes: publishScopes, confirmed: true },
    });
    expect(
      (
        await f.call("/works/" + work.workId + "/publish", {
          token,
          method: "POST",
          body: { revisionId: work.revisionId },
        })
      ).status,
    ).toBe(200);
  });
  it("immediately applies pause, scope reduction, rotation and revocation before cached writes", async () => {
    const f = fixture();
    const ag = await agent(f);
    const key = "agent-create-key";
    const work = (
      await f.call("/works", {
        token: ag.token,
        method: "POST",
        body: article,
        key,
      })
    ).data;
    await f.call("/me/agents/" + ag.id + "/pause", {
      method: "POST",
      body: { confirmed: true },
    });
    expect((await f.call("/agent", { token: ag.token })).status).toBe(200);
    expect(
      (
        await f.call("/works", {
          token: ag.token,
          method: "POST",
          body: article,
          key,
        })
      ).status,
    ).toBe(403);
    await f.call("/me/agents/" + ag.id + "/resume", {
      method: "POST",
      body: { confirmed: true },
    });
    await f.call("/me/agents/" + ag.id, {
      method: "PATCH",
      body: { scopes: draftScopes, confirmed: true },
    });
    expect(
      (
        await f.call("/works/" + work.workId + "/publish", {
          token: ag.token,
          method: "POST",
          body: { revisionId: work.revisionId },
        })
      ).status,
    ).toBe(403);
    const rotated = await f.call(
      "/me/agents/" + ag.id + "/credentials/rotate",
      { method: "POST", body: { confirmed: true } },
    );
    expect((await f.call("/agent", { token: ag.token })).status).toBe(401);
    await f.call("/me/agents/" + ag.id + "/revoke", {
      method: "POST",
      body: { confirmed: true },
    });
    expect(
      (await f.call("/agent", { token: rotated.data.credential.token })).status,
    ).toBe(401);
    expect(
      (
        await f.call("/me/agents/" + ag.id + "/resume", {
          method: "POST",
          body: { confirmed: true },
        })
      ).status,
    ).toBe(409);
  });
  it("keeps peer agents out of private drafts and permits owner review and publication", async () => {
    const f = fixture();
    const a = await agent(f);
    const b = await agent(f);
    const w = (
      await f.call("/works", { token: a.token, method: "POST", body: article })
    ).data;
    expect(
      (await f.call("/works/" + w.workId + "?draft=true", { token: b.token }))
        .status,
    ).toBe(404);
    expect(
      (
        await f.call("/works/" + w.workId + "/publish", {
          method: "POST",
          body: { revisionId: w.revisionId },
        })
      ).data.submittedBy.id,
    ).toBe(a.id);
    expect(
      (await f.call("/works/" + w.workId, { token: null })).data.publishedBy,
    ).toBeNull();
    expect(
      (await f.call("/works/" + w.workId, { token: a.token, method: "DELETE" }))
        .status,
    ).toBe(403);
  });
  it("validates uploads, protects private bytes and supports all four types", async () => {
    const f = fixture();
    const bytes = Uint8Array.from(
      Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAADUlEQVQImWP4z8DQAAAEgQGADgLFJAAAAABJRU5ErkJggg==",
        "base64",
      ),
    );
    const upload = (
      await f.call("/media/uploads", {
        method: "POST",
        body: { mimeType: "image/png", byteSize: bytes.length },
      })
    ).data;
    const put = () =>
      f.app.request("http://localhost" + upload.uploadUrl, {
        method: "PUT",
        headers: {
          "Content-Type": "image/png",
          "X-Upload-Token": upload.uploadToken,
        },
        body: bytes,
      });
    expect((await put()).status).toBe(200);
    expect((await put()).status).toBe(409);
    expect(
      (await f.call("/raw-media/" + upload.mediaId, { token: null })).status,
    ).toBe(404);
    await f.call("/media/" + upload.mediaId + "/complete", {
      method: "POST",
      body: {},
    });
    expect(
      (await f.call("/raw-media/" + upload.mediaId, { token: "fixture:bob" }))
        .status,
    ).toBe(404);
    for (const type of ["website", "video", "image", "article"]) {
      const content = {
        ...article,
        type,
        ...(type === "article" ? {} : { articleDocument: undefined }),
        ...(type === "website"
          ? { websiteUrl: "https://example.com", coverMediaId: upload.mediaId }
          : type === "video"
            ? {
                videoUrl: "https://example.com/watch",
                coverMediaId: upload.mediaId,
              }
            : type === "image"
              ? { imageMediaIds: [upload.mediaId] }
              : {}),
      };
      const created = await f.call("/works", { method: "POST", body: content });
      expect(created.status).toBe(201);
      const w = created.data;
      expect(
        (
          await f.call("/works/" + w.workId + "/publish", {
            method: "POST",
            body: { revisionId: w.revisionId },
          })
        ).status,
      ).toBe(200);
    }
    expect(
      (await f.call("/raw-media/" + upload.mediaId, { token: null })).status,
    ).toBe(200);
    const list = (await f.call("/works", { token: null })).data.items;
    for (const w of list)
      await f.call("/works/" + w.workId + "/unpublish", {
        method: "POST",
        body: { revisionId: w.revisionId },
      });
    expect(
      (await f.call("/raw-media/" + upload.mediaId, { token: null })).status,
    ).toBe(404);
  });
  it("refuses script payloads, unknown topics, insecure URLs and blocked publication", async () => {
    const f = fixture();
    for (const body of [
      {
        ...article,
        articleDocument: {
          type: "doc",
          content: [{ type: "script", text: "alert(1)" }],
        },
      },
      { ...article, tagIds: ["unrecognized"] },
      {
        ...article,
        type: "website",
        articleDocument: undefined,
        websiteUrl: "javascript:alert(1)",
      },
    ])
      expect((await f.call("/works", { method: "POST", body })).status).toBe(
        400,
      );
    const w = (await f.call("/works", { method: "POST", body: article })).data;
    await withDatabase(config.testAdminUrl, (d) =>
      d.query("UPDATE musecity.works SET blocked=true WHERE id=$1", [w.workId]),
    );
    expect(
      (
        await f.call("/works/" + w.workId + "/publish", {
          method: "POST",
          body: { revisionId: w.revisionId },
        })
      ).status,
    ).toBe(423);
  });
  it("paginates without duplicates or omissions and rejects cursors reused with another filter", async () => {
    const f = fixture();
    for (let i = 0; i < 24; i++) {
      const token = i % 2 ? "fixture:bob" : "fixture:alice";
      const w = (
        await f.call("/works", {
          method: "POST",
          body: { ...article, title: "Work " + i },
          token,
        })
      ).data;
      await f.call("/works/" + w.workId + "/publish", {
        method: "POST",
        token,
        body: { revisionId: w.revisionId },
      });
    }
    const page = (await f.call("/works", { token: null })).data;
    expect(page.items).toHaveLength(20);
    const next = (
      await f.call("/works?cursor=" + encodeURIComponent(page.nextCursor), {
        token: null,
      })
    ).data;
    expect(next.items).toHaveLength(4);
    expect(
      new Set([...page.items, ...next.items].map((w) => w.workId)).size,
    ).toBe(24);
    expect(
      (
        await f.call(
          "/works?tag=design&cursor=" + encodeURIComponent(page.nextCursor),
          { token: null },
        )
      ).status,
    ).toBe(400);
  });
  it("orders revocation against publication and never permits writes after revocation commits", async () => {
    const f = fixture();
    const ag = await agent(f);
    const w = (
      await f.call("/works", { token: ag.token, method: "POST", body: article })
    ).data;
    const [publication, revoke] = await Promise.all([
      f.call("/works/" + w.workId + "/publish", {
        token: ag.token,
        method: "POST",
        body: { revisionId: w.revisionId },
      }),
      f.call("/me/agents/" + ag.id + "/revoke", {
        method: "POST",
        body: { confirmed: true },
      }),
    ]);
    expect(revoke.status).toBe(200);
    expect([200, 401]).toContain(publication.status);
    expect(
      (
        await f.call("/works/" + w.workId + "/publish", {
          token: ag.token,
          method: "POST",
          body: { revisionId: w.revisionId },
        })
      ).status,
    ).toBe(401);
    expect((await f.call("/works/" + w.workId, { token: null })).status).toBe(
      publication.status === 200 ? 200 : 404,
    );
  });
});
