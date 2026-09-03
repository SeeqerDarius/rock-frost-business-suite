import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { schoolPhotoImageData, schoolStudentPhotoImages, parseSchoolPhotoImage } from "@/lib/school-photo-image";

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

  it("preserves the original and creates a bounded square card image", async () => {
    const source = await sharp({ create: { width: 640, height: 480, channels: 3, background: "#204080" } }).png().toBuffer();
    const images = await schoolStudentPhotoImages(new File([source], "student.png", { type: "image/png" }), "centre");
    expect(images?.original).toMatch(/^data:image\/png;base64,/);
    expect(images?.optimized).toMatch(/^data:image\/webp;base64,/);
    const metadata = await sharp(Buffer.from(images!.optimized.split(",")[1], "base64")).metadata();
    expect([metadata.width, metadata.height]).toEqual([512, 512]);
  });

  it("rejects an image below the minimum dimensions", async () => {
    const source = await sharp({ create: { width: 64, height: 64, channels: 3, background: "white" } }).png().toBuffer();
    await expect(schoolStudentPhotoImages(new File([source], "small.png", { type: "image/png" }))).rejects.toThrow("invalid-photo");
  });
});
