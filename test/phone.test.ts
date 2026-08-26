import { describe, it, expect } from "vitest";
import { normalizeGhanaPhone } from "@/lib/phone";

describe("normalizeGhanaPhone", () => {
  it("accepts an already-local 0XXXXXXXXX number as-is", () => {
    expect(normalizeGhanaPhone("0241234567")).toBe("0241234567");
  });

  it("converts an international 233XXXXXXXXX number to local form", () => {
    expect(normalizeGhanaPhone("233241234567")).toBe("0241234567");
  });

  it("converts a +233XXXXXXXXX number to local form", () => {
    expect(normalizeGhanaPhone("+233241234567")).toBe("0241234567");
  });

  it("converts a bare 9-digit number (no leading 0) to local form", () => {
    expect(normalizeGhanaPhone("241234567")).toBe("0241234567");
  });

  it("strips spaces and dashes before normalizing", () => {
    expect(normalizeGhanaPhone("024 123 4567")).toBe("0241234567");
    expect(normalizeGhanaPhone("024-123-4567")).toBe("0241234567");
  });

  it("returns null for garbage, empty, or wrong-length input", () => {
    expect(normalizeGhanaPhone("")).toBeNull();
    expect(normalizeGhanaPhone(null)).toBeNull();
    expect(normalizeGhanaPhone(undefined)).toBeNull();
    expect(normalizeGhanaPhone("not a phone number")).toBeNull();
    expect(normalizeGhanaPhone("12345")).toBeNull();
  });
});
