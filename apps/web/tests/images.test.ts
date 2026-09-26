import { beforeEach, describe, expect, it, vi } from "vitest";
import sharp from "sharp";
import { fixture, reset, config } from "./helpers";
import { withDatabase } from "../src/server/database";
import { inspectImage, imageLimit } from "../src/shared/images";
import { localImageProcessor } from "../e2e/image-processor";

beforeEach(reset);
const png = (width = 1000, height = 500) =>
  sharp({
    create: {
      width,
      height,
      channels: 4,
      background: { r: 200, g: 30, b: 50, alpha: 0.5 },
    },
  })
    .png()
    .toBuffer();

async function upload(
  f: ReturnType<typeof fixture>,
  bytes: Uint8Array,
  mimeType = "image/png",
  purpose?: "avatar" | "content",
  token = "fixture:alice",
) {
  const job = (
    await f.call("/media/uploads", {
      method: "POST",
      token,
      body: {
        mimeType,
        byteSize: bytes.length,
        ...(purpose ? { purpose } : {}),
      },
    })
  ).data;
  const response = await f.app.request("http://localhost" + job.uploadUrl, {
    method: "PUT",
    headers: { "Content-Type": mimeType, "X-Upload-Token": job.uploadToken },
    body: new Uint8Array(bytes),
  });
  return {
    ...job,
    response,
    complete: () =>
      f.call(`/media/${job.mediaId}/complete`, {
        method: "POST",
        token,
        body: {},
      }),
  };
}
async function agent(f: ReturnType<typeof fixture>) {
  const scopes = ["content:read", "content:write"];
  const inv = await f.call("/me/agent-invitations", {
    method: "POST",
    body: { name: "Image tester", scopes, confirmed: true },
  });
  const reg = await f.call("/agent-registrations", {
    method: "POST",
    token: null,
    body: {
      name: "Image tester",
      requestedScopes: scopes,
      invitationToken: inv.data.invitationToken,
    },
  });
  const active = await f.call(
    `/agent-registrations/${reg.data.registrationId}/activate`,
    { token: reg.data.registrationToken, method: "POST" },
  );
  return {
    id: active.data.agentId,
    token: active.data.credential.token as string,
  };
}
function cachedFixture() {
  const f = fixture();
  const cached = new Map<string, Response>();
  const cache = {
    match: vi.fn(async (request: RequestInfo | URL) =>
      cached.get(new Request(request).url)?.clone(),
    ),
    put: vi.fn(async (request: RequestInfo | URL, response: Response) => {
      cached.set(
        new Request(request).url,
        new Response(await response.arrayBuffer(), response),
      );
    }),
  };
  const process = vi.fn(localImageProcessor);
  f.services.images = { process, cache, origin: "http://localhost" };
  return { ...f, cached, cache, process };
}
async function publicPost(f: ReturnType<typeof fixture>, mediaId: string) {
  return (
    await f.call("/posts", {
      method: "POST",
      body: { kind: "update", text: "Image test", mediaIds: [mediaId] },
    })
  ).data;
}

