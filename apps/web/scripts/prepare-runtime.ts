import { randomBytes, pbkdf2Sync, createHmac, createHash } from "node:crypto";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { parse } from "dotenv";
import pg from "pg";
import { assertLocalTarget } from "./local-target";
import { assertCloudTarget, cloudProject, sessionPooler } from "./cloud-target";
const target = ".local/supabase-runtime.json";
if (existsSync(target))
  throw new Error(
    "Runtime credential already prepared; reuse it rather than rotating implicitly.",
  );
const source = assertCloudTarget(
  parse(readFileSync("../../.env", "utf8")).SUPABASE_DATABASE_URL,
  "postgres",
);
const password = randomBytes(32).toString("base64url");
const salt = randomBytes(16);
const salted = pbkdf2Sync(password, salt, 4096, 32, "sha256");
const clientKey = createHmac("sha256", salted).update("Client Key").digest();
const storedKey = createHash("sha256").update(clientKey).digest("base64");
const serverKey = createHmac("sha256", salted)
  .update("Server Key")
  .digest("base64");
const verifier = `SCRAM-SHA-256$4096:${salt.toString("base64")}$${storedKey}:${serverKey}`;
// Verify the generated SCRAM credential against the isolated local PostgreSQL before using it remotely.
const local = JSON.parse(readFileSync(".local/database.json", "utf8"));
assertLocalTarget(local.testAdminUrl, "musecity_test", "musecity_admin");
const admin = new pg.Client({ connectionString: local.testAdminUrl });
await admin.connect();
const testRole = "musecity_verifier_" + randomBytes(4).toString("hex");
try {
  await admin.query(
    "CREATE ROLE " +
      pg.escapeIdentifier(testRole) +
      " LOGIN PASSWORD " +
      pg.escapeLiteral(verifier),
  );
  const u = new URL(local.testAdminUrl);
  u.username = testRole;
  u.password = password;
  const check = new pg.Client({ connectionString: u.toString() });
  await check.connect();
  await check.query("SELECT 1");
  await check.end();
} finally {
  await admin.query("DROP ROLE IF EXISTS " + pg.escapeIdentifier(testRole));
  await admin.end();
}
source.hostname = sessionPooler;
source.port = "5432";
source.username = `musecity_worker.${cloudProject}`;
source.password = password;
source.searchParams.set("sslmode", "verify-full");
writeFileSync(target, JSON.stringify({ connectionString: source.toString() }), {
  mode: 0o600,
});
writeFileSync(
  ".local/runtime-role.sql",
  `CREATE ROLE musecity_worker LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION PASSWORD ${pg.escapeLiteral(verifier)};\nGRANT musecity_runtime TO musecity_worker;\nALTER ROLE musecity_worker SET statement_timeout='15s';\n`,
  { mode: 0o600 },
);
console.log(
  "Prepared a verified, dedicated runtime credential in an ignored file; no plaintext is written into migration history.",
);
