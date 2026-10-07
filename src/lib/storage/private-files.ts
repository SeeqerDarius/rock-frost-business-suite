import "server-only";

import { createHash } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";

/**
 * Private, tenant-scoped file storage. Files are never exposed by public
 * URL: they are streamed only by authorized route handlers that re-check
 * organization, permission, and record-level access on every request.
 *
 * The current backend stores bytes in Postgres (FileContent) next to the
 * FileAsset metadata. The adapter boundary allows an object store (for
 * example Vercel Blob with signed URLs) to replace it without changing
 * callers.
 */
export class PrivateFileError extends Error {}

/** Vercel limits a function request body to 4.5 MB, so uploads are capped at 4 MB. */
export const PRIVATE_FILE_MAX_BYTES = 4 * 1024 * 1024;

const ALLOWED_TYPES = new Set([
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "text/plain",
  "image/png",
  "image/jpeg",
  "image/webp",
]);

/** Leading bytes for the binary types, so a renamed file cannot claim to be a PDF. */
const SIGNATURES: Record<string, number[][]> = {
  "application/pdf": [[0x25, 0x50, 0x44, 0x46]],
  "image/png": [[0x89, 0x50, 0x4e, 0x47]],
  "image/jpeg": [[0xff, 0xd8, 0xff]],
  "image/webp": [[0x52, 0x49, 0x46, 0x46]],
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": [[0x50, 0x4b, 0x03, 0x04]],
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": [[0x50, 0x4b, 0x03, 0x04]],
  "application/msword": [[0xd0, 0xcf, 0x11, 0xe0]],
  "application/vnd.ms-excel": [[0xd0, 0xcf, 0x11, 0xe0]],
};

export function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

export function validatePrivateFile(input: { fileName: string; mimeType: string; bytes: Uint8Array }) {
  if (!input.bytes.byteLength) throw new PrivateFileError("The file is empty.");
  if (input.bytes.byteLength > PRIVATE_FILE_MAX_BYTES) throw new PrivateFileError("Files must be 4 MB or smaller.");
  if (!ALLOWED_TYPES.has(input.mimeType)) throw new PrivateFileError("Upload a PDF, Word, Excel, text, or image file.");
  const signatures = SIGNATURES[input.mimeType];
  if (signatures && !signatures.some((signature) => signature.every((byte, index) => input.bytes[index] === byte))) {
    throw new PrivateFileError("The file content does not match its type.");
  }
  const fileName = input.fileName.replace(/[\\/:*?"<>|\u0000-\u001f]/g, "_").trim().slice(0, 200);
  if (!fileName) throw new PrivateFileError("The file needs a name.");
  return { fileName };
}

/** Stores a private file inside the caller's transaction. */
export async function storePrivateFile(tx: Prisma.TransactionClient, input: {
  organizationId: string;
  uploadedById: string | null;
  fileName: string;
  mimeType: string;
  bytes: Uint8Array;
  purpose: string;
  branchId?: string | null;
}) {
  const { fileName } = validatePrivateFile(input);
  const checksum = sha256(input.bytes);
  const asset = await tx.fileAsset.create({
    data: {
      organizationId: input.organizationId,
      branchId: input.branchId ?? null,
      uploadedById: input.uploadedById,
      fileName,
      mimeType: input.mimeType,
      size: input.bytes.byteLength,
      storagePath: `private://${input.purpose}`,
      url: null,
      metadata: { purpose: input.purpose, checksumSha256: checksum },
    },
  });
  await tx.fileContent.create({ data: { fileAssetId: asset.id, data: Buffer.from(input.bytes) } });
  return { asset, checksum };
}

/** Reads a private file; always scoped to the organization. */
export async function readPrivateFile(organizationId: string, fileAssetId: string) {
  const asset = await db.fileAsset.findFirst({ where: { id: fileAssetId, organizationId }, include: { content: true } });
  if (!asset?.content) return null;
  return { fileName: asset.fileName, mimeType: asset.mimeType, size: asset.size, bytes: asset.content.data };
}
