import { beforeEach, describe, expect, it } from "vitest";
import { fixture, reset, article, config } from "./helpers";
import { withDatabase } from "../src/server/database";
import { createTagSchema, defaultTabs } from "../src/shared/contracts";

beforeEach(reset);
describe("shared homepage tags through local PostgreSQL", () => {
  it("creates once across accounts, normalized names, concurrent calls and idempotent retries", async () => {
    const f = fixture(),
      key = crypto.randomUUID();
    const result = await Promise.all([
      f.call("/tags", {
        method: "POST",
        body: { name: "  Ｃity   Gardens  " },
        key,
      }),
      f.call("/tags", {
        method: "POST",
        token: "fixture:bob",
        body: { name: "city gardens" },
      }),
    ]);
    expect(result.map((r) => r.status)).toEqual([200, 200]);
    expect(result[0]!.data.id).toBe(result[1]!.data.id);
    const replay = await f.call("/tags", {
      method: "POST",
      body: { name: "  Ｃity   Gardens  " },
      key,
    });
    expect(replay.data).toEqual(result[0]!.data);
    const catalog = await f.call("/tags", { token: null });
    expect(catalog.data.tags).toHaveLength(7);
    expect(
      catalog.data.tags.filter((t: { id: string }) => t.id === replay.data.id),
    ).toHaveLength(1);
    expect(
      (await f.call("/tags", { method: "POST", body: { name: "城市生活" } }))
        .status,
    ).toBe(200);
  });

  it("requires a human and rejects reserved, unreadable or forged tag input", async () => {
    const f = fixture();
    for (const token of [null, "invalid"])
      expect(
        (
          await f.call("/tags", {
            method: "POST",
            token,
            body: { name: "Music" },
          })
        ).status,
      ).toBe(401);
    for (const name of [
      "",
      "   ",
      "latest",
      "FOLLOWING",
      " Sites ",
      "ＳＩＴＥＳ",
      "Ｌａｔｅｓｔ",
      "x".repeat(41),
      "Hidden\u200bTag",
      "!!!",
    ])
      expect(createTagSchema.safeParse({ name }).success, name).toBe(false);
    expect(
      (
        await f.call("/tags", {
          method: "POST",
          body: { name: "Music", enabled: true, ownerAccountId: "forged" },
        })
      ).status,
    ).toBe(400);
    await withDatabase(config.testAdminUrl, (d) =>
      d.query("UPDATE musecity.tags SET enabled=false WHERE id='design'"),
    );
    expect(
      (await f.call("/tags", { method: "POST", body: { name: "DESIGN" } })).data
        .error.code,
    ).toBe("TAG_UNAVAILABLE");
    expect(
      (await f.call("/tags")).data.tags.some(
        (t: { id: string }) => t.id === "design",
      ),
    ).toBe(false);
  });

  it("keeps three fixed tabs, synchronizes only the owner's order, and hides tabs without deleting shared tags", async () => {
    const f = fixture(),
      tag = (await f.call("/tags", { method: "POST", body: { name: "Music" } }))
        .data;
    const tabs = [...defaultTabs, "tag:" + tag.id, "tag:design"];
    expect(
      (await f.call("/me/feed-preferences", { method: "PUT", body: { tabs } }))
        .status,
    ).toBe(200);
    expect((await fixture().call("/me/feed-preferences")).data.tabs).toEqual(
      tabs,
    );
    expect(
      (await f.call("/me/feed-preferences", { token: "fixture:bob" })).data
        .tabs,
    ).toEqual(defaultTabs);
    for (const bad of [
      ["latest"],
      ["following", "latest"],
      ["latest", "following", "tag:design"],
      ["latest", "sites", "following"],
      ["sites", "latest", "following"],
      ["latest", "following", "type:article"],
      [...defaultTabs, "tag:missing"],
      [...defaultTabs, "tag:design", "tag:design"],
    ])
      expect(
        (
          await f.call("/me/feed-preferences", {
            method: "PUT",
            body: { tabs: bad },
          })
        ).status,
      ).toBe(400);
    expect(
      (
        await f.call("/me/feed-preferences", {
          method: "PUT",
          body: { tabs: defaultTabs },
        })
      ).status,
    ).toBe(200);
    expect(
      (await f.call("/tags", { token: "fixture:bob" })).data.tags,
    ).toContainEqual(tag);
  });

  it("adds Sites to existing preferences without dropping any of the 18 custom tabs", async () => {
    const f = fixture();
    const account = (await f.call("/me")).data;
    const custom = Array.from({ length: 18 }, (_, i) => "tag:saved-" + i);
    const legacy = ["latest", "following", ...custom];
    await withDatabase(config.testAdminUrl, async (d) => {
      await d.query(
        "INSERT INTO musecity.tags(id,name) SELECT 'saved-'||i,'Saved '||i FROM generate_series(0,17) i",
      );
      await d.query(
        "INSERT INTO musecity.feed_preferences(account_id,tabs) VALUES($1,$2)",
        [account.id, JSON.stringify(legacy)],
      );
    });
    const tabs = (await f.call("/me/feed-preferences")).data.tabs;
    expect(tabs).toEqual(["latest", "following", "sites", ...custom]);
    expect(tabs).toHaveLength(21);
    expect(
      (await f.call("/me/feed-preferences", { method: "PUT", body: { tabs } }))
        .status,
    ).toBe(200);
    expect(
      (
        await f.call("/me/feed-preferences", {
          method: "PUT",
          body: { tabs: [...tabs, "tag:design"] },
        })
      ).status,
    ).toBe(400);
  });

  it("mixes different owners' creations, updates and help under one tag, with category and format filters", async () => {
    const f = fixture(),
      tag = (await f.call("/tags", { method: "POST", body: { name: "Music" } }))
        .data;
    const tagIds = [tag.id];
    const update = await f.call("/posts", {
      method: "POST",
      body: { kind: "update", text: "A new melody", tagIds },
    });
    const help = await f.call("/posts", {
      method: "POST",
      token: "fixture:bob",
      body: {
        kind: "help",
        text: "Review my song",
        title: "Feedback",
        expectedOutcome: "Suggestions",
        tagIds,
      },
    });
    const work = await f.call("/works", {
      method: "POST",
      token: "fixture:bob",
      body: { ...article, tagIds },
    });
    expect(update.status).toBe(201);
    expect(help.status).toBe(201);
    expect(work.status).toBe(201);
    await f.call("/works/" + work.data.workId + "/publish", {
      method: "POST",
      token: "fixture:bob",
      body: { revisionId: work.data.revisionId },
    });
    await f.call("/posts", {
      method: "POST",
      body: { kind: "update", text: "Unrelated" },
    });
    const page = await f.call("/feed?tag=" + tag.id, { token: null });
    expect(page.data.items.map((v: { kind: string }) => v.kind).sort()).toEqual(
      ["help", "update", "work"],
    );
    expect(
      page.data.items.find((v: { id: string }) => v.id === help.data.id).post
        .tagIds,
    ).toEqual(tagIds);
    expect(
      (await f.call("/posts/" + help.data.id, { token: null })).data.tagIds,
    ).toEqual(tagIds);
    expect(
      (await f.call("/feed?tag=" + tag.id + "&kind=update")).data.items.map(
        (v: { id: string }) => v.id,
      ),
    ).toEqual([update.data.id]);
    expect(
      (
        await f.call("/feed?tag=" + tag.id + "&kind=work&type=article")
      ).data.items.map((v: { id: string }) => v.id),
    ).toEqual([work.data.workId]);
    expect(
      (
        await f.call("/posts/" + help.data.id, {
          method: "PATCH",
          body: {
            revision: help.data.revision,
            content: {
              kind: "help",
              text: "Forged edit",
              title: "Feedback",
              expectedOutcome: "Suggestions",
              tagIds,
            },
          },
        })
      ).status,
    ).toBe(404);
  });

  it("validates post tags and retains publication time while edits move a post between shared feeds", async () => {
    const f = fixture();
    for (const tagIds of [
      ["missing"],
      ["design", "design"],
      [
        "ai-tools",
        "development",
        "design",
        "tutorials",
        "games",
        "experiments",
      ],
    ])
      expect(
        (
          await f.call("/posts", {
            method: "POST",
            body: { kind: "update", text: "Invalid", tagIds },
          })
        ).status,
      ).toBe(400);
    const created = (
      await f.call("/posts", {
        method: "POST",
        body: { kind: "update", text: "Hello", tagIds: ["design"] },
      })
    ).data;
    const edited = await f.call("/posts/" + created.id, {
      method: "PATCH",
      body: {
        revision: created.revision,
        content: { kind: "update", text: "Moved", tagIds: ["games"] },
      },
    });
    expect(edited.status).toBe(200);
    expect(edited.data.createdAt).toBe(created.createdAt);
    expect((await f.call("/feed?tag=design")).data.items).toHaveLength(0);
    expect((await f.call("/feed?tag=games")).data.items[0].id).toBe(created.id);
    await withDatabase(config.testAdminUrl, (d) =>
      d.query("UPDATE musecity.tags SET enabled=false WHERE id='games'"),
    );
    expect(
      (
        await f.call("/posts", {
          method: "POST",
          body: { kind: "update", text: "Disabled", tagIds: ["games"] },
        })
      ).status,
    ).toBe(400);
  });

  it("keeps Following, household blocks and moderation effective inside shared tags", async () => {
    const f = fixture();
    const bob = (
      await f.call("/me", {
        method: "PATCH",
        token: "fixture:bob",
        body: { name: "Bob", bio: "", avatarMediaId: null, join: true },
      })
    ).data;
    const post = (
      await f.call("/posts", {
        method: "POST",
        token: "fixture:bob",
        body: { kind: "update", text: "Bob's music", tagIds: ["design"] },
      })
    ).data;
    expect(
      (await f.call("/feed?view=following&tag=design", { token: null })).status,
    ).toBe(401);
    expect(
      (await f.call("/feed?view=following&tag=design")).data.items,
    ).toHaveLength(0);
    await f.call("/me/follows/" + bob.id, { method: "PUT" });
    expect(
      (await f.call("/feed?view=following&tag=design")).data.items[0].id,
    ).toBe(post.id);
    await f.call("/me/blocks/" + bob.id, { method: "PUT" });
    expect((await f.call("/feed?tag=design")).data.items).toHaveLength(0);
    expect(
      (await f.call("/feed?tag=design", { token: null })).data.items,
    ).toHaveLength(1);
    await withDatabase(config.testAdminUrl, (d) =>
      d.query("UPDATE musecity.posts SET blocked=true WHERE id=$1", [post.id]),
    );
    expect(
      (await f.call("/feed?tag=design", { token: null })).data.items,
    ).toHaveLength(0);
  });

  it("paginates mixed-owner tags and rejects cursors from a different tag, identity or old feed semantics", async () => {
    const f = fixture();
    for (let i = 0; i < 22; i++)
      await f.call("/posts", {
        method: "POST",
        token: i % 2 ? "fixture:alice" : "fixture:bob",
        body: { kind: "update", text: "Tagged " + i, tagIds: ["design"] },
      });
    const first = (await f.call("/feed?tag=design", { token: null })).data;
    expect(first.items).toHaveLength(20);
    const cursor = encodeURIComponent(first.nextCursor);
    const second = (
      await f.call("/feed?tag=design&cursor=" + cursor, { token: null })
    ).data;
    expect(second.items).toHaveLength(2);
    expect(
      new Set(
        [...first.items, ...second.items].map((v: { id: string }) => v.id),
      ).size,
    ).toBe(22);
    expect(
      (await f.call("/feed?tag=games&cursor=" + cursor, { token: null })).data
        .error.code,
    ).toBe("INVALID_CURSOR");
    expect(
      (await f.call("/feed?tag=design&cursor=" + cursor)).data.error.code,
    ).toBe("INVALID_CURSOR");
    const old = JSON.parse(atob(first.nextCursor));
    old.filter = JSON.stringify(JSON.parse(old.filter).slice(1));
    expect(
      (
        await f.call(
          "/feed?tag=design&cursor=" +
            encodeURIComponent(btoa(JSON.stringify(old))),
          { token: null },
        )
      ).data.error.code,
    ).toBe("INVALID_CURSOR");
  });

  it("grants the runtime only the tag columns needed for creation", async () => {
    await withDatabase(config.testUrl, async (d) => {
      await expect(
        d.query(
          "INSERT INTO musecity.tags(id,name,enabled) VALUES('forged','Forged',false)",
        ),
      ).rejects.toMatchObject({ code: "42501" });
      await expect(
        d.query("UPDATE musecity.tags SET enabled=false WHERE id='design'"),
      ).rejects.toMatchObject({ code: "42501" });
      await expect(
        d.query("DELETE FROM musecity.tags WHERE id='design'"),
      ).rejects.toMatchObject({ code: "42501" });
    });
  });
});
