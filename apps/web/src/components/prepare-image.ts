import {
  inspectImage,
  isNormalizedImage,
  maxImageEdge,
  imageQuality,
  imageLimit,
  type ImagePurpose,
} from "../shared/images";

export async function prepareImage(
  file: File,
  purpose: ImagePurpose,
): Promise<File> {
  if (file.size > imageLimit) throw new Error("Use an image up to 20 MiB.");
  const info = inspectImage(
    new Uint8Array(await file.arrayBuffer()),
    file.type,
  );
  // Keep all frames; the server either preserves the animation or rejects it.
  if (info.animated) return file;
  const bitmap = await createImageBitmap(file, {
    imageOrientation: "from-image",
  });
  try {
    if (isNormalizedImage(info, purpose)) return file;
    const ratio = Math.min(
      1,
      maxImageEdge(purpose) / Math.max(bitmap.width, bitmap.height),
    );
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * ratio));
    canvas.height = Math.max(1, Math.round(bitmap.height * ratio));
    const context = canvas.getContext("2d");
    if (!context)
      throw new Error("Image processing is unavailable in this browser.");
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/webp", imageQuality / 100),
    );
    if (!blob || blob.type !== "image/webp" || blob.size > imageLimit)
      throw new Error("This browser could not prepare the image as WebP.");
    return new File([blob], file.name.replace(/\.[^.]*$/, "") + ".webp", {
      type: blob.type,
    });
  } finally {
    bitmap.close();
  }
}
