import { describe, expect, it } from "vitest";
import nextConfig from "../next.config";
import { isValidProfileImage, MAX_PROFILE_IMAGE_BYTES } from "@/lib/profile-image";

describe("profile image upload limits", () => {
  it("allows the documented image types up to exactly 1 MiB", () => {
    expect(isValidProfileImage({ type: "image/jpeg", size: MAX_PROFILE_IMAGE_BYTES })).toBe(true);
    expect(isValidProfileImage({ type: "image/png", size: 1 })).toBe(true);
    expect(isValidProfileImage({ type: "image/webp", size: 1 })).toBe(true);
  });

  it("rejects empty, oversized, and unsupported files", () => {
    expect(isValidProfileImage({ type: "image/jpeg", size: 0 })).toBe(false);
    expect(isValidProfileImage({ type: "image/jpeg", size: MAX_PROFILE_IMAGE_BYTES + 1 })).toBe(false);
    expect(isValidProfileImage({ type: "image/gif", size: 100 })).toBe(false);
  });

  it("keeps a bounded multipart envelope above the application file limit", () => {
    expect(nextConfig.experimental?.serverActions?.bodySizeLimit).toBe("2mb");
  });
});
