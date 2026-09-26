import {
  imageLimit,
  imageWidths,
  isNormalizedImage,
  type ImagePurpose,
  type ImageWidth,
} from "../shared/images";
import {
  assertAnimation,
  checkOutput,
  imageLog,
  inputInfo,
  masterSize,
  processingFailure,
  type ImageServices,
} from "./image-processing";
import type { Database } from "./database";
import type { Actor } from "./auth";
import type { MediaRow } from "./schema";
import { requireValue, ApiError } from "./errors";
import { digest, id, secret, future } from "./crypto";
export interface ObjectStore {
  put(
    key: string,
    bytes: ArrayBuffer,
    options: { httpMetadata: { contentType: string } },
  ): Promise<unknown>;
  get(key: string): Promise<{
    body: ReadableStream<Uint8Array>;
    httpEtag: string;
    size?: number;
  } | null>;
}
export async function boundedBody(
  request: Request | Response,
  limit: number,
): Promise<ArrayBuffer> {
  requireValue(
    Number(request.headers.get("content-length") ?? 0) <= limit,
    413,
    "FILE_TOO_LARGE",
    "The request is too large.",
  );
  const reader = request.body?.getReader();
  requireValue(reader, 400, "VALIDATION_ERROR", "A body is required.");
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > limit) {
      await reader.cancel();
      throw new ApiError(413, "FILE_TOO_LARGE", "The request is too large.");
    }
    chunks.push(value);
  }
  const result = new Uint8Array(size);
  let offset = 0;
  for (const c of chunks) {
    result.set(c, offset);
    offset += c.length;
  }
  return result.buffer;
}
export async function createUpload(
  db: Database,
  a: Actor,
  mimeType: string,
  byteSize: number,
  purpose: ImagePurpose = "content",
) {
  const count = await db.one<{ n: string }>(
    "SELECT count(*) AS n FROM musecity.media WHERE owner_account_id=$1 AND created_at>now()-interval '1 day'",
    [a.account.id],
  );
  requireValue(
    Number(count?.n) < 100,
    429,
    "UPLOAD_LIMIT",
    "The daily image upload limit has been reached.",
  );
  const mediaId = id("med");
  const token = secret("mcu");
  const expiresAt = future(900);
  await db.query(
    "INSERT INTO musecity.media(id,owner_account_id,agent_id,object_key,mime_type,byte_size,upload_hash,expires_at,purpose) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)",
    [
      mediaId,
      a.account.id,
      a.agent?.id ?? null,
      a.account.id + "/" + mediaId,
      mimeType,
      byteSize,
      await digest(token),
      expiresAt,
      purpose,
    ],
  );
  return {
    mediaId,
    uploadUrl: "/api/v1/uploads/" + mediaId,
    uploadToken: token,
    expiresAt,
    method: "PUT",
  };
}
export async function uploadBytes(
  db: Database,
  store: ObjectStore,
  mediaId: string,
  request: Request,
  images?: ImageServices,
) {
  const token = request.headers.get("x-upload-token");
  requireValue(
    token,
    401,
    "INVALID_CREDENTIAL",
    "An upload token is required.",
  );
  const m = await db.one<MediaRow>(
    "SELECT * FROM musecity.media WHERE id=$1 AND upload_hash=$2 FOR UPDATE",
    [mediaId, await digest(token)],
  );
  requireValue(
    m && m.expires_at > new Date(),
    401,
    "INVALID_CREDENTIAL",
    "This upload link expired. Create a new upload.",
  );
  requireValue(
    m.status === "uploading",
    409,
    "UPLOAD_ALREADY_USED",
    "This upload has already been received.",
  );
  let bytes = await boundedBody(request, imageLimit);
  requireValue(
    bytes.byteLength === m.byte_size &&
      request.headers.get("content-type")?.split(";")[0] === m.mime_type,
    422,
    "MEDIA_REJECTED",
    "Image size or format does not match.",
  );
  let info = inputInfo(bytes, m.mime_type);
  assertAnimation(info);
  const started = Date.now(),
    inputBytes = bytes.byteLength;
  const purpose = m.purpose === "avatar" ? "avatar" : "content";
  const normalized = isNormalizedImage(info, purpose);
  if (!normalized) {
    try {
      requireValue(
        images?.process,
        503,
        "IMAGE_PROCESSING_UNAVAILABLE",
        "Image processing is unavailable. The upload has not been saved.",
      );
      // The binding has a 20 MB input limit (smaller than the upload's 20 MiB).
      requireValue(
        bytes.byteLength <= 20_000_000,
        413,
        "FILE_TOO_LARGE",
        "Reduce this image below 20 MB before server processing.",
      );
      const result = await images.process(
        new Response(bytes).body!,
        masterSize(purpose),
      );
      if (!result.ok) throw new Error("Image transformation failed");
      bytes = await boundedBody(result, imageLimit);
      info = checkOutput(bytes, info, masterSize(purpose));
    } catch (error) {
      imageLog("upload_error", {
        mediaId,
        code: processingFailure(error),
        durationMs: Date.now() - started,
      });
      if (error instanceof ApiError) throw error;
      if (processingFailure(error) === 9412)
        throw new ApiError(
          422,
          "MEDIA_REJECTED",
          "The image could not be decoded.",
        );
      throw new ApiError(
        503,
        "IMAGE_PROCESSING_UNAVAILABLE",
        "Image processing is unavailable. The upload has not been saved.",
      );
    }
  }
  await store.put(m.object_key, bytes, {
    httpMetadata: { contentType: "image/webp" },
  });
  await db.query(
    "UPDATE musecity.media SET status='uploaded',mime_type='image/webp',byte_size=$2,width=$3,height=$4 WHERE id=$1",
    [mediaId, bytes.byteLength, info.width, info.height],
  );
  imageLog("upload", {
    mediaId,
    inputBytes,
    outputBytes: bytes.byteLength,
    durationMs: Date.now() - started,
    transformed: !normalized,
  });
  return { mediaId, status: "uploaded" };
}
export async function ownMedia(db: Database, a: Actor, mediaId: string) {
  const m = await db.one<MediaRow>(
    "SELECT * FROM musecity.media WHERE id=$1 AND owner_account_id=$2 AND ($3::text IS NULL OR agent_id=$3) FOR UPDATE",
    [mediaId, a.account.id, a.agent?.id ?? null],
  );
  requireValue(m, 404, "NOT_FOUND", "Image not found.");
  return m;
}
export async function completeUpload(
  db: Database,
  a: Actor,
  mediaId: string,
  store: ObjectStore,
) {
  const m = await ownMedia(db, a, mediaId);
  requireValue(
    ["uploaded", "ready"].includes(m.status),
    409,
    "MEDIA_NOT_READY",
    "Upload the image before completing it.",
  );
  const object = await store.get(m.object_key);
  requireValue(
    object,
    409,
    "MEDIA_NOT_READY",
    "The uploaded object is unavailable. Retry the upload.",
  );
  await object.body.cancel();
  await db.query(
    "UPDATE musecity.media SET status='ready',etag=$2 WHERE id=$1",
    [mediaId, object.httpEtag],
  );
  return { mediaId, status: "ready" };
}
export async function imageResponse(
  db: Database,
  store: ObjectStore,
  mediaId: string,
  a?: Actor,
  width?: ImageWidth,
  images?: ImageServices,
) {
  const m = a
    ? await ownMedia(db, a, mediaId)
    : await db.one<MediaRow>(
        `SELECT m.* FROM musecity.media m JOIN musecity.accounts a ON a.id=m.owner_account_id WHERE m.id=$1 AND m.status='ready' AND a.status='active' AND (
    a.avatar_media_id=m.id OR EXISTS(SELECT 1 FROM musecity.works w JOIN musecity.work_revisions r ON r.id=w.published_revision_id WHERE w.status='published' AND NOT w.blocked AND w.owner_account_id=a.id AND r.media_ids @> ARRAY[m.id]) OR EXISTS(SELECT 1 FROM musecity.posts p WHERE p.owner_account_id=a.id AND NOT p.deleted AND NOT p.blocked AND p.media_ids @> ARRAY[m.id]))`,
        [mediaId],
      );
  requireValue(m && m.status === "ready", 404, "NOT_FOUND", "Image not found.");
  // No cache or object read may precede the current database authorization above.
  const key = `derived/v1/${m.id}/${encodeURIComponent(m.etag ?? "legacy")}/${width ?? "master"}.webp`;
  const cache = !a ? images?.cache : undefined;
  const cacheKey = new Request(
    new URL("/__media-cache/" + key, images?.origin ?? "http://localhost"),
  );
  if (cache) {
    try {
      const hit = await cache.match(cacheKey);
      if (hit) {
        imageLog("read", { mediaId, cache: "edge", width: width ?? 0 });
        return privateResponse(hit);
      }
    } catch {
      imageLog("cache_error", { mediaId, operation: "read" });
    }
  }
  const cacheResponse = async (response: Response) => {
    if (cache) {
      const stored = response.clone();
      stored.headers.set("Cache-Control", "public, max-age=604800");
      const put = cache.put(cacheKey, stored).catch(() => {
        imageLog("cache_error", { mediaId, operation: "write" });
      });
      if (images?.waitUntil) images.waitUntil(put);
      else await put;
    }
    return privateResponse(response);
  };
  if (width) {
    const derived = await store.get(key);
    if (derived) {
      imageLog("read", { mediaId, cache: "r2_variant", width });
      return cacheResponse(objectResponse(derived, "image/webp", derived.size));
    }
  }
  const object = await store.get(m.object_key);
  requireValue(object, 404, "NOT_FOUND", "Image not found.");
  // A conforming master already smaller than the requested size is reused.
  if (!width || (m.mime_type === "image/webp" && m.width && m.width <= width)) {
    imageLog("read", { mediaId, cache: "r2_master", width: width ?? 0 });
    return cacheResponse(objectResponse(object, m.mime_type, m.byte_size));
  }
  const started = Date.now();
  if (images?.process) {
    try {
      const bytes = await boundedBody(new Response(object.body), imageLimit);
      const info = inputInfo(bytes, m.mime_type);
      assertAnimation(info);
      if (bytes.byteLength > 20_000_000) throw new Error("Binding input limit");
      const result = await images.process(new Response(bytes).body!, { width });
      if (!result.ok) throw new Error("Image transformation failed");
      const output = await boundedBody(result, imageLimit);
      checkOutput(output, info, { width });
      await store.put(key, output, {
        httpMetadata: { contentType: "image/webp" },
      });
      imageLog("transform", {
        mediaId,
        width,
        inputBytes: bytes.byteLength,
        outputBytes: output.byteLength,
        durationMs: Date.now() - started,
      });
      const saved = await store.get(key);
      requireValue(
        saved,
        503,
        "SERVICE_UNAVAILABLE",
        "The processed image is unavailable.",
      );
      return cacheResponse(
        objectResponse(saved, "image/webp", output.byteLength),
      );
    } catch (error) {
      imageLog("display_error", {
        mediaId,
        width,
        code: processingFailure(error),
        durationMs: Date.now() - started,
      });
    }
  } else {
    await object.body.cancel();
    imageLog("display_error", {
      mediaId,
      width,
      code: "unavailable",
      durationMs: Date.now() - started,
    });
  }
  // Do not cache a fallback under a derivative key: a later request may succeed.
  const fallback = await store.get(m.object_key);
  requireValue(fallback, 404, "NOT_FOUND", "Image not found.");
  return privateResponse(objectResponse(fallback, m.mime_type, m.byte_size));
}

export function requestedWidth(url: string): ImageWidth | undefined {
  const values = new URL(url).searchParams.getAll("w");
  if (!values.length) return undefined;
  const width = Number(values[0]);
  requireValue(
    values.length === 1 &&
      String(width) === values[0] &&
      imageWidths.includes(width as ImageWidth),
    400,
    "VALIDATION_ERROR",
    "Use width 128, 256, 512, 768, 1536 or 2560.",
  );
  return width as ImageWidth;
}

function objectResponse(
  object: { body: ReadableStream; httpEtag: string },
  mime: string,
  size?: number,
) {
  return new Response(object.body, {
    headers: {
      "Content-Type": mime,
      ...(size === undefined ? {} : { "Content-Length": String(size) }),
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'",
      "Cross-Origin-Resource-Policy": "same-origin",
      ETag: object.httpEtag,
    },
  });
}

function privateResponse(response: Response) {
  const result = new Response(response.body, response);
  result.headers.set("Cache-Control", "private, no-store");
  return result;
}
