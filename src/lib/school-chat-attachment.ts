/**
 * School chat attachments: photos (JPEG, PNG, WEBP) and PDFs up to 4 MB,
 * accepted only when the declared type matches the file's real signature.
 * Same pattern as accounting-attachment-file.ts; stored as a FileAsset data
 * URI like every other attachment in this app. Photos are downscaled in the
 * browser before upload, so most are far below the limit.
 */
export const MAX_SCHOOL_CHAT_ATTACHMENT_BYTES = 4 * 1024 * 1024;
export const SCHOOL_CHAT_ATTACHMENT_TYPES = ["image/jpeg", "image/png", "image/webp", "application/pdf"] as const;

export class SchoolChatAttachmentError extends Error {}

function hasValidSignature(bytes: Uint8Array, type: string) {
  const text = (from: number, to: number) => new TextDecoder().decode(bytes.slice(from, to));
  if (type === "image/jpeg") return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (type === "image/png") return bytes.length >= 8 && [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((value, index) => bytes[index] === value);
  if (type === "image/webp") return bytes.length >= 12 && text(0, 4) === "RIFF" && text(8, 12) === "WEBP";
  if (type === "application/pdf") return bytes.length >= 5 && text(0, 5) === "%PDF-";
  return false;
}

function safeFileName(name: string, type: string) {
  const cleaned = name.replace(/[\\/:*?"<>|\u0000-\u001f]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 120);
  if (cleaned) return cleaned;
  return type === "application/pdf" ? "document.pdf" : "photo";
}

/** Validates an uploaded file. Returns null for an empty file input. */
export async function schoolChatAttachmentData(file: File | null) {
  if (!file || !file.size) return null;
  if (file.size > MAX_SCHOOL_CHAT_ATTACHMENT_BYTES) throw new SchoolChatAttachmentError("Files must be 4 MB or smaller.");
  if (!(SCHOOL_CHAT_ATTACHMENT_TYPES as readonly string[]).includes(file.type)) throw new SchoolChatAttachmentError("Send a photo (JPEG, PNG, or WEBP) or a PDF.");
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (!hasValidSignature(bytes, file.type)) throw new SchoolChatAttachmentError("That file does not match its type. Send a photo or a PDF.");
  return { fileName: safeFileName(file.name, file.type), mimeType: file.type, size: file.size, dataUrl: `data:${file.type};base64,${Buffer.from(bytes).toString("base64")}` };
}
