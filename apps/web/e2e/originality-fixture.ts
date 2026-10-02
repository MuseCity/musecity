import { originalityWorker } from "./originality-worker";
import { withDatabase } from "../src/server/database";
import { assertLocalTarget } from "../scripts/local-target";
import { websiteMarkerHtml } from "../src/shared/originality";
import type { WebsiteVerifier } from "../src/server/website-verification";

// Synthetic HTML from the isolated database, parsed by the actual local workerd.
// No requests leave this fixture, even for unrelated seeded website links.
export function fixtureWebsiteVerifier(
  connectionString: string,
): WebsiteVerifier {
  assertLocalTarget(connectionString, "musecity_e2e", "musecity_app");
  const ready = originalityWorker(async (request) => {
    const url = new URL(request.url);
    if (url.hostname !== "creator.example.com")
      return new Response("No fixture page", { status: 404 });
    const marker = await withDatabase(connectionString, async (db) => {
      if (url.pathname === "/owned")
        return (
          await db.one<{ website_marker: string }>(
            "SELECT website_marker FROM musecity.accounts WHERE privy_user_id='did:privy:alice'",
          )
        )?.website_marker;
      if (url.pathname.startsWith("/agent/"))
        return (
          await db.one<{ website_marker: string }>(
            "SELECT website_marker FROM musecity.agents WHERE id=$1",
            [url.pathname.slice(7)],
          )
        )?.website_marker;
      return null;
    });
    return new Response(
      `<html><head><title>Local verification fixture</title>${marker ? websiteMarkerHtml(marker) : ""}</head><body>Synthetic website HTML; no external connection</body></html>`,
      { headers: { "Content-Type": "text/html; charset=utf-8" } },
    );
  });
  return async (input) => (await ready).check(input);
}
