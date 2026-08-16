import { describe, expect, it } from "vitest";
import {
  createContactFormProof,
  isContactHoneypotClear,
  verifyContactFormProof,
} from "@/lib/contact-form-protection";

describe("contact form fallback protection", () => {
  const secret = "test-secret-with-enough-entropy";
  const issuedAt = 1_800_000_000_000;

  it("accepts an untampered proof after the minimum completion time", () => {
    const proof = createContactFormProof(secret, issuedAt);
    expect(verifyContactFormProof(proof, secret, issuedAt + 2_000)).toBe(true);
  });

  it("rejects immediate, expired, and tampered proofs", () => {
    const proof = createContactFormProof(secret, issuedAt);
    expect(verifyContactFormProof(proof, secret, issuedAt + 500)).toBe(false);
    expect(verifyContactFormProof(proof, secret, issuedAt + 2 * 60 * 60 * 1000 + 1)).toBe(false);
    expect(verifyContactFormProof(`${proof}x`, secret, issuedAt + 2_000)).toBe(false);
  });

  it("rejects a filled honeypot", () => {
    expect(isContactHoneypotClear(null)).toBe(true);
    expect(isContactHoneypotClear("")).toBe(true);
    expect(isContactHoneypotClear("spam.example")).toBe(false);
  });
});
