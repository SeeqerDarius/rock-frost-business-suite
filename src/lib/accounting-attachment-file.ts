export const MAX_ACCOUNTING_ATTACHMENT_BYTES = 3 * 1024 * 1024;

const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "application/pdf"]);

function hasValidSignature(bytes: Uint8Array, type: string) {
  if (type === "image/jpeg") return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (type === "image/png") {
    return bytes.length >= 8 && [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((value, index) => bytes[index] === value);
  }
  if (type === "image/webp") {
    const decoder = new TextDecoder();
    return bytes.length >= 12 && decoder.decode(bytes.slice(0, 4)) === "RIFF" && decoder.decode(bytes.slice(8, 12)) === "WEBP";
  }
  if (type === "application/pdf") {
    return bytes.length >= 5 && new TextDecoder().decode(bytes.slice(0, 5)) === "%PDF-";
  }
  return false;
}

/** Same signature-validated, size-capped upload pattern as fleet-maintenance-photo.ts,
 * extended to accept a PDF alongside the three image types - a scanned supplier
 * invoice or receipt is at least as common an accounting attachment as a photo. */
export async function accountingAttachmentFileData(file: File) {
  if (!file.size) return null;
  if (file.size > MAX_ACCOUNTING_ATTACHMENT_BYTES || !ALLOWED_TYPES.has(file.type)) {
    throw new Error("invalid-accounting-attachment");
  }
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (!hasValidSignature(bytes, file.type)) throw new Error("invalid-accounting-attachment");
  return {
    fileName: file.name || "attachment",
    mimeType: file.type,
    size: file.size,
    dataUrl: `data:${file.type};base64,${Buffer.from(bytes).toString("base64")}`,
  };
}
