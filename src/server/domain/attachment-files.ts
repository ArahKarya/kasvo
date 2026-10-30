/**
 * What an uploaded file really is, judged from its first bytes (never from its name or the
 * browser's claim). Only formats a browser shows safely are accepted: no SVG, HTML, or HEIC.
 */
export type AttachmentType = "image/jpeg" | "image/png" | "image/webp" | "application/pdf";

export const MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024;
export const MAX_ATTACHMENTS_PER_TRANSACTION = 5;

const startsWith = (bytes: Uint8Array, signature: number[], offset = 0): boolean => signature.every((b, i) => bytes[offset + i] === b);
const ascii = (s: string): number[] => [...s].map((c) => c.charCodeAt(0));

export function sniffType(bytes: Uint8Array): AttachmentType | null {
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return "image/jpeg";
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "image/png";
  if (startsWith(bytes, ascii("RIFF")) && startsWith(bytes, ascii("WEBP"), 8)) return "image/webp";
  if (startsWith(bytes, ascii("%PDF-"))) return "application/pdf";
  return null;
}

const EXTENSION: Record<AttachmentType, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "application/pdf": "pdf" };

/** A safe display name with the extension that matches the real type: "struk indomaret.jpg". */
export function cleanFileName(name: string | undefined, type: AttachmentType): string {
  const base = (name ?? "")
    .split(/[\\/]/)
    .pop()!
    .replace(/\.[a-z0-9]{1,5}$/i, "")
    .replace(/[^\p{L}\p{N} ._()-]/gu, "")
    .trim()
    .slice(0, 80);
  return `${base || "lampiran"}.${EXTENSION[type]}`;
}
