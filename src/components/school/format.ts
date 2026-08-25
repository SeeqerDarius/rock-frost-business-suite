import type { Prisma } from "@prisma/client";

/**
 * Shared School display formatting.
 *
 * Currency is GHS to match the existing School Overview card, which was the
 * only School surface that formatted money before this change; every other
 * page printed a bare `toFixed(2)`. School has no per-organization currency
 * setting yet — see docs/SCHOOL_UI_CUSTOMER_READINESS.md.
 */

const currency = new Intl.NumberFormat("en-GH", { style: "currency", currency: "GHS" });
const dateOnly = new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric" });

export function formatMoney(value: Prisma.Decimal | number | string) {
  return currency.format(Number(value));
}

export function formatDate(value: Date | null | undefined) {
  return value ? dateOnly.format(value) : "-";
}

const DAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

/** Timetable `dayOfWeek` is stored 1–7 starting at Monday (see createSchoolTimetableEntry). */
export function formatDayOfWeek(day: number) {
  return DAY_NAMES[day - 1] ?? `Day ${day}`;
}

export const DAY_OPTIONS = DAY_NAMES.map((label, index) => ({ value: String(index + 1), label }));

/** Turns an enum such as PART_PAID into "Part paid" for customer-facing text. */
export function humanizeStatus(value: string) {
  const text = value.replaceAll("_", " ").toLowerCase();
  return text.charAt(0).toUpperCase() + text.slice(1);
}
