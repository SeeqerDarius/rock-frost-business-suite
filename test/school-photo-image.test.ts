import { describe, expect, it } from "vitest";
import { schoolPhotoImageData, parseSchoolPhotoImage } from "@/lib/school-photo-image";

const PNG_SIGNATURE = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]);

describe("school student/guardian photos", () => {
  it("accepts a signature-verified image and round-trips its bytes", async () => {
    const data = await schoolPhotoImageData(new File([PNG_SIGNATURE], "photo.png", { type: "image/png" }));
    expect(data).toMatch(/^data:image\/png;base64,/);
    expect(parseSchoolPhotoImage(data!)?.bytes).toEqual(Buffer.from(PNG_SIGNATURE));
  });

  it("rejects a file whose declared image type does not match its contents", async () => {
    const fake = new File(["not an image"], "photo.png", { type: "image/png" });
    await expect(schoolPhotoImageData(fake)).rejects.toThrow("invalid-photo");
  });

  it("rejects unsupported or oversized files", async () => {
    await expect(schoolPhotoImageData(new File(["x"], "photo.gif", { type: "image/gif" }))).rejects.toThrow("invalid-photo");
    const oversized = new File([new Uint8Array(1024 * 1024 + 1)], "large.png", { type: "image/png" });
    await expect(schoolPhotoImageData(oversized)).rejects.toThrow("invalid-photo");
  });

  it("returns null for an empty file (no photo selected)", async () => {
    const data = await schoolPhotoImageData(new File([], "empty.png", { type: "image/png" }));
    expect(data).toBeNull();
  });
});
