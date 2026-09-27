// Run after verify-seo.ts with the isolated local fixture still running.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
const fixture = JSON.parse(
  readFileSync(".local/seo-verification.json", "utf8"),
);
assert.equal(fixture.origin, "http://127.0.0.1:5191");
const session = "musecity-seo-browser-" + process.pid;
function browser(...args) {
  const result = JSON.parse(
    execFileSync("agent-browser", ["--session", session, "--json", ...args], {
      encoding: "utf8",
      timeout: 60000,
      maxBuffer: 2 * 1024 * 1024,
    }),
  );
  assert.ok(result.success, result.error);
  return result.data;
}
const evaluate = (code) => browser("eval", code).result;
const check = (condition, label) =>
  evaluate(
    `(async()=>{const end=Date.now()+10000;while(!(${condition})){if(Date.now()>end)throw Error(${JSON.stringify(label)});await new Promise(r=>setTimeout(r,50));}return true;})()`,
  );
const counts = 'document.querySelectorAll(".work-title a").length';
const comments =
  'document.querySelectorAll(".comment-list [id^=comment-]").length';
const base = "/?view=sites&tag=" + fixture.tag;
const done = [];
try {
  browser("open", fixture.origin + base);
  check(
    counts +
      '===20 && [...document.querySelectorAll("button")].some(b=>b.textContent==="Join" && !b.disabled)',
    "initial page",
  );
  check('!document.querySelector("vite-error-overlay")', "no overlay");
  const second = evaluate('document.querySelector(".load-more a").href');
  evaluate('document.querySelector(".load-more a").click()');
  check(counts + "===40", "40 websites");
  evaluate('document.querySelector(".load-more a").click()');
  check(counts + "===45", "45 websites");
  check('!document.querySelector(".load-more a")', "last page");
  done.push("anonymous Load more: 20 → 40 → 45");
  browser("open", second);
  check(counts + "===20", "direct second page");
  assert.equal(
    evaluate('document.querySelector("link[rel=canonical]").href'),
    second,
  );
  evaluate('document.querySelector(".load-more a").click()');
  check(counts + "===25", "second page continuation");
  done.push(
    "direct second-page URL hydrates and continues without a repeated cursor",
  );
  // Login must discard the anonymous cursor, and account changes start a new projection.
  evaluate(
    '[...document.querySelectorAll("button")].find(b=>b.textContent==="Join").click()',
  );
  check(
    '!new URL(location.href).searchParams.has("cursor") && ' + counts + "===20",
    "login resets pagination",
  );
  evaluate('document.querySelector(".load-more button").click()');
  check(counts + "===40", "authenticated continuation");
  evaluate(
    '[...document.querySelectorAll("button")].find(b=>b.textContent.includes("Switch test account")).click()',
  );
  check(
    counts +
      '===20 && !!document.querySelector(".load-more button") && !document.body.innerText.includes("Reload this list to continue.")',
    "identity switch",
  );
  done.push(
    "login clears URL cursor; authenticated pagination and identity reset succeed",
  );
  evaluate('document.querySelector(".account-button").click()');
  evaluate(
    '[...document.querySelectorAll(".account-menu button")].find(b=>b.textContent.includes("Sign out")).click()',
  );
  check(
    counts + '===20 && !!document.querySelector(".load-more a")',
    "logout resets anonymous pagination",
  );
  done.push("logout discards authenticated pages and restores anonymous links");
  browser("open", fixture.origin + fixture.workPath);
  check(
    comments +
      '===20 && !!document.querySelector("#conversation .load-more a")',
    "SSR comment hydration",
  );
  const commentSecond = evaluate(
    'document.querySelector("#conversation .load-more a").href',
  );
  evaluate('document.querySelector("#conversation .load-more a").click()');
  check(comments + "===40", "40 comments");
  evaluate('document.querySelector("#conversation .load-more a").click()');
  check(comments + "===45", "45 comments");
  browser("open", commentSecond);
  check(comments + "===20", "direct comment page");
  evaluate('document.querySelector("#conversation .load-more a").click()');
  check(comments + "===25", "comment continuation");
  evaluate(
    '[...document.querySelectorAll("button")].find(b=>b.textContent==="Join").click()',
  );
  check(
    '!new URL(location.href).searchParams.has("commentCursor") && ' +
      comments +
      "===20",
    "comment login reset",
  );
  done.push("comments: 20 → 40 → 45; direct later page and login reset");
  // Navigate with React Router to cover its .data transport, not just full documents.
  evaluate(
    '[...document.querySelectorAll("nav a")].find(a=>a.getAttribute("href")==="/neighbors").click()',
  );
  check(
    'location.pathname==="/neighbors" && document.querySelector("link[rel=canonical]")?.href===location.origin+"/neighbors"',
    "client navigation metadata",
  );
  done.push("client navigation preserves document canonical and indexability");
  const cacheChecks = evaluate(
    'import("/e2e/neighborhood-cache-checks.tsx").then(m=>m.runNeighborhoodCacheChecks())',
  );
  done.push(...cacheChecks);
  const errors = browser("errors");
  assert.ok(!errors.errors?.length, JSON.stringify(errors));
  writeFileSync(
    ".local/seo-browser-verification.json",
    JSON.stringify(
      { passed: done, errors, scope: "local browser, simulated identity" },
      null,
      2,
    ),
  );
  console.log(JSON.stringify({ passed: done, errors }));
} finally {
  browser("close");
}
