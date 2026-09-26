import { parse } from "dotenv";
import { readFileSync } from "node:fs";
import pg from "pg";
import { assertCloudTarget } from "./cloud-target";
const vars = parse(readFileSync(".dev.vars", "utf8"));
const connectionString = vars.SUPABASE_DATABASE_URL;
if (!connectionString) throw new Error("SUPABASE_DATABASE_URL is empty");
const url = assertCloudTarget(connectionString, "musecity_worker");
console.log(
  JSON.stringify({
    host: url.hostname,
    port: url.port || "5432",
    sslmode: url.searchParams.get("sslmode"),
  }),
);
const client = new pg.Client({
  connectionString: (() => {
    const connection = new URL(url);
    connection.searchParams.delete("sslmode");
    return connection.toString();
  })(),
  ssl: {
    ca: readFileSync(".local/supabase-ca.crt", "utf8"),
    rejectUnauthorized: true,
  },
  connectionTimeoutMillis: 10000,
});
await client.connect();
try {
  const result = await client.query(
    "SELECT current_user AS role,r.rolsuper,r.rolcreatedb,r.rolcreaterole,has_schema_privilege(current_user,'musecity','USAGE') AS schema_usage,(SELECT ssl FROM pg_stat_ssl WHERE pid=pg_backend_pid()) AS tls,(SELECT count(*)::int FROM musecity.tags) AS tags FROM pg_roles r WHERE rolname=current_user",
  );
  // The pooler's internal database connection may report ssl=false. Check the
  // actual client-to-pooler TLS transport instead of treating that as our TLS state.
  const stream = (
    client as unknown as {
      connection: { stream: { encrypted: boolean; authorized: boolean } };
    }
  ).connection.stream;
  console.log(
    JSON.stringify({
      ...result.rows[0],
      backendTls: result.rows[0].tls,
      tls: stream.encrypted && stream.authorized,
    }),
  );
} finally {
  await client.end();
}
