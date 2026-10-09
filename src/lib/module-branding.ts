export const MODULE_BRANDING_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
export const MODULE_BRANDING_MAX_IMAGE_BYTES = 1024 * 1024;
export const MODULE_BRANDING_MAX_NAME_LENGTH = 80;

export function isValidModuleBrandingColor(value: string): boolean {
  return /^#[0-9a-fA-F]{6}$/.test(value);
}

export function hasSupportedImageSignature(mimeType: string, bytes: Uint8Array): boolean {
  if (mimeType === "image/jpeg") return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (mimeType === "image/png") return bytes.length >= 8 && [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((byte, index) => bytes[index] === byte);
  if (mimeType === "image/webp") return bytes.length >= 12 && String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" && String.fromCharCode(...bytes.slice(8, 12)) === "WEBP";
  return false;
}

export function getContrastingForeground(hex: string): "#000000" | "#ffffff" {
  const channels = [1, 3, 5].map((offset) => parseInt(hex.slice(offset, offset + 2), 16) / 255)
    .map((channel) => channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4);
  const luminance = 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
  return luminance > 0.179 ? "#000000" : "#ffffff";
}
