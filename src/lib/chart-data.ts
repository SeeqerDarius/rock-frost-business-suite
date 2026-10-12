/**
 * Emptiness rules for chart data.
 *
 * Kept out of the chart components themselves (which are `"use client"`) so
 * the rule is a plain, directly testable function rather than something only
 * assertable by reading source.
 */

/**
 * True when at least one finite, non-zero value exists across `keys`.
 *
 * "Has data" has to mean "there is something to look at", not "the array is
 * populated". A trend over a period with no activity is not missing: the
 * buckets are all there and every one of them holds 0, which is a perfectly
 * finite number, so a presence check passes and the chart draws a flat zero
 * line. On the Overview dashboard of a new organization that produced a
 * revenue chart with a three-way period switcher and a three-way style
 * toggle above it. Six controls, nothing to control.
 *
 * Negative values count: an expense or a loss series is real data.
 */
export function hasNonZeroValues(data: Record<string, string | number>[], keys: string[]): boolean {
  return data.some((row) => keys.some((key) => {
    const value = Number(row[key]);
    return Number.isFinite(value) && value !== 0;
  }));
}
