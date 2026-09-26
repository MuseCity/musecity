import { readFileSync, readdirSync } from "node:fs";
import { createHash } from "node:crypto";
import pg from "pg";
import { assertLocalTarget } from "./local-target";
if (process.env.DATABASE_URL)
  throw new Error(
    "db:migrate initializes local Musecity databases only; unset DATABASE_URL.",
  );
const local = JSON.parse(readFileSync(".local/database.json", "utf8"));
const targets = [
  assertLocalTarget(local.adminUrl, "musecity", "musecity_admin"),
  assertLocalTarget(local.testAdminUrl, "musecity_test", "musecity_admin"),
  assertLocalTarget(local.e2eAdminUrl, "musecity_e2e", "musecity_admin"),
];
for (const connectionString of targets) {
  const client = new pg.Client({ connectionString });
  await client.connect();
  try {
    await client.query("SELECT pg_advisory_lock(624139187)");
    await client.query(
      "CREATE SCHEMA IF NOT EXISTS musecity; REVOKE ALL ON SCHEMA musecity FROM PUBLIC; CREATE TABLE IF NOT EXISTS musecity._migrations(name text PRIMARY KEY,checksum text NOT NULL,applied_at timestamptz DEFAULT now())",
    );
    for (const name of readdirSync("migrations")
      .filter((n) => n.endsWith(".sql"))
      .sort()) {
      const source = readFileSync("migrations/" + name, "utf8");
      const checksum = createHash("sha256").update(source).digest("hex");
      const old = (
        await client.query(
          "SELECT checksum FROM musecity._migrations WHERE name=$1",
          [name],
        )
      ).rows[0];
      if (old) {
        if (old.checksum !== checksum)
          throw new Error("Applied migration changed: " + name);
        continue;
      }
      await client.query("BEGIN");
      try {
        await client.query(source);
        await client.query(
          "INSERT INTO musecity._migrations(name,checksum) VALUES($1,$2)",
          [name, checksum],
        );
        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      }
    }
    if (local) {
      await client.query(
        "REVOKE ALL ON ALL TABLES IN SCHEMA musecity FROM musecity_app; REVOKE ALL ON SCHEMA musecity FROM musecity_app; GRANT musecity_runtime TO musecity_app",
      );
    }
    console.log(
      "Migrations verified for " + new URL(connectionString).pathname.slice(1),
    );
  } finally {
    await client.end();
  }
}
