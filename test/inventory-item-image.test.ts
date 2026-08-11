import { describe, expect, it } from "vitest";
import { inventoryItemImageData, parseInventoryItemImage } from "@/lib/inventory-item-image";

const PNG_SIGNATURE = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]);

describe("inventory item images", () => {
  it("accepts a signature-verified image and round-trips its bytes", async () => {
    const data = await inventoryItemImageData(new File([PNG_SIGNATURE], "item.png", { type: "image/png" }));
    expect(data).toMatch(/^data:image\/png;base64,/);
    expect(parseInventoryItemImage(data!)?.bytes).toEqual(Buffer.from(PNG_SIGNATURE));
  });

  it("rejects a file whose declared image type does not match its contents", async () => {
    const fake = new File(["not an image"], "item.png", { type: "image/png" });
    await expect(inventoryItemImageData(fake)).rejects.toThrow("invalid-item-image");
  });

  it("rejects unsupported or oversized files", async () => {
    await expect(inventoryItemImageData(new File(["x"], "item.gif", { type: "image/gif" }))).rejects.toThrow("invalid-item-image");
    const oversized = new File([new Uint8Array(1024 * 1024 + 1)], "large.png", { type: "image/png" });
    await expect(inventoryItemImageData(oversized)).rejects.toThrow("invalid-item-image");
  });
});
