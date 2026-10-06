/**
 * Timezone boundaries for reporting periods. Timestamps are stored in UTC;
 * a period such as "1 to 31 October" means local calendar days in the
 * organization's timezone, so its UTC instants differ by organization.
 */

function offsetMinutes(instant: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit",
  }).formatToParts(instant);
  const get = (type: string) => Number(parts.find((part) => part.type === type)?.value);
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
  return Math.round((asUtc - instant.getTime()) / 60_000);
}

/** UTC instant of 00:00 local time on a YYYY-MM-DD calendar day in `timeZone`. */
export function zonedDayStart(ymd: string, timeZone: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) throw new Error("Expected a YYYY-MM-DD date.");
  const [year, month, day] = ymd.split("-").map(Number);
  const guess = Date.UTC(year, month - 1, day);
  // Two passes handle days on which the offset changes (daylight saving).
  let instant = new Date(guess - offsetMinutes(new Date(guess), timeZone) * 60_000);
  instant = new Date(guess - offsetMinutes(instant, timeZone) * 60_000);
  return instant;
}

/** UTC range [start, end) covering local calendar days from..to inclusive. */
export function zonedDateRange(from: string, to: string, timeZone: string): { start: Date; end: Date } {
  const start = zonedDayStart(from, timeZone);
  const next = new Date(Date.UTC(Number(to.slice(0, 4)), Number(to.slice(5, 7)) - 1, Number(to.slice(8, 10)) + 1));
  const end = zonedDayStart(next.toISOString().slice(0, 10), timeZone);
  if (end <= start) throw new Error("The period end must be on or after its start.");
  return { start, end };
}
