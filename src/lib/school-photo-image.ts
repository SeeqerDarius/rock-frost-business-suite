import sharp from "sharp";

export const MAX_SCHOOL_PHOTO_BYTES = 1024 * 1024;
export const MIN_SCHOOL_PHOTO_DIMENSION = 128;
export const MAX_SCHOOL_PHOTO_DIMENSION = 8000;

const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

function hasValidSignature(bytes: Uint8Array, type: string) {
  if (type === "image/jpeg") return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (type === "image/png") return bytes.length >= 8 && [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((value, index) => bytes[index] === value);
  if (type === "image/webp") return bytes.length >= 12 && new TextDecoder().decode(bytes.slice(0, 4)) === "RIFF" && new TextDecoder().decode(bytes.slice(8, 12)) === "WEBP";
  return false;
}

export async function schoolPhotoImageData(file: File) {
  if (!file.size) return null;
  if (file.size > MAX_SCHOOL_PHOTO_BYTES || !IMAGE_TYPES.has(file.type)) throw new Error("invalid-photo");
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (!hasValidSignature(bytes, file.type)) throw new Error("invalid-photo");
  return `data:${file.type};base64,${Buffer.from(bytes).toString("base64")}`;
}

export async function schoolStudentPhotoImages(file: File, cropFocus: "attention" | "centre" | "north" | "south" = "attention") {
  const original = await schoolPhotoImageData(file);
  if (!original) return null;
  const bytes = Buffer.from(await file.arrayBuffer());
  let metadata;
  try { metadata = await sharp(bytes).metadata(); } catch { throw new Error("invalid-photo"); }
  const width = metadata.width ?? 0;
  const height = metadata.height ?? 0;
  if (width < MIN_SCHOOL_PHOTO_DIMENSION || height < MIN_SCHOOL_PHOTO_DIMENSION || width > MAX_SCHOOL_PHOTO_DIMENSION || height > MAX_SCHOOL_PHOTO_DIMENSION) throw new Error("invalid-photo");
  const optimized = await sharp(bytes).rotate().resize(512, 512, { fit: "cover", position: cropFocus }).webp({ quality: 84 }).toBuffer();
  return { original, optimized: `data:image/webp;base64,${optimized.toString("base64")}`, width, height };
}

export function parseSchoolPhotoImage(data: string) {
  const match = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/.exec(data);
  return match ? { type: match[1], bytes: Buffer.from(match[2], "base64") } : null;
}
