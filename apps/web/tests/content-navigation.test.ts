import { describe, it, expect } from "vitest";
import {
  contentHref,
  contentKind,
  publicContentParams,
  validOrigin,
  retiredEcosystemPath,
} from "../src/shared/content-navigation";
describe("content navigation", () => {
  it("preserves following when selecting formats, and clears retired filters and cursors", () => {
    const source = "?view=following&ecosystem=base&cursor=old";
    const website = contentHref("/", source, "type", "website");
    const params = new URL(website, "http://127.0.0.1:5190").searchParams;
    expect(Object.fromEntries(params)).toEqual({
      view: "following",
      kind: "work",
      type: "website",
    });
    expect(contentKind(params)).toBe("work");
    expect(
      contentHref(
        "/me/content",
        "?kind=work&type=article&status=draft",
        "kind",
        "work",
      ),
    ).toBe("/me/content?kind=work&type=article&status=draft");
    const updates = contentHref(
      "/",
      "?" + params + "&status=draft&help=open&cursor=old",
      "kind",
      "update",
    );
    expect(
      Object.fromEntries(
        new URL(updates, "http://127.0.0.1:5190").searchParams,
      ),
    ).toEqual({ view: "following", kind: "update" });
    expect(
      contentHref(
        "/me/content",
        "?kind=work&type=article&cursor=old",
        "status",
        "draft",
      ),
    ).toBe("/me/content?kind=work&type=article&status=draft");
  });
  it("cleans old public list links without losing active filters", () => {
    for (const path of ["/", "/neighbors", "/u/alice"])
      for (const value of [
        "",
        "base",
        "robinhood",
        "unknown",
        "base&ecosystem=robinhood",
      ]) {
        const search =
          "?ecosystem=" +
          value +
          "&cursor=old&q=garden&kind=work&type=article&view=following";
        expect(
          retiredEcosystemPath(new URL("http://localhost" + path + search)),
        ).toBe(path + "?q=garden&kind=work&type=article&view=following");
        const params = publicContentParams(search);
        expect(params.has("ecosystem")).toBe(false);
        expect(params.has("cursor")).toBe(false);
      }
    expect(
      retiredEcosystemPath(
        new URL("http://localhost/?ecosystem=base&cursor=old"),
      ),
    ).toBe("/");
    expect(
      retiredEcosystemPath(
        new URL("http://localhost/?kind=work&cursor=current"),
      ),
    ).toBeNull();
    expect(publicContentParams("?cursor=current").get("cursor")).toBe(
      "current",
    );
    expect(
      validOrigin({
        path: "/?ecosystem=base&cursor=old&kind=help",
        index: 2,
        key: "old",
      }),
    ).toEqual({
      path: "/?kind=help",
      label: "Square",
      index: undefined,
      key: undefined,
    });
  });
  it("recognizes old format/topic URLs and keeps profile reads public and scoped to the displayed owner", () => {
    for (const search of [
      "?type=website",
      "?tag=design",
      "?kind=update&type=article",
    ]) {
      expect(contentKind(new URLSearchParams(search))).toBe("work");
      expect(publicContentParams(search).get("kind")).toBe("work");
    }
    const profile = publicContentParams(
      "?kind=help&owner=someone&status=draft&view=following",
      "alice",
    );
    expect(Object.fromEntries(profile)).toEqual({
      kind: "help",
      owner: "alice",
    });
    expect(validOrigin({ path: "//evil.example/" })).toBeNull();
    expect(validOrigin({ path: "/posts/deleted" })).toBeNull();
    expect(
      validOrigin({ path: "/me/content?kind=work", index: 2, key: "source" })
        ?.label,
    ).toBe("My content");
  });
});
