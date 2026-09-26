import { ApiError } from "./errors";
import {
  imageQuality,
  inspectImage,
  type ImagePurpose,
  maxImageEdge,
} from "../shared/images";

export type ImageProcessor = (
  bytes: ReadableStream<Uint8Array>,
  size: { width: number; height?: number },
) => Promise<Response>;

export const cloudflareImages =
  (images: ImagesBinding): ImageProcessor =>
  async (bytes, size) =>
    (
      await images
        .input(bytes)
        .transform({ ...size, fit: "scale-down" })
        .output({ format: "image/webp", quality: imageQuality, anim: true })
    ).response();

export type ImageServices = {
  process?: ImageProcessor;
  cache?: Pick<Cache, "match" | "put">;
  waitUntil?: (promise: Promise<unknown>) => void;
  origin: string;
};

export function imageLog(
  event: string,
  data: Record<string, number | string | boolean>,
) {
  console.log(JSON.stringify({ component: "media", event, ...data }));
}

export function processingFailure(error: unknown) {
  // Never log provider messages, request headers, tokens or image bytes.
  const code =
    error && typeof error === "object" && "code" in error
      ? error.code
      : undefined;
  return typeof code === "number" ? code : "unavailable";
}

export function inputInfo(bytes: ArrayBuffer, mimeType: string) {
  try {
    return inspectImage(new Uint8Array(bytes), mimeType);
  } catch {
    throw new ApiError(
      422,
      "MEDIA_REJECTED",
      "Use a complete JPEG, PNG or WebP up to 20 MiB, 40 megapixels and 12,000 pixels per side. Animation frames together must fit 40 megapixels.",
    );
  }
}

export function assertAnimation(info: ReturnType<typeof inspectImage>) {
  if (info.animated && info.type !== "webp")
    throw new ApiError(
      422,
      "MEDIA_ANIMATION_UNSUPPORTED",
      "This animation cannot be preserved. Use animated WebP instead.",
    );
}

export function checkOutput(
  bytes: ArrayBuffer,
  input: ReturnType<typeof inspectImage>,
  size: { width: number; height?: number },
) {
  const output = inputInfo(bytes, "image/webp");
  const rotated = [5, 6, 7, 8].includes(input.orientation ?? 1);
  const width = rotated ? input.height : input.width;
  const height = rotated ? input.width : input.height;
  if (
    output.width > size.width ||
    (size.height && output.height > size.height) ||
    output.width > width ||
    output.height > height ||
    Math.abs(output.width * height - output.height * width) >
      Math.max(width, height) ||
    output.frames !== input.frames ||
    output.animated !== input.animated
  )
    throw new ApiError(
      422,
      "MEDIA_REJECTED",
      "Image processing could not preserve the image dimensions or animation.",
    );
  return output;
}

export const masterSize = (purpose: ImagePurpose) => ({
  width: maxImageEdge(purpose),
  height: maxImageEdge(purpose),
});
