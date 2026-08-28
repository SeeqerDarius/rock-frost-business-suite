/**
 * Shared "last N buckets" builder for switchable-granularity trend charts
 * (Dashboard's Revenue insights, Accounting overview's Trends card). A
 * caller queries once against `widestTrendLookback()` (the widest window
 * any granularity needs), then sums whatever it's tracking into each
 * bucket's [start, end) range - this file only computes bucket boundaries
 * and labels, never touches the database itself.
 */

export type TrendGranularity = "days" | "weeks" | "months";

export interface TrendBucket {
  label: string;
  start: Date;
  end: Date;
}

export function buildTrendBuckets(granularity: TrendGranularity, count = 6): TrendBucket[] {
  const buckets: TrendBucket[] = [];
  const now = new Date();

  if (granularity === "days") {
    for (let i = count - 1; i >= 0; i--) {
      const start = new Date(now);
      start.setHours(0, 0, 0, 0);
      start.setDate(start.getDate() - i);
      const end = new Date(start);
      end.setDate(end.getDate() + 1);
      buckets.push({ label: start.toLocaleDateString("en-US", { weekday: "short" }), start, end });
    }
    return buckets;
  }

  if (granularity === "weeks") {
    const todayStart = new Date(now);
    todayStart.setHours(0, 0, 0, 0);
    for (let i = count - 1; i >= 0; i--) {
      const end = new Date(todayStart);
      end.setDate(end.getDate() - i * 7 + 1);
      const start = new Date(end);
      start.setDate(start.getDate() - 7);
      buckets.push({ label: start.toLocaleDateString("en-US", { month: "short", day: "numeric" }), start, end });
    }
    return buckets;
  }

  for (let i = count - 1; i >= 0; i--) {
    const start = new Date(now);
    start.setHours(0, 0, 0, 0);
    start.setDate(1);
    start.setMonth(start.getMonth() - i);
    const end = new Date(start);
    end.setMonth(end.getMonth() + 1);
    buckets.push({ label: start.toLocaleDateString("en-US", { month: "short" }), start, end });
  }
  return buckets;
}

/** The earliest start date across every granularity's buckets - the one query window a caller needs to fetch. */
export function widestTrendLookback(count = 6): Date {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  start.setDate(1);
  start.setMonth(start.getMonth() - (count - 1));
  return start;
}
