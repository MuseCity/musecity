import { imageSize } from "image-size";

export type ImagePurpose = "avatar" | "content";
export const imageWidths = [128, 256, 512, 768, 1536, 2560] as const;
export type ImageWidth = (typeof imageWidths)[number];
export const imageLimit = 20 * 1024 * 1024;
export const imageQuality = 82;
export const maxImageEdge = (purpose: ImagePurpose) =>
  purpose === "avatar" ? 512 : 2560;

// Inspect actual bytes on both sides of the upload boundary. Animation detection
// must happen before a browser decoder can silently select just the first frame.
export function inspectImage(bytes: Uint8Array, mimeType: string) {
  if (!bytes.length || bytes.length > imageLimit)
    throw new Error("Use an image up to 20 MiB.");
  const info = imageSize(bytes);
  const types: Record<string, string> = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
  };
  if (
    !types[mimeType] ||
    info.type !== types[mimeType] ||
    !info.width ||
    !info.height ||
    info.width > 12000 ||
    info.height > 12000 ||
    info.width * info.height > 40_000_000
  )
    throw new Error(
      "Use a valid JPEG, PNG or WebP up to 40 megapixels and 12,000 pixels per side.",
    );
  let frames = 1;
  let animated = false;
  let hasExif = false;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const tag = (at: number) =>
    String.fromCharCode(...bytes.subarray(at, at + 4));
  if (info.type === "webp") {
    if (view.getUint32(4, true) + 8 !== bytes.length)
      throw new Error("The WebP file is incomplete.");
    let at = 12,
      frameCount = 0,
      hasPixels = false;
    while (at < bytes.length) {
      if (at + 8 > bytes.length) throw new Error("Invalid WebP chunk.");
      const size = view.getUint32(at + 4, true);
      const kind = tag(at);
      if (at + 8 + size + (size % 2) > bytes.length)
        throw new Error("The WebP file is incomplete.");
      if (kind === "VP8X") {
        if (size < 10) throw new Error("Invalid WebP header.");
        animated = Boolean(bytes[at + 8]! & 2);
      }
      if (kind === "ANMF") frameCount++;
      if (kind === "VP8 " || kind === "VP8L") hasPixels = size > 0;
      if (kind === "EXIF") hasExif = true;
      at += 8 + size + (size % 2);
    }
    if (animated ? frameCount < 1 : !hasPixels || frameCount > 0)
      throw new Error("The WebP image has no valid frames.");
    frames = animated ? frameCount : 1;
  }
  if (info.type === "png") {
    let at = 8,
      ended = false;
    while (at + 12 <= bytes.length) {
      const size = view.getUint32(at);
      if (at + size + 12 > bytes.length)
        throw new Error("The PNG file is incomplete.");
      if (tag(at + 4) === "acTL") {
        if (size !== 8) throw new Error("Invalid PNG animation.");
        animated = true;
        frames = view.getUint32(at + 8);
      }
      if (tag(at + 4) === "IEND") {
        ended = true;
        break;
      }
      at += size + 12;
    }
    if (!ended) throw new Error("The PNG file is incomplete.");
  }
  if (frames < 1 || frames * info.width * info.height > 40_000_000)
    throw new Error(
      "Animations must have at most 40 megapixels across all frames.",
    );
  return { ...info, animated, frames, hasExif };
}

export function isNormalizedImage(
  info: ReturnType<typeof inspectImage>,
  purpose: ImagePurpose,
) {
  return (
    info.type === "webp" &&
    !info.animated &&
    !info.hasExif &&
    Math.max(info.width, info.height) <= maxImageEdge(purpose)
  );
}
