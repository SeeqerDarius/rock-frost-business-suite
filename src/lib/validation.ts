import "server-only";

import { z } from "zod";

/**
 * Shared Zod primitives for untrusted input coming from FormData or public
 * (unauthenticated) submissions. This is not yet wired into every mutating
 * Server Action in the codebase — see docs/HARDENING_PLAN.md's Pass 3b
 * section for exactly which action files use these schemas today and which
 * still rely on ad-hoc `String()`/`parseInt`/`parseFloat` parsing.
 *
 * Money/quantity fields inside service.ts files already validate their own
 * invariants (positive amount, sufficient stock, etc. — see Pass 2) — these
 * schemas are for the earlier, friendlier rejection at the Server Action
 * boundary, plus general input hygiene (string length limits, email format,
 * enum membership) that nothing previously checked at all.
 */

/** A decimal money amount as a string (matches how every Decimal field in this schema is passed through forms), > 0, at most 2 decimal places, capped at a sane upper bound to reject garbage/overflow input. */
export const moneyAmount = z
  .string()
  .trim()
  .regex(/^\d{1,12}(\.\d{1,2})?$/, "Must be a positive number with at most 2 decimal places.")
  .refine((value) => Number(value) > 0, "Must be greater than zero.");

/** Explicit alias for workflows where zero is never a valid monetary value. */
export const moneyAmountPositive = moneyAmount;

/** Same as moneyAmount but allows zero (e.g. an optional deposit/fee that can legitimately be 0). */
export const moneyAmountNonNegative = z
  .string()
  .trim()
  .regex(/^\d{1,12}(\.\d{1,2})?$/, "Must be a non-negative number with at most 2 decimal places.");

/** A positive whole-number quantity, entered via a text/number input. */
export const positiveInt = z.coerce.number().int().positive();

/** A percentage expressed 0-100 (this codebase stores rates as 0-1 decimals internally; convert at the boundary, not in the schema). */
export const percent0to100 = z.coerce.number().min(0).max(100);

export const email = z.string().trim().toLowerCase().email().max(320);

/** A short display name — long enough for any real name/company/title, short enough to reject pasted-in garbage. */
export const shortText = z.string().trim().min(1).max(200);

/** A free-text note/description/message field. */
export const longText = z.string().trim().max(5000);

/**
 * `shortText.optional()` alone does not correctly handle an optional form
 * field: `.optional()` only bypasses validation when the key is truly
 * absent (`undefined`), but a blank HTML `<input>` still submits an empty
 * string via FormData, which then fails `shortText`'s `.min(1)` and rejects
 * the *entire* form submission - not just that one field. This preprocesses
 * a blank/whitespace-only string to `undefined` first, so leaving an
 * optional field empty behaves the way a form actually needs it to.
 */
export const optionalShortText = z.preprocess(
  (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
  shortText.optional(),
);

/** Same fix as `optionalShortText`, for an optional free-text note/description field. */
export const optionalLongText = z.preprocess(
  (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
  longText.optional(),
);

/** Same fix as `optionalShortText`, for an optional email field. */
export const optionalEmail = z.preprocess(
  (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
  email.optional(),
);

/** Same fix as `optionalShortText`, for an optional `z.coerce.date()` field - an empty HTML date input submits `""`, which `z.coerce.date()` turns into an Invalid Date rather than something `.optional()` bypasses. */
export const optionalCoercedDate = z.preprocess(
  (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
  z.coerce.date().optional(),
);

export const cuid = z.string().trim().min(1).max(50);

/** An HTML date input's value ("YYYY-MM-DD"), parsed to a real Date at local midnight. */
export const dateInput = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Must be a valid date.")
  .transform((value) => new Date(`${value}T00:00:00`))
  .refine((date) => !Number.isNaN(date.getTime()), "Must be a valid date.");

/** Escapes text before it's interpolated into an HTML email template — prevents a submitted field from injecting markup/links into outbound mail. */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Runs a Zod schema against a plain object built from FormData and returns
 * either the parsed, typed data or a flattened field-error map — callers
 * redirect with the first error's message/code rather than exposing raw Zod
 * internals.
 */
export function parseWithSchema<T extends z.ZodType>(
  schema: T,
  data: unknown,
): { success: true; data: z.infer<T> } | { success: false; firstError: string } {
  const result = schema.safeParse(data);
  if (result.success) {
    return { success: true, data: result.data };
  }
  const firstIssue = result.error.issues[0];
  return { success: false, firstError: firstIssue?.message ?? "Invalid input." };
}
