import ts from "typescript";
import { readFileSync, readdirSync } from "node:fs";
import { resolve, join } from "node:path";
import { createHash } from "node:crypto";
const root = resolve("../..");
const musecity = JSON.parse(
  readFileSync(join(root, "assets/musecity-logo-set/source.json"), "utf8"),
);
for (const file of musecity.files) {
  for (const path of [file.path, file.publicPath]) {
    const bytes = readFileSync(join(root, path));
    if (
      createHash("sha256").update(bytes).digest("hex") !== file.sha256 ||
      bytes[25] !== 6
    )
      throw new Error("Musecity original or alpha channel changed: " + path);
  }
}
function walk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)],
  );
}
for (const path of [...walk("src"), ...walk("workers")]) {
  const text = readFileSync(path, "utf8");
  if (
    /from\s+['"][^'"]*(?:e2e|tests)\//.test(text) ||
    /fixture:(?:alice|bob)|AUTH_BYPASS|SKIP_AUTH/.test(text)
  )
    throw new Error("Production imports test identity: " + path);
}
const parsed = ts.parseConfigFileTextToJson(
  "wrangler.jsonc",
  readFileSync("wrangler.jsonc", "utf8"),
);
if (parsed.error) throw new Error("Invalid Wrangler configuration");
const config = parsed.config;
if (process.argv.includes("--deployment")) {
  if (!config.hyperdrive?.[0]?.id || /^0+$/.test(config.hyperdrive[0].id))
    throw new Error("Configure a real Hyperdrive binding before deployment.");
  if (config.vars.APP_ORIGIN !== "https://musecity.xyz")
    throw new Error("Configure the production origin before deployment.");
  if (!config.vars.PRIVY_APP_ID)
    throw new Error("Configure the production Privy App ID before deployment.");
  if (
    !config.account_id ||
    !config.routes?.some(
      (route: { pattern: string }) => route.pattern === "musecity.xyz",
    )
  )
    throw new Error(
      "Configure the new Cloudflare account and domain before deployment.",
    );
}
console.log(
  "Guard passed: " +
    musecity.files.length +
    " Musecity originals and their public copies intact; production/test identity boundary intact.",
);
