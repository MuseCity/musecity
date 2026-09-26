import { readFileSync } from "node:fs";
import { parse } from "dotenv";
import { spawn } from "node:child_process";
import { resolve } from "node:path";
import { assertLocalTarget } from "./local-target";
import { assertCloudTarget } from "./cloud-target";
const cloud = process.argv.includes("--cloud");
const connectionString: string = cloud
  ? (parse(readFileSync(".dev.vars")).SUPABASE_DATABASE_URL ?? "")
  : JSON.parse(readFileSync(".local/database.json", "utf8")).runtimeUrl;
if (!connectionString)
  throw new Error(
    "Set the dedicated SUPABASE_DATABASE_URL in .dev.vars first.",
  );
if (!cloud) assertLocalTarget(connectionString, "musecity", "musecity_app");
if (cloud) assertCloudTarget(connectionString, "musecity_worker");
const child = spawn(
  "corepack",
  [
    "pnpm",
    "exec",
    "react-router",
    "dev",
    "--host",
    "127.0.0.1",
    "--port",
    "5190",
    "--strictPort",
  ],
  {
    stdio: "inherit",
    env: {
      ...process.env,
      ...(cloud
        ? { NODE_EXTRA_CA_CERTS: resolve(".local/supabase-ca.crt") }
        : {}),
      CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_DATABASE: connectionString,
    },
  },
);
for (const signal of ["SIGINT", "SIGTERM"] as const)
  process.on(signal, () => child.kill(signal));
child.on("exit", (code) => process.exit(code ?? 1));
