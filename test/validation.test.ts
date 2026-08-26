import { describe, it, expect } from "vitest";
import {
  moneyAmount,
  moneyAmountNonNegative,
  positiveInt,
  percent0to100,
  email,
  shortText,
  longText,
  dateInput,
  escapeHtml,
  parseWithSchema,
  optionalShortText,
  optionalLongText,
  optionalEmail,
  optionalCoercedDate,
} from "@/lib/validation";
import { z } from "zod";

describe("validation primitives", () => {
  it("moneyAmount accepts a positive 2-decimal string and rejects zero/negative/garbage", () => {
    expect(moneyAmount.safeParse("100.50").success).toBe(true);
    expect(moneyAmount.safeParse("0").success).toBe(false);
    expect(moneyAmount.safeParse("-5.00").success).toBe(false);
    expect(moneyAmount.safeParse("abc").success).toBe(false);
    expect(moneyAmount.safeParse("1.999").success).toBe(false); // too many decimal places
  });

  it("moneyAmountNonNegative allows zero but not negative", () => {
    expect(moneyAmountNonNegative.safeParse("0").success).toBe(true);
    expect(moneyAmountNonNegative.safeParse("0.00").success).toBe(true);
    expect(moneyAmountNonNegative.safeParse("-1").success).toBe(false);
  });

  it("positiveInt coerces numeric strings and rejects non-positive/non-integer", () => {
    expect(positiveInt.safeParse("5").success).toBe(true);
    expect(positiveInt.safeParse("0").success).toBe(false);
    expect(positiveInt.safeParse("-3").success).toBe(false);
    expect(positiveInt.safeParse("1.5").success).toBe(false);
  });

  it("percent0to100 clamps to the valid range", () => {
    expect(percent0to100.safeParse("50").success).toBe(true);
    expect(percent0to100.safeParse("0").success).toBe(true);
    expect(percent0to100.safeParse("100").success).toBe(true);
    expect(percent0to100.safeParse("101").success).toBe(false);
    expect(percent0to100.safeParse("-1").success).toBe(false);
  });

  it("email normalizes case and rejects malformed addresses", () => {
    const result = email.safeParse("Person@Example.COM");
    expect(result.success).toBe(true);
    if (result.success) expect(result.data).toBe("person@example.com");
    expect(email.safeParse("not-an-email").success).toBe(false);
  });

  it("shortText rejects empty and overly long input", () => {
    expect(shortText.safeParse("Acme Inc").success).toBe(true);
    expect(shortText.safeParse("").success).toBe(false);
    expect(shortText.safeParse("x".repeat(201)).success).toBe(false);
  });

  it("longText rejects overly long input but allows empty", () => {
    expect(longText.safeParse("").success).toBe(true);
    expect(longText.safeParse("x".repeat(5001)).success).toBe(false);
  });

  it("dateInput parses a YYYY-MM-DD string to a real Date and rejects garbage", () => {
    const result = dateInput.safeParse("2026-07-21");
    expect(result.success).toBe(true);
    if (result.success) expect(result.data).toBeInstanceOf(Date);
    expect(dateInput.safeParse("not-a-date").success).toBe(false);
  });

  it("escapeHtml neutralizes markup so a submitted field can't inject into an HTML email", () => {
    const malicious = '<script>alert(1)</script><a href="evil">click</a>';
    const escaped = escapeHtml(malicious);
    expect(escaped).not.toContain("<script>");
    expect(escaped).toContain("&lt;script&gt;");
  });

  it("optionalShortText tolerates a blank form field inside a combined schema (plain .optional() rejects the whole submission)", () => {
    // A blank HTML <input> submits "" via FormData/Object.fromEntries, not
    // undefined — shortText.optional() still runs "" through .min(1) and
    // fails the whole z.object(...), not just that one field.
    const broken = z.object({ name: shortText, nickname: shortText.optional() });
    expect(broken.safeParse({ name: "Alice", nickname: "" }).success).toBe(false);

    const fixed = z.object({ name: shortText, nickname: optionalShortText });
    const result = fixed.safeParse({ name: "Alice", nickname: "" });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.nickname).toBeUndefined();
    expect(fixed.safeParse({ name: "Alice", nickname: "Ally" }).success).toBe(true);
  });

  it("optionalLongText, optionalEmail and optionalCoercedDate treat a blank string as absent the same way", () => {
    expect(optionalLongText.safeParse("").success).toBe(true);
    expect(optionalLongText.safeParse("   ").success).toBe(true);
    expect(optionalLongText.safeParse("notes").success).toBe(true);

    expect(optionalEmail.safeParse("").success).toBe(true);
    expect(optionalEmail.safeParse("not-an-email").success).toBe(false);
    expect(optionalEmail.safeParse("person@example.com").success).toBe(true);

    const blankDate = optionalCoercedDate.safeParse("");
    expect(blankDate.success).toBe(true);
    if (blankDate.success) expect(blankDate.data).toBeUndefined();
    const realDate = optionalCoercedDate.safeParse("2026-01-15");
    expect(realDate.success).toBe(true);
    if (realDate.success) expect(realDate.data).toBeInstanceOf(Date);
  });

  it("parseWithSchema returns a typed success or a single readable error message", () => {
    const schema = z.object({ name: shortText });
    const ok = parseWithSchema(schema, { name: "Alice" });
    expect(ok.success).toBe(true);

    const bad = parseWithSchema(schema, { name: "" });
    expect(bad.success).toBe(false);
    if (!bad.success) expect(typeof bad.firstError).toBe("string");
  });
});
