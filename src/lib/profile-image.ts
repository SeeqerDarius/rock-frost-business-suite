export const MAX_PROFILE_IMAGE_BYTES = 1024 * 1024;

const PROFILE_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

export function isValidProfileImage(file: Pick<File, "size" | "type">) {
  return file.size > 0 && file.size <= MAX_PROFILE_IMAGE_BYTES && PROFILE_IMAGE_TYPES.has(file.type);
}
