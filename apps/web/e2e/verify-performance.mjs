// Anonymous local production-build measurements; requires agent-browser.
// Run against the local Wrangler preview, never a cloud database or fixture login.
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import assert from "node:assert/strict";

const phase = process.argv[2];
assert.ok(["before", "after"].includes(phase), "Use before or after");
const origin = "http://127.0.0.1:5190";
const results = [];
let session;
function browser(...args) {
  const output = JSON.parse(
    execFileSync(
      "agent-browser",
      ["--headed", "false", "--session", session, "--json", ...args],
      {
        encoding: "utf8",
        timeout: 60000,
        maxBuffer: 2 * 1024 * 1024,
      },
    ),
  );
  assert.ok(output.success, output.error);
  return output.data;
}
const ready = `async () => {
  const deadline = Date.now() + 30000;
  while (
    ![...document.querySelectorAll('button')].some(b => b.textContent === 'Join' && !b.disabled) ||
    !performance.getEntriesByType('resource').some(r => /^\\/api\\/v1\\/apps\\/[^/]+$/.test(new URL(r.name).pathname))
  ) {
    if (Date.now() > deadline) throw Error('Anonymous auth initialization timed out');
    await new Promise(r => setTimeout(r, 100));
  }
  // Allow completed local API requests and SDK startup resources to settle.
  let last = -1, stable = 0;
  while (stable < 3 && Date.now() < deadline) {
    await new Promise(r => setTimeout(r, 300));
    const count = performance.getEntriesByType('resource').length;
    stable = count === last ? stable + 1 : 0;
    last = count;
  }
  return true;
}`;
const measure = `async () => {
  const lcp = await new Promise(resolve => {
    const timeout = setTimeout(() => { observer.disconnect(); resolve(null); }, 2000);
    const observer = new PerformanceObserver(list => {
      const entry = list.getEntries().at(-1);
      if (entry) {
        clearTimeout(timeout);
        observer.disconnect();
        resolve(entry.startTime);
      }
    });
    observer.observe({ type: 'largest-contentful-paint', buffered: true });
  });
  const nav = performance.getEntriesByType('navigation')[0];
  const all = performance.getEntriesByType('resource');
  const local = all.filter(r => new URL(r.name).origin === location.origin);
  return {
    visibility: document.visibilityState,
    ttfbMs: nav.responseStart,
    fcpMs: performance.getEntriesByName('first-contentful-paint')[0]?.startTime ?? null,
    lcpMs: lcp,
    totalResourceRequests: all.length,
    localTransferredBytes: nav.transferSize + local.reduce((n, r) => n + r.transferSize, 0),
    assets: local.filter(r => new URL(r.name).pathname.startsWith('/assets/')).map(r => ({
      path: new URL(r.name).pathname, transferBytes: r.transferSize, durationMs: r.duration
    })),
    api: local.filter(r => new URL(r.name).pathname.startsWith('/api/v1/')).map(r => ({
      path: new URL(r.name).pathname + new URL(r.name).search, durationMs: r.duration,
      status: r.responseStatus
    }))
  };
}`;
try {
  for (let sample = 1; sample <= 5; sample++) {
    session = `musecity-perf-${phase}-${sample}-${process.pid}`;
    browser("open", origin);
    browser("eval", `(${ready})()`);
    const cold = browser("eval", `(${measure})()`).result;
    assert.ok(
      cold.lcpMs !== null && cold.visibility === "visible",
      `Cold measurement needs a visible painted page: ${JSON.stringify(cold)}`,
    );
    results.push({ sample, scenario: "cold", ...cold });
    browser("open", "about:blank");
    browser("open", origin);
    browser("eval", `(${ready})()`);
    const repeat = browser("eval", `(${measure})()`).result;
    assert.ok(
      repeat.lcpMs !== null && repeat.visibility === "visible",
      `Repeat measurement needs a visible painted page: ${JSON.stringify(repeat)}`,
    );
    results.push({ sample, scenario: "repeat", ...repeat });
    const navigation = browser(
      "eval",
      `(async () => {
        const start = performance.now();
        document.querySelector('nav a[href="/neighbors"]').click();
        const deadline = Date.now() + 15000;
        while (location.pathname !== '/neighbors' || !document.querySelector('input[name="q"]')) {
          if (Date.now() > deadline) throw Error('Neighbor navigation timed out');
          await new Promise(r => setTimeout(r, 20));
        }
        await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
        const readyMs = performance.now() - start;
        await new Promise(r => setTimeout(r, 1000));
        const resources = performance.getEntriesByType('resource').filter(r => r.startTime >= start && new URL(r.name).origin === location.origin);
        return { readyMs, localTransferredBytes: resources.reduce((n,r) => n+r.transferSize,0),
          requests: resources.map(r => ({path: new URL(r.name).pathname + new URL(r.name).search,durationMs:r.duration})),
          api: resources.filter(r => new URL(r.name).pathname.startsWith('/api/v1/')).map(r => new URL(r.name).pathname) };
      })()`,
    ).result;
    results.push({ sample, scenario: "navigation", ...navigation });
    browser("close");
    session = undefined;
    console.log(
      JSON.stringify({
        phase,
        sample,
        coldLcpMs: cold.lcpMs,
        repeatLcpMs: repeat.lcpMs,
        navigationMs: navigation.readyMs,
        coldApi: cold.api.length,
      }),
    );
  }
} finally {
  if (session) browser("close");
  mkdirSync("test-results/performance", { recursive: true });
  writeFileSync(
    `test-results/performance/${phase}.json`,
    JSON.stringify(
      { phase, origin, at: new Date().toISOString(), results },
      null,
      2,
    ),
  );
}
if (phase === "after") {
  for (const result of results) {
    assert.equal(
      result.api.length,
      0,
      `Unexpected duplicate API read: ${result.scenario}`,
    );
    if (result.scenario === "repeat")
      assert.ok(
        result.assets.every((a) => a.transferBytes === 0),
        "Hashed assets must reuse browser cache on normal navigation",
      );
  }
}