describe("image normalization and authorization before derived-byte caches (local codecs/storage)", () => {
  it("normalizes transparent avatars, stores actual metadata, and preserves conforming WebP bytes", async () => {
    const f = cachedFixture();
    const job = await upload(f, await png(), "image/png", "avatar");
    expect(job.response.status).toBe(200);
    expect((await job.complete()).status).toBe(200);
    const meta = (await f.call(`/media/${job.mediaId}`)).data;
    expect(meta).toMatchObject({
      purpose: "avatar",
      width: 512,
      height: 256,
      mimeType: "image/webp",
      status: "ready",
    });
    expect(meta.etag).toBeTruthy();
    const original = await (
      await f.call(`/raw-media/${job.mediaId}`)
    ).response.arrayBuffer();
    expect(original.byteLength).toBe(meta.byteSize);
    const decoded = await sharp(original)
      .raw()
      .toBuffer({ resolveWithObject: true });
    expect(decoded.info.channels).toBe(4);
    expect(decoded.data[3]).toBeCloseTo(128, -1);
    const copy = await upload(
      f,
      new Uint8Array(original),
      "image/webp",
      "avatar",
    );
    await copy.complete();
    expect(f.process).toHaveBeenCalledTimes(1);
    expect(
      new Uint8Array(
        await (
          await f.call(`/raw-media/${copy.mediaId}`)
        ).response.arrayBuffer(),
      ),
    ).toEqual(new Uint8Array(original));
  });

  it("applies JPEG orientation, limits content to 2560, and never enlarges small images", async () => {
    const f = fixture();
    const jpeg = await sharp(await png(900, 600))
      .jpeg()
      .withMetadata({ orientation: 6 })
      .toBuffer();
    const oriented = await upload(f, jpeg, "image/jpeg", "avatar");
    expect(oriented.response.status).toBe(200);
    await oriented.complete();
    expect((await f.call(`/media/${oriented.mediaId}`)).data).toMatchObject({
      width: 341,
      height: 512,
    });
    for (const [w, h, ew, eh] of [
      [3000, 1500, 2560, 1280],
      [3, 2, 3, 2],
    ]) {
      const job = await upload(f, await png(w, h));
      expect(job.response.status).toBe(200);
      await job.complete();
      expect((await f.call(`/media/${job.mediaId}`)).data).toMatchObject({
        purpose: "content",
        width: ew,
        height: eh,
      });
    }
  });

  it("rejects damaged files, mismatched MIME, dimension/byte limits and unsupported APNG", async () => {
    const f = fixture();
    const valid = await png();
    for (const [bytes, mime] of [
      [valid.subarray(0, 32), "image/png"],
      [valid, "image/jpeg"],
      [await png(12001, 1), "image/png"],
      [await png(6500, 6500), "image/png"],
    ] as const) {
      expect((await upload(f, bytes, mime)).response.status).toBe(422);
    }
    expect(
      (
        await f.call("/media/uploads", {
          method: "POST",
          body: { mimeType: "image/png", byteSize: imageLimit + 1 },
        })
      ).status,
    ).toBe(400);
    const job = (
      await f.call("/media/uploads", {
        method: "POST",
        body: { mimeType: "image/png", byteSize: 1 },
      })
    ).data;
    const tooLarge = await f.app.request("http://localhost" + job.uploadUrl, {
      method: "PUT",
      headers: {
        "X-Upload-Token": job.uploadToken,
        "Content-Type": "image/png",
      },
      body: new Uint8Array(imageLimit + 1),
    });
    expect(tooLarge.status).toBe(413);
    const small = await png(10, 10),
      chunk = Buffer.alloc(20);
    chunk.writeUInt32BE(8);
    chunk.write("acTL", 4);
    chunk.writeUInt32BE(2, 8);
    const apng = Buffer.concat([
      small.subarray(0, 33),
      chunk,
      small.subarray(33),
    ]);
    const rejected = await upload(f, apng);
    expect(rejected.response.status).toBe(422);
    expect((await rejected.response.json()).error.code).toBe(
      "MEDIA_ANIMATION_UNSUPPORTED",
    );
    expect(f.store.objects.size).toBe(0);
  });

  it("preserves animated WebP frames and rejects a processor that flattens them", async () => {
    const f = fixture();
    const pixels = Buffer.alloc(30 * 40 * 4, 255);
    pixels.fill(40, 30 * 20 * 4);
    const animated = await sharp(pixels, {
      raw: { width: 30, height: 40, channels: 4, pageHeight: 20 },
    })
      .webp({ loop: 0, delay: [100, 200] })
      .toBuffer();
    expect(inspectImage(animated, "image/webp")).toMatchObject({
      animated: true,
      frames: 2,
    });
    const job = await upload(f, animated, "image/webp");
    expect(job.response.status).toBe(200);
    await job.complete();
    const bytes = await (
      await f.call(`/raw-media/${job.mediaId}`)
    ).response.arrayBuffer();
    expect(inspectImage(new Uint8Array(bytes), "image/webp")).toMatchObject({
      animated: true,
      frames: 2,
    });
    const flat = await sharp(animated).webp().toBuffer();
    f.services.images!.process = async () => new Response(new Uint8Array(flat));
    expect((await upload(f, animated, "image/webp")).response.status).toBe(422);
  });

  it("reuses R2 variants and edge bytes, but never shares private previews or bypasses ownership", async () => {
    const f = cachedFixture();
    const ag = await agent(f),
      peer = await agent(f);
    const job = await upload(f, await png(), "image/png", "avatar", ag.token);
    await job.complete();
    const path = `/raw-media/${job.mediaId}?w=128`;
    for (const token of [null, "fixture:bob", peer.token])
      expect((await f.call(path, { token })).status).toBe(404);
    const preview = await f.call(path, { token: ag.token });
    expect(preview.status).toBe(200);
    expect(preview.response.headers.get("cache-control")).toBe(
      "private, no-store",
    );
    expect(f.cache.match).not.toHaveBeenCalled();
    expect(f.cache.put).not.toHaveBeenCalled();
    const post = await publicPost(f, job.mediaId);
    const first = await f.call(path, { token: null });
    expect(first.status).toBe(200);
    expect(
      (await sharp(await first.response.arrayBuffer()).metadata()).width,
    ).toBe(128);
    expect(f.process).toHaveBeenCalledTimes(2); // master + private derivative only
    expect((await f.call(path, { token: null })).status).toBe(200);
    expect(f.process).toHaveBeenCalledTimes(2);
    expect([...f.cached.values()][0]!.headers.get("cache-control")).toBe(
      "public, max-age=604800",
    );
    f.cached.clear();
    expect((await f.call(path, { token: null })).status).toBe(200);
    expect(f.process).toHaveBeenCalledTimes(2);
    await f.call(`/me/agents/${ag.id}/revoke`, {
      method: "POST",
      body: { confirmed: true },
    });
    expect((await f.call(path, { token: ag.token })).status).toBe(401);
    expect((await f.call(path, { token: "invalid" })).status).toBe(401);
    await f.call(`/posts/${post.id}`, {
      method: "DELETE",
      body: { revision: post.revision },
    });
    expect((await f.call(path, { token: null })).status).toBe(404);
    expect(
      (await f.call(`/raw-media/${job.mediaId}`, { token: null })).status,
    ).toBe(404);
  });

  it("rechecks unpublishing, moderation and account restrictions after cache warming", async () => {
    const f = cachedFixture(),
      job = await upload(f, await png());
    await job.complete();
    const work = (
      await f.call("/works", {
        method: "POST",
        body: {
          type: "image",
          title: "Test",
          description: "",
          aiTools: [],
          tagIds: [],
          imageMediaIds: [job.mediaId],
        },
      })
    ).data;
    await f.call(`/works/${work.workId}/publish`, {
      method: "POST",
      body: { revisionId: work.revisionId },
    });
    const path = `/raw-media/${job.mediaId}?w=256`;
    expect((await f.call(path, { token: null })).status).toBe(200);
    await f.call(`/works/${work.workId}/unpublish`, {
      method: "POST",
      body: { revisionId: work.revisionId },
    });
    expect((await f.call(path, { token: null })).status).toBe(404);
    const post = await publicPost(f, job.mediaId);
    expect((await f.call(path, { token: null })).status).toBe(200);
    await withDatabase(config.testAdminUrl, (db) =>
      db.query("UPDATE musecity.posts SET blocked=true WHERE id=$1", [post.id]),
    );
    expect((await f.call(path, { token: null })).status).toBe(404);
    await withDatabase(config.testAdminUrl, async (db) => {
      await db.query("UPDATE musecity.posts SET blocked=false WHERE id=$1", [
        post.id,
      ]);
      await db.query(
        "UPDATE musecity.accounts SET status='restricted' WHERE id=$1",
        [post.owner.id],
      );
    });
    expect((await f.call(path, { token: null })).status).toBe(404);
    expect((await f.call(path)).status).toBe(403);
  });

  it("falls back on transform/quota failures without caching them and never saves an unprocessed upload", async () => {
    const f = cachedFixture(),
      job = await upload(f, await png());
    await job.complete();
    await publicPost(f, job.mediaId);
    for (const code of [9422, 9523]) {
      f.services.images!.process = async () => {
        throw Object.assign(new Error("private provider diagnostic"), { code });
      };
      const response = await f.call(`/raw-media/${job.mediaId}?w=128`, {
        token: null,
      });
      expect(response.status).toBe(200);
      expect(
        (await sharp(await response.response.arrayBuffer()).metadata()).width,
      ).toBe(1000);
      expect(f.cache.put).not.toHaveBeenCalled();
      const failed = await upload(f, await png());
      expect(failed.response.status).toBe(503);
      expect((await failed.complete()).status).toBe(409);
      expect((await f.call(`/media/${failed.mediaId}`)).data.status).toBe(
        "uploading",
      );
    }
    f.services.images!.process = localImageProcessor;
    const result = await f.call(`/raw-media/${job.mediaId}?w=128`, {
      token: null,
    });
    expect(
      (await sharp(await result.response.arrayBuffer()).metadata()).width,
    ).toBe(128);
  });

  it("serves historical masters unchanged and rejects arbitrary transformation parameters", async () => {
    const f = cachedFixture(),
      job = await upload(f, await png());
    await job.complete();
    await publicPost(f, job.mediaId);
    const row = await withDatabase(config.testAdminUrl, (db) =>
      db.one<{ object_key: string }>(
        "SELECT object_key FROM musecity.media WHERE id=$1",
        [job.mediaId],
      ),
    );
    const historical = new Uint8Array(await png(800, 400));
    await f.store.put(row!.object_key, historical.buffer);
    const object = await f.store.get(row!.object_key);
    await object!.body.cancel();
    await withDatabase(config.testAdminUrl, (db) =>
      db.query(
        "UPDATE musecity.media SET mime_type='image/png',byte_size=$2,width=NULL,height=NULL,etag=$3 WHERE id=$1",
        [job.mediaId, historical.byteLength, object!.httpEtag],
      ),
    );
    for (const w of ["129", "0", "0128", "128&w=256", "", "999999", "128.0"])
      expect(
        (await f.call(`/raw-media/${job.mediaId}?w=${w}`, { token: null }))
          .status,
      ).toBe(400);
    const derived = await f.call(`/raw-media/${job.mediaId}?w=128`, {
      token: null,
    });
    expect(derived.response.headers.get("content-type")).toBe("image/webp");
    const master = await f.call(`/raw-media/${job.mediaId}`, { token: null });
    expect(new Uint8Array(await master.response.arrayBuffer())).toEqual(
      historical,
    );
    f.services.images!.process = undefined;
    const fallback = await f.call(`/raw-media/${job.mediaId}?w=256`, {
      token: null,
    });
    expect(fallback.response.headers.get("content-type")).toBe("image/png");
    expect(new Uint8Array(await fallback.response.arrayBuffer())).toEqual(
      historical,
    );
  });
});
