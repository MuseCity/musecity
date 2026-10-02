// Exercise real SDK key reuse across workerd requests with synthetic credentials.
// All outbound traffic is intercepted locally; no Privy app or database is used.
import assert from "node:assert/strict";
import { generateKeyPairSync, sign } from "node:crypto";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const wrangler = createRequire(require.resolve("wrangler/package.json"));
const { build } = wrangler("esbuild");
const { Miniflare, convertV4MiniflareOptions } = wrangler("miniflare");
const appId = "local-workerd-key-cache";
const { publicKey, privateKey } = generateKeyPairSync("ec", {
  namedCurve: "P-256",
});
const jwk = { ...publicKey.export({ format: "jwk" }), kid: "local" };
function token(subject, expired = false) {
  const encode = (value) =>
    Buffer.from(JSON.stringify(value)).toString("base64url");
  const now = Math.floor(Date.now() / 1000);
  const body = `${encode({ alg: "ES256", typ: "JWT", kid: jwk.kid })}.${encode({
    aud: appId,
    iss: "privy.io",
    sub: subject,
    sid: "local-session",
    iat: now,
    exp: expired ? 1 : now + 3600,
  })}`;
  return (
    body +
    "." +
    sign("sha256", Buffer.from(body), {
      key: privateKey,
      dsaEncoding: "ieee-p1363",
    }).toString("base64url")
  );
}
const bundle = await build({
  stdin: {
    contents: `import { privyVerifier } from './src/server/auth.ts';
      export default { async fetch(request) {
        try {
          const user = await privyVerifier('${appId}', 'local-secret')(request.headers.get('Authorization'));
          return Response.json({ user });
        } catch (error) {
          return Response.json({ code: error.code }, { status: error.status || 500 });
        }
      }};`,
    resolveDir: process.cwd(),
    sourcefile: "local-privy-worker.ts",
  },
  bundle: true,
  write: false,
  format: "esm",
  platform: "browser",
  external: ["node:*"],
  conditions: ["workerd", "worker", "browser"],
});
let keyRequests = 0;
const worker = new Miniflare(
  convertV4MiniflareOptions({
    modules: true,
    script: bundle.outputFiles[0].text,
    compatibilityDate: "2026-09-22",
    compatibilityFlags: ["nodejs_compat", "global_fetch_strictly_public"],
    outboundService: async (request) => {
      assert.equal(
        new URL(request.url).pathname,
        `/v1/apps/${appId}/jwks.json`,
      );
      keyRequests++;
      return Response.json({ keys: [jwk] });
    },
  }),
);
try {
  const results = await Promise.all(
    Array.from({ length: 5 }, async (_, i) => {
      const user = `did:privy:worker-${i}`;
      const response = await worker.dispatchFetch("http://local.test/", {
        headers: { Authorization: token(user) },
      });
      assert.equal(response.status, 200);
      assert.deepEqual(await response.json(), { user });
    }),
  );
  const coldKeyRequests = keyRequests;
  // jose deliberately avoids sharing an in-flight fetch across Cloudflare
  // request contexts. Completed keys, rather than pending I/O, must be reused.
  assert.ok(coldKeyRequests >= 1 && coldKeyRequests <= results.length);
  for (let i = 0; i < 5; i++) {
    const user = `did:privy:worker-warm-${i}`;
    const warm = await worker.dispatchFetch("http://local.test/", {
      headers: { Authorization: token(user) },
    });
    assert.equal(warm.status, 200);
    assert.deepEqual(await warm.json(), { user });
  }
  const expired = await worker.dispatchFetch("http://local.test/", {
    headers: { Authorization: token("did:privy:worker-expired", true) },
  });
  assert.equal(expired.status, 401);
  assert.equal(keyRequests, coldKeyRequests);
  console.log(
    JSON.stringify({
      concurrentRequests: results.length,
      warmRequests: 5,
      expiredStatus: expired.status,
      coldKeyRequests,
      warmKeyRequests: keyRequests - coldKeyRequests,
    }),
  );
} finally {
  await worker.dispose();
}
