import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve, join } from "node:path";
import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import pg from "pg";
import { assertLocalTarget } from "./local-target";
const dir = resolve(".local");
const container = "musecity-local";
mkdirSync(dir, { recursive: true, mode: 0o700 });
const configPath = join(dir, "database.json");
type LocalConfig = {
  adminUrl: string;
  runtimeUrl: string;
  testAdminUrl: string;
  testUrl: string;
};
let config: LocalConfig;
if (existsSync(configPath))
  config = JSON.parse(readFileSync(configPath, "utf8"));
else {
  const password = randomBytes(24).toString("hex");
  const runtimePassword = randomBytes(24).toString("hex");
  const admin = "postgres://musecity_admin:" + password + "@127.0.0.1:65433/";
  const runtime =
    "postgres://musecity_app:" + runtimePassword + "@127.0.0.1:65433/";
  config = {
    adminUrl: admin + "musecity",
    runtimeUrl: runtime + "musecity",
    testAdminUrl: admin + "musecity_test",
    testUrl: runtime + "musecity_test",
  };
  writeFileSync(join(dir, "pg-password"), password, { mode: 0o600 });
  writeFileSync(configPath, JSON.stringify(config), { mode: 0o600 });
}
const e2eAdmin = new URL(config.adminUrl);
e2eAdmin.pathname = "/musecity_e2e";
const e2eRuntime = new URL(config.runtimeUrl);
e2eRuntime.pathname = "/musecity_e2e";
Object.assign(config, {
  e2eAdminUrl: e2eAdmin.toString(),
  e2eUrl: e2eRuntime.toString(),
});
writeFileSync(configPath, JSON.stringify(config), { mode: 0o600 });
assertLocalTarget(config.adminUrl, "musecity", "musecity_admin");
assertLocalTarget(config.runtimeUrl, "musecity", "musecity_app");
assertLocalTarget(config.testAdminUrl, "musecity_test", "musecity_admin");
assertLocalTarget(config.testUrl, "musecity_test", "musecity_app");
const env = {
  ...process.env,
  POSTGRES_PASSWORD: new URL(config.adminUrl).password,
};
let existing;
try {
  existing = JSON.parse(
    execFileSync("docker", ["inspect", container], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }),
  )[0];
} catch {
  /* The named container does not exist yet. */
}
if (existing) {
  const binding = existing.HostConfig.PortBindings["5432/tcp"]?.[0];
  if (
    existing.Config.Labels?.app !== "musecity-local" ||
    binding?.HostIp !== "127.0.0.1" ||
    binding?.HostPort !== "65433" ||
    !existing.Mounts.some(
      (m: { Name: string; Destination: string }) =>
        m.Name === "musecity-local-db" &&
        m.Destination === "/var/lib/postgresql/data",
    )
  )
    throw new Error(
      "Refusing to start a container without the Musecity isolation configuration.",
    );
  execFileSync("docker", ["start", container], { stdio: "ignore" });
} else {
  execFileSync(
    "docker",
    [
      "run",
      "-d",
      "--name",
      container,
      "--label",
      "app=musecity-local",
      "-p",
      "127.0.0.1:65433:5432",
      "-e",
      "POSTGRES_USER=musecity_admin",
      "-e",
      "POSTGRES_DB=postgres",
      "-e",
      "POSTGRES_PASSWORD",
      "-v",
      "musecity-local-db:/var/lib/postgresql/data",
      "postgres:17-alpine",
    ],
    { env, stdio: "ignore" },
  );
}
for (let attempt = 0; attempt < 30; attempt++) {
  try {
    execFileSync(
      "docker",
      [
        "exec",
        container,
        "pg_isready",
        "-h",
        "127.0.0.1",
        "-U",
        "musecity_admin",
      ],
      { stdio: "ignore" },
    );
    break;
  } catch {
    if (attempt === 29)
      throw new Error("Local PostgreSQL did not become ready");
    await new Promise((r) => setTimeout(r, 500));
  }
}
const adminUrl = new URL(config.adminUrl);
adminUrl.pathname = "/postgres";
const client = new pg.Client({ connectionString: adminUrl.toString() });
await client.connect();
try {
  if (
    !(await client.query("SELECT 1 FROM pg_roles WHERE rolname='musecity_app'"))
      .rowCount
  ) {
    const password = new URL(config.runtimeUrl).password;
    await client.query(
      "CREATE ROLE musecity_app LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE PASSWORD " +
        pg.escapeLiteral(password),
    );
  }
  for (const name of ["musecity", "musecity_test", "musecity_e2e"]) {
    if (
      !(
        await client.query("SELECT 1 FROM pg_database WHERE datname=$1", [name])
      ).rowCount
    )
      await client.query("CREATE DATABASE " + name);
  }
} finally {
  await client.end();
}
console.log(
  "Isolated local PostgreSQL is ready on 127.0.0.1:65433. Run db:migrate next.",
);
