export const MAX_INVENTORY_ITEM_IMAGE_BYTES = 1024 * 1024;

const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

function hasValidSignature(bytes: Uint8Array, type: string) {
  if (type === "image/jpeg") return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (type === "image/png") return bytes.length >= 8 && [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((value, index) => bytes[index] === value);
  if (type === "image/webp") return bytes.length >= 12 && new TextDecoder().decode(bytes.slice(0, 4)) === "RIFF" && new TextDecoder().decode(bytes.slice(8, 12)) === "WEBP";
  return false;
}

export async function inventoryItemImageData(file: File) {
  if (!file.size) return null;
  if (file.size > MAX_INVENTORY_ITEM_IMAGE_BYTES || !IMAGE_TYPES.has(file.type)) throw new Error("invalid-item-image");
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (!hasValidSignature(bytes, file.type)) throw new Error("invalid-item-image");
  return `data:${file.type};base64,${Buffer.from(bytes).toString("base64")}`;
}

export function parseInventoryItemImage(data: string) {
  const match = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/.exec(data);
  return match ? { type: match[1], bytes: Buffer.from(match[2], "base64") } : null;
}
