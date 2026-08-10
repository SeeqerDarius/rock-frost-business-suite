import { afterEach, describe, expect, it, vi } from "vitest";
import { decryptTotpSecret, encryptTotpSecret, generateTotpSecret, getTotpUri, verifyTotpCode } from "@/lib/auth/totp";

afterEach(() => vi.unstubAllEnvs());

describe("TOTP two-factor authentication", () => {
  it("encrypts secrets with authenticated encryption and decrypts them", () => {
    vi.stubEnv("TWO_FACTOR_ENCRYPTION_KEY", "test-only-two-factor-key");
    const secret = generateTotpSecret();
    const encrypted = encryptTotpSecret(secret);
    expect(encrypted).not.toContain(secret);
    expect(decryptTotpSecret(encrypted)).toBe(secret);
    const parts = encrypted.split(".");
    const tag = Buffer.from(parts[2]!, "base64url");
    tag[0] ^= 0xff;
    parts[2] = tag.toString("base64url");
    expect(() => decryptTotpSecret(parts.join("."))).toThrow();
  });

  it("verifies a standard RFC 6238 SHA-1 test vector within the allowed time window", () => {
    const secret = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ";
    expect(verifyTotpCode(secret, "287082", 59_000)).toBe(true);
    expect(verifyTotpCode(secret, "287083", 59_000)).toBe(false);
    expect(verifyTotpCode(secret, "not-a-code", 59_000)).toBe(false);
  });

  it("builds an authenticator-compatible URI without exposing anything beyond the setup secret", () => {
    const uri = getTotpUri("owner@example.com", "ABCDEF234567");
    expect(uri).toContain("otpauth://totp/");
    expect(uri).toContain("issuer=Rock+Frost+Business+Suite");
    expect(uri).toContain("secret=ABCDEF234567");
  });
});
