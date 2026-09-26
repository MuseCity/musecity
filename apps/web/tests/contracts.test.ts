import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { Article } from "../src/components/article";
import { validArticle, workSchema, safeUrl } from "../src/shared/contracts";
import { openapi } from "../src/server/discovery";
describe("article and machine-readable contracts", () => {
  it("rejects executable nodes, unexpected image sources, malformed marks and excessive nesting", () => {
    for (const content of [
      { type: "script", text: "alert(1)" },
      { type: "image", attrs: { src: "https://example.com/image.png" } },
      {
        type: "paragraph",
        content: [{ type: "text", text: "x", marks: [null] }],
      },
    ])
      expect(validArticle({ type: "doc", content: [content] })).toBe(false);
    let node: unknown = {
      type: "paragraph",
      content: [{ type: "text", text: "text" }],
    };
    for (let i = 0; i < 15; i++) node = { type: "blockquote", content: [node] };
    expect(validArticle({ type: "doc", content: [node] })).toBe(false);
  });
  it("renders user text as escaped text and emits safe external links", () => {
    const html = renderToStaticMarkup(
      createElement(Article, {
        document: {
          type: "doc",
          content: [
            {
              type: "paragraph",
              content: [
                {
                  type: "text",
                  text: "<script>alert(1)</script>",
                  marks: [
                    { type: "link", attrs: { href: "https://example.com" } },
                  ],
                },
              ],
            },
          ],
        },
      }),
    );
    expect(html).toContain("&lt;script&gt;");
    expect(html).not.toContain("<script>");
    expect(html).toContain("noopener noreferrer nofollow");
  });
  it("refuses private or executable share links and publishes a parseable OpenAPI document", () => {
    for (const value of [
      "javascript:alert(1)",
      "https://localhost/",
      "https://127.0.0.1",
      "https://10.1.1.1",
      "https://u:p@example.com",
      "http://example.com",
    ])
      expect(safeUrl(value)).toBe(false);
    expect(safeUrl("https://example.com")).toBe(true);
    const doc = openapi("http://127.0.0.1:5190");
    expect(JSON.stringify(doc)).not.toContain('"ecosystem"');
    expect(JSON.stringify(doc)).not.toContain('"ecosystems"');
    expect(doc.openapi).toBe("3.1.0");
    expect(doc.components.schemas.WorkContent).toBeTruthy();
    expect(doc.components.schemas.WorkContent.required).not.toContain(
      "aiDeclaration",
    );
    expect(doc.paths["/posts"]).toBeTruthy();
    expect(doc.paths["/feed"]).toBeTruthy();
    expect(doc.paths["/me/notifications"]).toBeTruthy();
    expect(doc.paths["/me/content"]).toMatchObject({
      get: {
        security: [{ bearer: [] }],
        responses: {
          "200": {
            content: {
              "application/json": {
                schema: {
                  properties: {
                    items: {
                      items: { $ref: "#/components/schemas/ManagedContent" },
                    },
                  },
                },
              },
            },
          },
        },
      },
    });
    expect(JSON.stringify(doc)).toContain("community:reply");
    expect(JSON.stringify(doc)).toContain("Idempotency-Key");
    expect(
      workSchema.safeParse({
        type: "article",
        title: "x",
        aiDeclaration: true,
        articleDocument: { type: "doc" },
      }).success,
    ).toBe(false);
  });
});
