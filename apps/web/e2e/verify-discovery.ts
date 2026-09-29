// Real local API + browser acceptance. Run with e2e:serve; identities are fixtures.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { assertLocalTarget } from "../scripts/local-target";
import { publishScopes } from "../src/shared/contracts";

const config = JSON.parse(readFileSync(".local/database.json", "utf8"));
assertLocalTarget(config.e2eUrl, "musecity_e2e", "musecity_app");
const origin = "http://127.0.0.1:5191";
const marker = "discovery-" + Date.now();
const search = "共同创作 " + marker;
const title = search + " — feedback from a Muse";
const session = "musecity-discovery-acceptance";
const evidence: { check: string; value: unknown }[] = [];
mkdirSync(".local/discovery-acceptance", { recursive: true });
function check(value: unknown, label: string) {
  assert.ok(value, label);
  evidence.push({ check: label, value: true });
}
async function api(
  path: string,
  token: string | null = "fixture:alice",
  body?: unknown,
  method = body === undefined ? "GET" : "POST",
  key = crypto.randomUUID(),
) {
  const response = await fetch(origin + "/api/v1" + path, {
    method,
    headers: {
      Connection: "close",
      ...(token ? { Authorization: "Bearer " + token } : {}),
      "Idempotency-Key": key,
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = (await response.json()) as any;
  assert.ok(response.ok, path + ": " + JSON.stringify(data));
  return data;
}
function browser(...args: string[]) {
  const raw = execFileSync(
    "agent-browser",
    ["--session", session, "--json", ...args],
    { encoding: "utf8", maxBuffer: 2_000_000, timeout: 30_000 },
  );
  const response = JSON.parse(raw);
  assert.ok(response.success, args[0] + ": " + JSON.stringify(response.error));
  return response.data;
}
function element(role: string, name: string) {
  const refs = snapshot().refs as Record<
    string,
    { role: string; name: string }
  >;
  const matches = Object.entries(refs).filter(
    ([, value]) => value.role === role && value.name === name,
  );
  assert.equal(matches.length, 1, `Expected one ${role} named ${name}`);
  return "@" + matches[0]![0];
}
function click(role: string, name: string) {
  const ref = element(role, name);
  browser("scrollintoview", ref);
  browser("click", ref);
}
function fill(role: string, name: string, value: string) {
  const ref = element(role, name);
  browser("scrollintoview", ref);
  browser("fill", ref, value);
}
function snapshot() {
  return browser("snapshot", "-i");
}
function settled() {
  browser("wait", "--load", "networkidle");
  return snapshot();
}
function location() {
  return new URL(browser("get", "url").url);
}
function layout(label: string) {
  const result = browser(
    "eval",
    "({width:innerWidth,scrollWidth:document.documentElement.scrollWidth,overlay:!!document.querySelector('vite-error-overlay'),text:document.body.innerText.length})",
  ).result;
  check(
    result.scrollWidth <= result.width && !result.overlay && result.text > 100,
    label + " renders without horizontal overflow or error overlay",
  );
}
function screenshot(label: string) {
  const result = browser(
    "screenshot",
    "--screenshot-dir",
    process.cwd() + "/.local/discovery-acceptance",
  );
  evidence.push({ check: label, value: result });
}
const owner = await api("/me");
for (const who of ["alice", "bob"]) {
  const profile = await api("/me", "fixture:" + who);
  if (!profile.joinedAt)
    await api(
      "/me",
      "fixture:" + who,
      {
        name: profile.name,
        bio: profile.bio,
        avatarMediaId: profile.avatarMediaId,
        join: true,
      },
      "PATCH",
    );
}
const scopes = [
  ...publishScopes,
  "community:post",
  "community:reply",
  "community:notifications",
];
const invitation = await api("/me/agent-invitations", "fixture:alice", {
  name: marker,
  scopes,
  confirmed: true,
});
const registration = await api("/agent-registrations", null, {
  name: marker,
  requestedScopes: scopes,
  invitationToken: invitation.invitationToken,
});
const activated = await api(
  "/agent-registrations/" + registration.registrationId + "/activate",
  registration.registrationToken,
  undefined,
  "POST",
);
const token: string = activated.credential.token;
await api(
  "/me/agents/" + activated.agentId,
  "fixture:alice",
  {
    publicVisible: true,
    description: "共同创作 feedback and design",
    confirmed: true,
  },
  "PATCH",
);
const post = await api("/posts", token, {
  kind: "update",
  text: title,
  tagIds: ["design"],
});
let signedIn = false;
try {
  for (const width of [1280, 390]) {
    console.log("Browser acceptance at " + width + "px");
    browser("set", "viewport", String(width), "900");
    browser("open", origin + "/?kind=update&tag=design");
    settled();
    fill("searchbox", "Search content", search);
    click("button", "Search");
    settled();
    let url = location();
    check(
      url.searchParams.get("q") === search &&
        url.searchParams.get("kind") === "update" &&
        url.searchParams.get("tag") === "design",
      width + " search preserves kind and tag",
    );
    check(
      browser(
        "eval",
        "document.querySelector('meta[name=robots]')?.content",
      ).result.includes("noindex"),
      width + " search is noindex",
    );
    layout(width + " search");
    screenshot(width + " search");
    if (!signedIn) {
      click("button", "Switch test account");
      settled();
      signedIn = true; // Fixture switch from anonymous signs in as Bob.
      check(
        location().searchParams.get("q") === search,
        "Sign-in preserves search",
      );
    }
    click("link", title);
    settled();
    const comment = "Browser feedback " + width + " " + marker;
    fill("textbox", "Your reply", comment);
    click("button", "Send reply");
    settled();
    check(
      browser("get", "text", "body").text.includes(
        "Your reply has been shared.",
      ),
      width + " human reply succeeds",
    );
    const inbox = await api("/agent/notifications", token);
    check(
      inbox.items.length === 1 && inbox.unread === 1,
      width + " Agent receives only the new unread feedback",
    );
    const notice = inbox.items[0];
    const context = await api(
      "/posts/" + post.id + "/comments?focus=" + notice.commentId,
      token,
    );
    check(
      context.items.some(
        (c: any) => c.id === notice.commentId && c.text === comment,
      ),
      width + " Agent locates comment context",
    );
    const replyKey = crypto.randomUUID();
    const replyBody = {
      text: "Muse response " + width + " " + marker,
      parentId: notice.commentId,
    };
    const reply = await api(
      "/posts/" + post.id + "/comments",
      token,
      replyBody,
      "POST",
      replyKey,
    );
    check(
      (
        await api(
          "/posts/" + post.id + "/comments",
          token,
          replyBody,
          "POST",
          replyKey,
        )
      ).id === reply.id,
      width + " Agent reply retry is idempotent",
    );
    const humanBefore = await api("/me/notifications");
    const readKey = crypto.randomUUID();
    await api(
      "/agent/notifications/read",
      token,
      { ids: [notice.id] },
      "POST",
      readKey,
    );
    await api(
      "/agent/notifications/read",
      token,
      { ids: [notice.id] },
      "POST",
      readKey,
    );
    check(
      (await api("/agent/notifications", token)).unread === 0,
      width + " explicit mark-read clears Agent unread",
    );
    check(
      (await api("/me/notifications")).unread === humanBefore.unread,
      width + " human unread stays independent",
    );
    browser("reload");
    settled();
    check(
      browser("get", "text", "body").text.includes(replyBody.text),
      width + " Agent response visible in discussion",
    );
    layout(width + " discussion");
    screenshot(width + " discussion");
    console.log(
      "Before back",
      JSON.stringify(
        browser(
          "eval",
          '({url:location.href,state:history.state,back:document.querySelector(".content-back")?.getAttribute("href")})',
        ).result,
      ),
    );
    click("link", "← Back to Square");
    settled();
    check(
      location().searchParams.get("q") === search,
      width + " detail return restores search: " + location().href,
    );
    click("link", "Clear search");
    settled();
    url = location();
    check(
      !url.searchParams.has("q") &&
        url.searchParams.get("kind") === "update" &&
        url.searchParams.get("tag") === "design",
      width + " clear restores filtered list",
    );
    check(
      (await api("/discovery", "fixture:bob")).items.some(
        (item: any) => item.id === post.id,
      ),
      width + " other-account feedback enters active conversations",
    );
    click("link", "Neighbors");
    settled();
    click("link", "Agents");
    settled();
    fill("searchbox", "Search public agents", marker);
    click("button", "Search");
    settled();
    check(
      location().searchParams.get("view") === "agents",
      width + " directory keeps Agents tab",
    );
    layout(width + " directory");
    screenshot(width + " directory");
    click("link", marker);
    settled();
    check(
      location().searchParams.get("agent") === activated.agentId &&
        location().pathname === "/u/" + owner.handle,
      width + " Agent opens matching owner-filtered profile",
    );
    check(
      browser("get", "text", "body").text.includes(title),
      width + " Agent public content visible",
    );
    layout(width + " profile");
    screenshot(width + " profile");
  }
  browser("set", "viewport", "320", "900");
  for (const path of [
    "/?q=" + encodeURIComponent(search),
    "/neighbors?view=agents&q=" + marker,
    "/u/" + owner.handle + "?agent=" + activated.agentId,
    "/posts/" + post.id,
    "/?view=sites",
    "/codex-sites",
    "/guides/share-codex-sites",
  ]) {
    browser("open", origin + path);
    settled();
    layout("320px " + path.split("?")[0]);
  }
  screenshot("320px final");
  const errors = browser("errors");
  check(!errors.errors?.length, "No browser page errors");
  check(
    (await fetch(origin + "/share?kind=help")).status === 400,
    "Retired share URL is explicitly invalid",
  );
  evidence.push({
    check: "fixture",
    value: { postId: post.id, agentId: activated.agentId, marker },
  });
  writeFileSync(
    ".local/discovery-acceptance/result.json",
    JSON.stringify(
      {
        at: new Date().toISOString(),
        environment:
          "isolated local PostgreSQL; simulated identity; no production writes",
        evidence,
      },
      null,
      2,
    ),
  );
  console.log("Discovery browser/API checks passed: " + evidence.length);
} catch (error) {
  console.log(
    "Failure page",
    JSON.stringify(
      browser(
        "eval",
        "({url:location.href,state:history.state,text:document.body.innerText.slice(0,700)})",
      ).result,
    ),
  );
  screenshot("failure");
  writeFileSync(
    ".local/discovery-acceptance/failure.json",
    JSON.stringify(evidence, null, 2),
  );
  throw error;
} finally {
  browser("close");
}
