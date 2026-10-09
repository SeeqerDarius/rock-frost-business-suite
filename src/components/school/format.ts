/**
 * Shared School display formatting. Money is formatted with the
 * organization formatter (createOrganizationFormatter in @/lib/org-format),
 * so School amounts follow the organization currency and number format.
 */

const dateOnly = new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric" });

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
