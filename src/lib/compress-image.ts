/**
 * Shrinks a photo in the browser before upload: longest side at most 1600 px, re-encoded as
 * JPEG at 0.8, EXIF orientation applied (and other EXIF data, such as GPS, dropped). PDFs and
 * files the browser cannot decode are returned unchanged; the server decides whether to accept them.
 */
const MAX_SIDE = 1600;

export async function compressForUpload(file: File): Promise<File> {
  if (!file.type.startsWith("image/") || file.type === "image/gif") return file;
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    return file;
  }
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const ctx = canvas.getContext("2d");
  if (!ctx) return file;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.8));
  if (!blob) return file;
  // Camera JPEGs are always re-encoded so their EXIF (GPS location included) is dropped. A small
  // PNG/WebP (usually a screenshot of a transfer) is kept when it is already smaller.
  if ((file.type === "image/png" || file.type === "image/webp") && blob.size >= file.size) return file;
  return new File([blob], file.name.replace(/\.[^.]+$/, "") + ".jpg", { type: "image/jpeg" });
}
