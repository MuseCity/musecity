// Synthetic content for the isolated localhost:5191 browser fixture only.
import { readFileSync } from "node:fs";
const origin = "http://127.0.0.1:5191";
async function call(path: string, body?: unknown, token = "fixture:alice") {
  const response = await fetch(origin + "/api/v1" + path, {
    method: body === undefined ? "GET" : "POST",
    headers: {
      Authorization: "Bearer " + token,
      "Content-Type": "application/json",
      "Idempotency-Key": crypto.randomUUID(),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const value = (await response.json()) as any;
  if (!response.ok)
    throw new Error(
      JSON.stringify({ path, status: response.status, error: value.error }),
    );
  return value;
}
const existing = await call("/works?mine=true");
if (existing.items.length)
  throw new Error("Fixture is not empty; refuse to duplicate seed content.");
const bytes = readFileSync("public/brand/icon.png");
const upload = await call("/media/uploads", {
  mimeType: "image/png",
  byteSize: bytes.length,
});
const uploaded = await fetch(origin + upload.uploadUrl, {
  method: "PUT",
  headers: {
    "Content-Type": "image/png",
    "X-Upload-Token": upload.uploadToken,
  },
  body: bytes,
});
if (!uploaded.ok) throw new Error("Fixture upload failed: " + uploaded.status);
await call("/media/" + upload.mediaId + "/complete", {});
const names = [
  "A small website made with AI",
  "An AI-assisted short film",
  "Exploring a visual identity",
  "Notes on creating with an agent",
];
for (let i = 0; i < 16; i++) {
  const type = ["website", "video", "image", "article"][i % 4]!;
  const body = {
    type,
    title: names[i % 4] + " · local example " + (i + 1),
    description:
      "Synthetic browser verification content. Created only in the isolated local test database.",
    aiDeclaration: true,
    aiTools: ["Test tool"],
    tagIds: ["design"],
    ...(type === "website"
      ? { websiteUrl: "https://example.com", coverMediaId: upload.mediaId }
      : type === "video"
        ? {
            videoUrl: "https://example.com/video",
            coverMediaId: upload.mediaId,
          }
        : type === "image"
          ? { imageMediaIds: [upload.mediaId] }
          : {
              articleDocument: {
                type: "doc",
                content: [
                  {
                    type: "heading",
                    attrs: { level: 2 },
                    content: [
                      { type: "text", text: "From idea to first draft" },
                    ],
                  },
                  {
                    type: "paragraph",
                    content: [
                      {
                        type: "text",
                        text: "A local article with consistent structured formatting.",
                      },
                    ],
                  },
                ],
              },
            }),
  };
  const work = await call("/works", body);
  await call("/works/" + work.workId + "/publish", {
    revisionId: work.revisionId,
  });
}
const invitation = await call("/me/agent-invitations", {
  name: "Local Studio Agent",
  scopes: ["content:read", "content:write"],
  confirmed: true,
});
const registration = await call(
  "/agent-registrations",
  { name: "Local Studio Agent", invitationToken: invitation.invitationToken },
  "",
);
await call(
  "/agent-registrations/" + registration.registrationId + "/activate",
  {},
  registration.registrationToken,
);
console.log(
  "Seeded 16 synthetic works and a draft-only test Agent in the isolated browser fixture; four publication slots remain today.",
);
