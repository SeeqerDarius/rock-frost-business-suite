import { describe, expect, it } from "vitest";
import { hashPasscode, isValidPasscodeFormat, verifyPasscode } from "@/security/local-passcode";

describe("isValidPasscodeFormat", () => {
  it.each(["1234", "123456", "12345678"])("accepts %s", (passcode) => {
    expect(isValidPasscodeFormat(passcode)).toBe(true);
  });

  it.each(["123", "123456789", "abcd", "12 34", ""])("rejects %s", (passcode) => {
    expect(isValidPasscodeFormat(passcode)).toBe(false);
  });
});

describe("hashPasscode / verifyPasscode", () => {
  it("verifies the correct passcode against its own hash", async () => {
    const stored = await hashPasscode("482913");
    expect(await verifyPasscode("482913", stored)).toBe(true);
  });

  it("rejects an incorrect passcode", async () => {
    const stored = await hashPasscode("482913");
    expect(await verifyPasscode("000000", stored)).toBe(false);
  });

  it("never stores the raw passcode in the hash or salt fields", async () => {
    const stored = await hashPasscode("482913");
    expect(stored.hash).not.toContain("482913");
    expect(stored.salt).not.toContain("482913");
  });

  it("produces a different salt (and therefore hash) for the same passcode across calls", async () => {
    const first = await hashPasscode("482913");
    const second = await hashPasscode("482913");
    expect(first.salt).not.toBe(second.salt);
    expect(first.hash).not.toBe(second.hash);
    // Both must still independently verify correctly.
    expect(await verifyPasscode("482913", first)).toBe(true);
    expect(await verifyPasscode("482913", second)).toBe(true);
  });
});
