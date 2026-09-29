// Run from apps/web with: corepack pnpm exec tsx e2e/search-performance.ts
// Requires an exclusive musecity_test window. Fixtures and all row changes roll back.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { performance } from "node:perf_hooks";
import type pg from "pg";
import { assertLocalTarget } from "../scripts/local-target";
import { Database, withDatabase } from "../src/server/database";
import { communityFeed } from "../src/server/community";
import type { Actor } from "../src/server/auth";
import type { AccountRow } from "../src/server/schema";

const config = JSON.parse(readFileSync(".local/database.json", "utf8")) as {
  testAdminUrl: string;
};
assertLocalTarget(config.testAdminUrl, "musecity_test", "musecity_admin");
const prefix = "search-perf-" + randomUUID();
const handlePrefix = "perf" + randomUUID().replaceAll("-", "").slice(0, 12);
const outputDir = ".local/search-performance";
const tables = [
  "accounts",
  "agents",
  "media",
  "works",
  "work_revisions",
  "posts",
] as const;
const analyzedTables = [
  "accounts",
  "agents",
  "works",
  "work_revisions",
  "posts",
  "comments",
  "blocks",
  "follows",
  "content_interactions",
] as const;
const report: Record<string, unknown> = {
  startedAt: new Date().toISOString(),
  target: { host: "127.0.0.1", port: 65433, database: "musecity_test" },
  evidence:
    "Actual communityFeed and interaction queries on transaction-local synthetic rows; no HTTP, Privy, cloud, or production-capacity claim.",
  limitations: [
    "Three sequential query-function samples per case; EXPLAIN ANALYZE reruns the captured SQL afterwards. Cache is warm, not a cold-cache benchmark.",
    "Queried tables are analyzed after inserting fixtures, then analyzed again after rollback to restore statistics for the remaining rows. No VACUUM runs.",
    "The normal-viewer case passes an account read from the local fixture database; it does not test identity-provider authentication or issue a token.",
    "Fixtures model content and author scale; existing comments, blocks, follows, and interactions are retained without extra high-engagement fixtures.",
  ],
};
class MeasuredDatabase extends Database {
  queries: {
    sql: string;
    parameters: unknown[];
    durationMs: number;
    rowCount: number;
  }[] = [];
  override async query<T extends pg.QueryResultRow = pg.QueryResultRow>(
    sql: string,
    parameters: unknown[] = [],
  ): Promise<T[]> {
    const start = performance.now();
    const rows = await super.query<T>(sql, parameters);
    this.queries.push({
      sql,
      parameters,
      durationMs: performance.now() - start,
      rowCount: rows.length,
    });
    return rows;
  }
}
async function counts(db: Database) {
  const result: Record<string, number> = {};
  for (const table of tables) {
    const row = await db.one<{ count: number }>(
      `SELECT count(*)::integer AS count FROM musecity.${table}`,
    );
    result[table] = row!.count;
  }
  return result;
}
async function analyze(db: Database) {
  for (const table of analyzedTables)
    await db.query(`ANALYZE musecity.${table}`);
}
async function statistics(db: Database) {
  return db.query(
    "SELECT relname,reltuples,relpages FROM pg_class WHERE relnamespace='musecity'::regnamespace AND relname=ANY($1::text[]) ORDER BY relname",
    [analyzedTables],
  );
}
let failure: unknown;
try {
  await withDatabase(config.testAdminUrl, async (db) => {
    report.database = await db.one(
      "SELECT current_database() AS name,current_setting('server_version') AS version",
    );
    report.statisticsBefore = await statistics(db);
    const before = await counts(db);
    report.rowsBefore = before;
    await db.query("BEGIN");
    try {
      await db.query("SET LOCAL lock_timeout='5s'");
      await db.query(
        `INSERT INTO musecity.accounts(id,privy_user_id,handle,name,joined_at)
        SELECT $1||'-owner-'||i,$1||'-privy-'||i,$2||i,'Local performance owner '||i,now()-interval '30 days' FROM generate_series(1,100) i`,
        [prefix, handlePrefix],
      );
      await db.query(
        `INSERT INTO musecity.agents(id,owner_account_id,name,description,scopes,public_visible)
        SELECT $1||'-agent-'||i,$1||'-owner-'||i,'Local performance Agent '||i,'Synthetic author attribution','["content:read"]'::jsonb,true FROM generate_series(1,100) i`,
        [prefix],
      );
      await db.query(
        `INSERT INTO musecity.media(id,owner_account_id,object_key,mime_type,byte_size,purpose,width,height,status,upload_hash,expires_at)
        SELECT $1||'-media-'||i,$1||'-owner-'||i,$1||'/media/'||i,'image/webp',1000,'content',640,480,'ready',$1||'-upload-hash-'||i,now()+interval '1 day' FROM generate_series(1,100) i`,
        [prefix],
      );
      await db.query(
        `INSERT INTO musecity.works(id,owner_account_id,created_by_agent_id,status,draft_revision_id,published_revision_id,published_at,first_published_at)
        SELECT $1||'-work-'||i,$1||'-owner-'||((i-1)%100+1),CASE WHEN i%2=0 THEN $1||'-agent-'||((i-1)%100+1) END,
        'published',$1||'-revision-'||i,$1||'-revision-'||i,date_trunc('milliseconds',now())-i*interval '1 second',date_trunc('milliseconds',now())-i*interval '1 second'
        FROM generate_series(1,10000) i`,
        [prefix],
      );
      await db.query(
        `INSERT INTO musecity.work_revisions(id,work_id,payload,tag_ids,media_ids)
        SELECT $1||'-revision-'||i,$1||'-work-'||i,
        jsonb_build_object('type',CASE i%4 WHEN 0 THEN 'article' WHEN 1 THEN 'website' WHEN 2 THEN 'video' ELSE 'image' END,
        'title','React design project '||i,'description',repeat('Community React design: 构建设计组件与公开创作。 ',8)||CASE WHEN i=9973 THEN ' raremarker8391 独特检索词' ELSE '' END,
        'aiDeclaration',i%2=0,'aiTools',jsonb_build_array('Local fixture tool'),'tagIds','[]'::jsonb) ||
        CASE i%4 WHEN 0 THEN jsonb_build_object('articleDocument',jsonb_build_object('type','doc','content',jsonb_build_array(
          jsonb_build_object('type','heading','attrs',jsonb_build_object('level',2),'content',jsonb_build_array(jsonb_build_object('type','text','text','公开的设计说明'))),
          jsonb_build_object('type','paragraph','content',jsonb_build_array(jsonb_build_object('type','text','text',repeat('Build accessible React components. 构建可访问的中文设计组件。 ',CASE WHEN i=10000 THEN 700 ELSE 45 END)))))))
        WHEN 1 THEN jsonb_build_object('websiteUrl','https://example.com/site/'||i,'coverMediaId',$1||'-media-'||((i-1)%100+1))
        WHEN 2 THEN jsonb_build_object('videoUrl','https://example.com/video/'||i,'coverMediaId',$1||'-media-'||((i-1)%100+1))
        ELSE jsonb_build_object('imageMediaIds',jsonb_build_array($1||'-media-'||((i-1)%100+1))) END,
        ARRAY[]::text[],CASE WHEN i%4=0 THEN ARRAY[]::text[] ELSE ARRAY[$1||'-media-'||((i-1)%100+1)]::text[] END
        FROM generate_series(1,10000) i`,
        [prefix],
      );
      await db.query(
        `INSERT INTO musecity.posts(id,owner_account_id,agent_id,kind,text,created_at,updated_at)
        SELECT $1||'-post-'||i,$1||'-owner-'||((i-1)%100+1),CASE WHEN i%2=0 THEN $1||'-agent-'||((i-1)%100+1) END,'update',
        repeat('React community update: 构建设计组件，记录公开创作进展。 ',8)||i||CASE WHEN i=9973 THEN ' raremarker8391 独特检索词' ELSE '' END,
        date_trunc('milliseconds',now())-i*interval '1 second',date_trunc('milliseconds',now())-i*interval '1 second' FROM generate_series(1,10000) i`,
        [prefix],
      );
      await db.query("SET CONSTRAINTS ALL IMMEDIATE");
      const populated = await counts(db);
      const expectedDelta = {
        accounts: 100,
        agents: 100,
        media: 100,
        works: 10000,
        work_revisions: 10000,
        posts: 10000,
      };
      for (const table of tables)
        assert.equal(
          populated[table] - before[table],
          expectedDelta[table],
          table + " exact fixture count",
        );
      report.rowsWithFixtures = populated;
      report.fixtureRows = expectedDelta;
      await analyze(db);
      report.statisticsWithFixtures = await statistics(db);
      report.workFormats = await db.query(
        "SELECT payload->>'type' AS type,count(*)::integer AS count FROM musecity.work_revisions WHERE strpos(id,$1)=1 GROUP BY 1 ORDER BY 1",
        [prefix],
      );
      report.searchTextSize = await db.one(
        `SELECT min(length(search_text)) AS min_characters,round(avg(length(search_text)),2) AS mean_characters,max(length(search_text)) AS max_characters,sum(octet_length(search_text)) AS utf8_bytes FROM musecity.work_revisions WHERE strpos(id,$1)=1`,
        [prefix],
      );
      const account = await db.one<AccountRow>(
        "SELECT * FROM musecity.accounts WHERE id=$1",
        [prefix + "-owner-1"],
      );
      assert.ok(account);
      const viewer: Actor = {
        account,
        agent: null,
        key: "account:" + account.id,
      };
      // Execute the measured reads with the real, non-administrator runtime role.
      await db.query("SET LOCAL ROLE musecity_runtime");
      report.queryRole = (await db.one<{ role: string }>(
        "SELECT current_user AS role",
      ))!.role;
      const measured = new MeasuredDatabase(db.client);
      const cases: {
        name: string;
        query?: string;
        viewer?: Actor;
        expectedTotal?: number;
      }[] = [
        { name: "public-default" },
        { name: "public-common-english", query: "React" },
        { name: "public-common-chinese", query: "设计" },
        { name: "public-bilingual-and", query: "REACT 设计" },
        {
          name: "public-rare",
          query: "raremarker8391 独特检索词",
          expectedTotal: 2,
        },
        {
          name: "public-no-match",
          query: "unmatched-perf-sentinel-7791",
          expectedTotal: 0,
        },
        { name: "normal-viewer-common", query: "React 设计", viewer },
      ];
      const results = [];
      for (const scenario of cases) {
        const durations: number[] = [];
        let result;
        for (let sample = 0; sample < 3; sample++) {
          measured.queries = [];
          const start = performance.now();
          result = await communityFeed(
            measured,
            new URLSearchParams(scenario.query ? { q: scenario.query } : {}),
            scenario.viewer,
          );
          durations.push(performance.now() - start);
        }
        assert.ok(result);
        if (scenario.expectedTotal !== undefined) {
          assert.equal(
            result.items.length,
            scenario.expectedTotal,
            scenario.name + " matching result count",
          );
          assert.equal(result.nextCursor, null);
        } else {
          assert.equal(result.items.length, 20, scenario.name + " page size");
          assert.ok(result.nextCursor);
        }
        assert.ok(
          measured.queries.some((query) =>
            query.sql.includes("WITH entries AS"),
          ),
          "captured the actual communityFeed SQL",
        );
        const plans = [];
        for (const query of measured.queries) {
          const explained = await db.client.query<{
            "QUERY PLAN": Record<string, unknown>[];
          }>(
            "EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) " + query.sql,
            query.parameters,
          );
          plans.push({ ...query, plan: explained.rows[0]["QUERY PLAN"][0] });
        }
        const sorted = [...durations].sort((a, b) => a - b);
        results.push({
          name: scenario.name,
          query: scenario.query ?? "",
          viewer: scenario.viewer ? "normal-local-account" : "anonymous",
          returnedItems: result.items.length,
          hasNextPage: !!result.nextCursor,
          functionDurationMs: {
            samples: durations,
            min: sorted[0],
            median: sorted[1],
            max: sorted[2],
          },
          queries: plans,
        });
      }
      report.cases = results;
    } finally {
      await db.query("ROLLBACK");
      await analyze(db);
      report.statisticsAfterRollback = await statistics(db);
      const after = await counts(db);
      report.rowsAfterRollback = after;
      report.rollbackVerified =
        JSON.stringify(after) === JSON.stringify(before);
      assert.deepEqual(after, before, "all synthetic rows rolled back");
      assert.equal(
        (await db.one<{ count: number }>(
          "SELECT count(*)::integer AS count FROM musecity.accounts WHERE strpos(id,$1)=1",
          [prefix],
        ))!.count,
        0,
      );
    }
  });
} catch (error) {
  failure = error;
  report.error =
    error instanceof Error
      ? { name: error.name, message: error.message }
      : { message: String(error) };
} finally {
  report.finishedAt = new Date().toISOString();
  mkdirSync(outputDir, { recursive: true, mode: 0o700 });
  writeFileSync(outputDir + "/report.json", JSON.stringify(report, null, 2), {
    mode: 0o600,
  });
}
if (failure) throw failure;
console.log(
  JSON.stringify(
    {
      report: outputDir + "/report.json",
      fixtureRows: report.fixtureRows,
      rollbackVerified: report.rollbackVerified,
      cases: (
        report.cases as {
          name: string;
          functionDurationMs: unknown;
          queries: { plan: Record<string, unknown> }[];
        }[]
      ).map(({ name, functionDurationMs, queries }) => {
        const plan = queries[0].plan;
        const root = plan.Plan as Record<string, unknown>;
        return {
          name,
          functionDurationMs,
          feedPlan: {
            estimatedRows: root["Plan Rows"],
            actualRows: root["Actual Rows"],
            totalCost: root["Total Cost"],
            executionMs: plan["Execution Time"],
            sharedHitBlocks: root["Shared Hit Blocks"],
            sharedReadBlocks: root["Shared Read Blocks"],
            tempReadBlocks: root["Temp Read Blocks"],
            tempWrittenBlocks: root["Temp Written Blocks"],
          },
        };
      }),
    },
    null,
    2,
  ),
);
