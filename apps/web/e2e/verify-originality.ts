import assert from "node:assert/strict";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { assertLocalTarget } from "../scripts/local-target";
const local = JSON.parse(readFileSync(".local/database.json", "utf8"));
assertLocalTarget(local.e2eUrl, "musecity_e2e", "musecity_app");
const origin = "http://127.0.0.1:5191";
const checks: string[] = [];
async function api(path: string, body?: unknown) {
  const response = await fetch(origin + "/api/v1" + path, {
    method: body === undefined ? "GET" : "POST",
    headers: {
      Authorization: "Bearer fixture:alice",
      "Content-Type": "application/json",
      "Idempotency-Key": crypto.randomUUID(),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const value: any = await response.json();
  assert.ok(
    response.ok,
    JSON.stringify({ path, status: response.status, value }),
  );
  return value;
}
const me = await api("/me");
assert.match(me.websiteMarker, /^mc_u_/);
checks.push("private identity provides a dedicated public marker");
const bytes = readFileSync("public/brand/icon.png");
const image = await api("/media/uploads", {
  mimeType: "image/png",
  byteSize: bytes.length,
});
const uploaded = await fetch(origin + image.uploadUrl, {
  method: "PUT",
  headers: { "Content-Type": "image/png", "X-Upload-Token": image.uploadToken },
  body: bytes,
});
assert.ok(uploaded.ok);
await api("/media/" + image.mediaId + "/complete", {});
const title = "Local original website " + Date.now();
const content = {
  type: "website",
  title,
  description:
    "Local acceptance only; intercepted external HTML in real workerd.",
  websiteUrl: "https://creator.example.com/owned",
  coverMediaId: image.mediaId,
  aiDeclaration: true,
  aiTools: ["Codex Sites"],
  tagIds: ["design"],
};
const draft = await api("/works", content);
const work = await api("/works/" + draft.workId + "/publish", {
  revisionId: draft.revisionId,
});
assert.equal(work.originality.subject.id, me.id);
checks.push(
  "HTTP publish verifies the synthetic page using native HTMLRewriter",
);
for (const path of [
  "/works/" + work.workId,
  "/?view=sites&q=" + encodeURIComponent(title),
  "/codex-sites?q=" + encodeURIComponent(title),
  "/u/" + me.handle + "?q=" + encodeURIComponent(title),
]) {
  const response = await fetch(origin + path);
  assert.equal(response.status, 200);
  const html = await response.text();
  const markup = html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "");
  assert.ok(markup.includes("Original · Verified"), path);
  assert.ok(
    !html.includes(me.websiteMarker),
    "public SSR must omit identity markers",
  );
  checks.push("public SSR badge and marker privacy: " + path);
}
for (const query of [
  "/feed?view=sites&q=" + encodeURIComponent(title),
  "/feed?owner=" + me.handle + "&q=" + encodeURIComponent(title),
]) {
  const response = await fetch(origin + "/api/v1" + query);
  const value: any = await response.json();
  assert.deepEqual(value.items[0].work.originality, work.originality);
  checks.push("public projection matches detail: " + query);
}
const missing = await api("/works", {
  ...content,
  title: "Local website without marker " + Date.now(),
  websiteUrl: "https://creator.example.com/missing",
});
mkdirSync(".local/originality", { recursive: true });
writeFileSync(
  ".local/originality/fixture.json",
  JSON.stringify(
    { work, missing, marker: me.websiteMarker, handle: me.handle, title },
    null,
    2,
  ),
);
writeFileSync(
  ".local/originality/http-checks.json",
  JSON.stringify(
    {
      evidence:
        "local PostgreSQL + synthetic HTTP responses parsed in local workerd; no real third-party verification",
      checks,
    },
    null,
    2,
  ),
);
console.log(
  JSON.stringify({
    checks: checks.length,
    workId: work.workId,
    missingWorkId: missing.workId,
    evidence: ".local/originality/http-checks.json",
  }),
);
