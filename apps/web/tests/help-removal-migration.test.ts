import { createHash, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { assertLocalTarget } from "../scripts/local-target";
import { Database, withDatabase } from "../src/server/database";

const config = JSON.parse(readFileSync(".local/database.json", "utf8")) as {
  testAdminUrl: string;
};
const removalSql = readFileSync("migrations/0010_remove_help.sql", "utf8");
// SHA-256 of the committed, already deployed migrations before this change.
const historicalChecksums = {
  "0001_musecity.sql":
    "09a6ada21af1a7443e9cdd9debc3831d9c33ac2acecb6e8c5e99f16422cdc08e",
  "0002_runtime_privileges.sql":
    "9ee2396c28016be2ddd7ff39078358e5ac99d777f62c10ed0e3f48af955a7522",
  "0003_neighborhood.sql":
    "eb984de4ab9f78bddaa6bca6e73a669c3e30b4394d8bd142ecd6c67ec118ffd9",
  "0004_move_in.sql":
    "689c76f86f964c654f319a29d683113fe97aed39e66dca28ef89b3c22e7f2c1e",
  "0005_image_optimization.sql":
    "639d1c8e9d48650884bf5892aff88a7b1beb5cfa671f7883d2b73b2f41b756dd",
  "0006_wallet_governance.sql":
    "29cc386a9aaf819b90065da0b3bd5cf8b2b6c959d0fc8834b70120a75c3f9990",
  "0007_shared_feed_tags.sql":
    "90459a3dc432af0774a3ea8cc6deda3a25607ef474ea33790b58b7ab6cfdb52f",
  "0008_content_interactions.sql":
    "7248023032a00c9ee9953459f97c99ad286804b02de15cecbb9f5f74d3e33891",
};
async function columns(db: Database) {
  return db.query<{ column_name: string }>(
    "SELECT column_name FROM information_schema.columns WHERE table_schema='musecity' AND table_name='posts' ORDER BY ordinal_position",
  );
}
async function constraints(db: Database) {
  return db.query(
    "SELECT conname,pg_get_constraintdef(oid) AS definition FROM pg_constraint WHERE conrelid='musecity.posts'::regclass ORDER BY conname",
  );
}
async function inHistoricalSchema(
  run: (db: Database, prefix: string) => Promise<void>,
) {
  assertLocalTarget(config.testAdminUrl, "musecity_test", "musecity_admin");
  await withDatabase(config.testAdminUrl, async (db) => {
    const originalColumns = await columns(db);
    const originalConstraints = await constraints(db);
    const prefix = "migration-qa-" + randomUUID();
    expect(originalColumns.map((column) => column.column_name)).not.toContain(
      "help_status",
    );
    await db.query("BEGIN");
    try {
      await db.query("SET LOCAL lock_timeout='5s'");
      // Reconstruct only the old post shape inside this rollback-only transaction.
      await db.query(`ALTER TABLE musecity.posts
        DROP CONSTRAINT posts_kind_check,
        ADD COLUMN title text NOT NULL DEFAULT '',
        ADD COLUMN expected_outcome text NOT NULL DEFAULT '',
        ADD COLUMN help_status text,
        ADD CONSTRAINT posts_kind_check CHECK(kind IN ('update','help')),
        ADD CONSTRAINT posts_help_status_check CHECK(help_status IN ('open','in_progress','resolved')),
        ADD CONSTRAINT posts_help_shape_check CHECK((kind='help' AND help_status IS NOT NULL) OR (kind='update' AND help_status IS NULL))`);
      await db.query(
        "INSERT INTO musecity.accounts(id,privy_user_id,handle,name) VALUES($1,$1,$1,'Migration fixture')",
        [prefix],
      );
      await db.query(
        "INSERT INTO musecity.posts(id,owner_account_id,kind,text,revision,tag_ids) VALUES($1,$2,'update','Update survives cleanup',3,ARRAY['design'])",
        [prefix + "-update", prefix],
      );
      await db.query(
        "INSERT INTO musecity.idempotency(actor_key,operation,key,request_hash,response) VALUES($1,'POST:/api/v1/posts',$2,'historical-request-hash',$3)",
        [
          prefix,
          prefix + "-key",
          JSON.stringify({
            id: prefix + "-update",
            kind: "update",
            text: "Update survives cleanup",
            title: "",
            expectedOutcome: "",
            helpStatus: null,
          }),
        ],
      );
      await run(db, prefix);
    } finally {
      await db.query("ROLLBACK");
    }
    expect(await columns(db)).toEqual(originalColumns);
    expect(await constraints(db)).toEqual(originalConstraints);
    expect(
      await db.query("SELECT id FROM musecity.accounts WHERE id=$1", [prefix]),
    ).toEqual([]);
    expect(
      await db.query(
        "SELECT key FROM musecity.idempotency WHERE actor_key=$1",
        [prefix],
      ),
    ).toEqual([]);
  });
}

describe("help removal migration against real local PostgreSQL", () => {
  it("pins article extraction to builtins even with a hostile caller search path", async () => {
    assertLocalTarget(config.testAdminUrl, "musecity_test", "musecity_admin");
    await withDatabase(config.testAdminUrl, async (db) => {
      await db.query("BEGIN");
      try {
        await db.query("CREATE SCHEMA search_path_qa");
        await db.query(
          "CREATE FUNCTION search_path_qa.jsonb_typeof(jsonb) RETURNS text LANGUAGE sql IMMUTABLE AS $$ SELECT 'shadowed'::text $$",
        );
        await db.query("SET LOCAL search_path = search_path_qa, pg_catalog");
        await db.query(
          "ALTER FUNCTION musecity.article_search_text(jsonb) RESET search_path",
        );
        const document = JSON.stringify({
          type: "doc",
          content: [
            {
              type: "paragraph",
              content: [{ type: "text", text: "Visible 设计" }],
              attrs: { title: "Ignored attribute" },
            },
          ],
        });
        const extract = () =>
          db.one<{ text: string }>(
            "SELECT musecity.article_search_text($1::jsonb) AS text",
            [document],
          );
        expect(await extract()).toEqual({ text: "" });
        await db.query(
          readFileSync("migrations/0011_article_search_path.sql", "utf8"),
        );
        expect(await extract()).toEqual({ text: "Visible 设计\n" });
        expect(
          await db.one(
            "SELECT proconfig, provolatile, prosecdef FROM pg_proc WHERE oid='musecity.article_search_text(jsonb)'::regprocedure",
          ),
        ).toEqual({
          proconfig: ["search_path=pg_catalog"],
          provolatile: "i",
          prosecdef: false,
        });
      } finally {
        await db.query("ROLLBACK");
      }
    });
  });

  it("retains the exact checksums of every historical migration", () => {
    for (const [name, checksum] of Object.entries(historicalChecksums))
      expect(
        createHash("sha256")
          .update(readFileSync("migrations/" + name))
          .digest("hex"),
        name,
      ).toBe(checksum);
  });

  it("applies the actual SQL with zero help rows while preserving updates and historical idempotency snapshots", async () => {
    await inHistoricalSchema(async (db, prefix) => {
      const before = await db.one<{ value: unknown }>(
        "SELECT to_jsonb(p)-'title'-'expected_outcome'-'help_status' AS value FROM musecity.posts p WHERE id=$1",
        [prefix + "-update"],
      );
      const idempotency = await db.query(
        "SELECT * FROM musecity.idempotency WHERE actor_key=$1",
        [prefix],
      );
      await db.query(removalSql);
      for (const retired of ["title", "expected_outcome", "help_status"])
        expect(
          (await columns(db)).map((column) => column.column_name),
        ).not.toContain(retired);
      expect(
        await db.one(
          "SELECT to_jsonb(p) AS value FROM musecity.posts p WHERE id=$1",
          [prefix + "-update"],
        ),
      ).toEqual(before);
      expect(
        await db.query(
          "SELECT * FROM musecity.idempotency WHERE actor_key=$1",
          [prefix],
        ),
      ).toEqual(idempotency);
      await db.query("SAVEPOINT new_kind_constraint");
      await expect(
        db.query(
          "INSERT INTO musecity.posts(id,owner_account_id,kind,text) VALUES($1,$2,'help','Rejected old kind')",
          [prefix + "-invalid", prefix],
        ),
      ).rejects.toMatchObject({ code: "23514" });
      await db.query("ROLLBACK TO SAVEPOINT new_kind_constraint");
      expect(
        await db.query("SELECT id FROM musecity.posts WHERE id=$1", [
          prefix + "-invalid",
        ]),
      ).toEqual([]);
    });
  });

  for (const state of ["visible", "hidden", "deleted"] as const)
    it(`rolls back the whole migration transaction when a ${state} help row exists`, async () => {
      await inHistoricalSchema(async (db, prefix) => {
        await db.query(
          "INSERT INTO musecity.posts(id,owner_account_id,kind,text,title,expected_outcome,help_status,blocked,deleted) VALUES($1,$2,'help','Historical request','Request','Outcome','open',$3,$4)",
          [prefix + "-help", prefix, state === "hidden", state === "deleted"],
        );
        const oldColumns = await columns(db);
        const oldConstraints = await constraints(db);
        const oldPosts = await db.query(
          "SELECT * FROM musecity.posts WHERE owner_account_id=$1 ORDER BY id",
          [prefix],
        );
        const oldIdempotency = await db.query(
          "SELECT * FROM musecity.idempotency WHERE actor_key=$1",
          [prefix],
        );
        await db.query("SAVEPOINT migration_transaction");
        // Prove surrounding transaction writes also roll back, not just the DDL.
        await db.query(
          "UPDATE musecity.posts SET text='Must roll back' WHERE id=$1",
          [prefix + "-update"],
        );
        await db.query(
          "UPDATE musecity.idempotency SET request_hash='must-roll-back' WHERE actor_key=$1",
          [prefix],
        );
        await expect(db.query(removalSql)).rejects.toMatchObject({
          code: "P0001",
          message: "Help removal requires zero help rows; no data was changed",
        });
        await db.query("ROLLBACK TO SAVEPOINT migration_transaction");
        expect(await columns(db)).toEqual(oldColumns);
        expect(await constraints(db)).toEqual(oldConstraints);
        expect(
          await db.query(
            "SELECT * FROM musecity.posts WHERE owner_account_id=$1 ORDER BY id",
            [prefix],
          ),
        ).toEqual(oldPosts);
        expect(
          await db.query(
            "SELECT * FROM musecity.idempotency WHERE actor_key=$1",
            [prefix],
          ),
        ).toEqual(oldIdempotency);
      });
    });
});
