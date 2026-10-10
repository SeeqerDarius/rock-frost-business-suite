import { describe, expect, it } from "vitest";
import { getContrastingForeground, hasSupportedImageSignature, isValidModuleBrandingColor, MODULE_BRANDING_MAX_IMAGE_BYTES, MODULE_BRANDING_MAX_NAME_LENGTH } from "@/lib/module-branding";

describe("module branding validation helpers", () => {
  it("accepts only six-digit hexadecimal colors", () => {
    expect(isValidModuleBrandingColor("#1a2B3c")).toBe(true);
    expect(isValidModuleBrandingColor("red")).toBe(false);
    expect(isValidModuleBrandingColor("#fff")).toBe(false);
    expect(isValidModuleBrandingColor("#12345678")).toBe(false);
  });

  it("selects high-contrast black or white text", () => {
    expect(getContrastingForeground("#ffffff")).toBe("#000000");
    expect(getContrastingForeground("#000000")).toBe("#ffffff");
    expect(getContrastingForeground("#1d4ed8")).toBe("#ffffff");
  });

  it("keeps logo uploads and names within the documented limits", () => {
    expect(MODULE_BRANDING_MAX_IMAGE_BYTES).toBe(1024 * 1024);
    expect(MODULE_BRANDING_MAX_NAME_LENGTH).toBe(80);
  });

  it("checks the uploaded image signature against its declared format", () => {
    expect(hasSupportedImageSignature("image/png", Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))).toBe(true);
    expect(hasSupportedImageSignature("image/png", new Uint8Array([1, 2, 3]))).toBe(false);
    expect(hasSupportedImageSignature("image/svg+xml", new Uint8Array([1]))).toBe(false);
  });
});
