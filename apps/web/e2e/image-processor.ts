// Local codec for tests/browser fixtures only, never production Cloudflare proof.
import sharp from "sharp";
import type { ImageProcessor } from "../src/server/image-processing";
import { imageQuality } from "../src/shared/images";

export const localImageProcessor: ImageProcessor = async (stream, size) => {
  const bytes = await new Response(stream).arrayBuffer();
  const output = await sharp(bytes, { animated: true, failOn: "warning" })
    .autoOrient()
    .resize({ ...size, fit: "inside", withoutEnlargement: true })
    .webp({ quality: imageQuality })
    .toBuffer();
  return new Response(new Uint8Array(output), {
    headers: { "Content-Type": "image/webp" },
  });
};
