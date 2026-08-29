import { describe, it, expect } from "vitest";
import { computeObligationSummary, type ObligationSubmission } from "@/modules/fleet/driver-obligations";

const utc = (y: number, m: number, d: number, h = 0) => new Date(Date.UTC(y, m - 1, d, h));

/** Discovers the exact period boundaries computeObligationSummary uses internally for a given (type, now), without duplicating its date math in the test. */
function currentPeriodBounds(type: "DAILY" | "WEEKLY", now: Date) {
  const probe = computeObligationSummary(type, 1, [], now);
  const current = probe.periods[probe.periods.length - 1];
  return { periodStart: current.periodStart, periodEnd: current.periodEnd };
}

function submission(overrides: Partial<ObligationSubmission>): ObligationSubmission {
  return {
    periodStart: utc(2026, 1, 1),
    periodEnd: utc(2026, 1, 1),
    amount: 0,
    status: "APPROVED",
    paymentDate: utc(2026, 1, 1),
    ...overrides,
  };
}

describe("computeObligationSummary", () => {
  it("shows the full expected amount as due, and no overdue, when nothing is submitted and the current period is still open", () => {
    const now = utc(2026, 8, 26, 10);
    const summary = computeObligationSummary("DAILY", 200, [], now);
    const current = summary.periods[summary.periods.length - 1];
    expect(current.isClosed).toBe(false);
    expect(current.isOverdue).toBe(false);
    expect(summary.dueNow).toBe(200);
    expect(summary.pendingAmount).toBe(0);
  });

  it("marks a past period with nothing submitted as overdue once it has fully closed", () => {
    const now = utc(2026, 8, 26, 10);
    const summary = computeObligationSummary("DAILY", 200, [], now);
    const twoDaysAgo = summary.periods.find((p) => p.periodStart.getTime() === utc(2026, 8, 24).getTime());
    expect(twoDaysAgo?.isClosed).toBe(true);
    expect(twoDaysAgo?.isOverdue).toBe(true);
    expect(summary.overdueAmount).toBeGreaterThanOrEqual(200);
  });

  it("accumulates overdue amount across multiple consecutive unpaid closed periods", () => {
    const now = utc(2026, 8, 26, 10);
    const summary = computeObligationSummary("DAILY", 150, [], now);
    // periods for 8/20 through 8/25 (6 days before "now") are all closed with nothing submitted
    const closedUnpaid = summary.periods.filter((p) => p.isOverdue);
    expect(closedUnpaid.length).toBe(5); // every prior day in the 6-day window except today (still open)
    expect(summary.overdueAmount).toBe(150 * 5);
  });

  it("treats a partial approved payment as a shortfall - still due, and overdue for only the remainder once closed", () => {
    const now = utc(2026, 8, 26, 10);
    const { periodStart, periodEnd } = currentPeriodBounds("DAILY", now);
    const summary = computeObligationSummary("DAILY", 200, [
      submission({ periodStart, periodEnd, amount: 120, status: "APPROVED", paymentDate: now }),
    ], now);
    expect(summary.dueNow).toBe(80);
    const current = summary.periods[summary.periods.length - 1];
    expect(current.isPaid).toBe(false);
  });

  it("treats an exact approved payment as fully paid with nothing due", () => {
    const now = utc(2026, 8, 26, 10);
    const { periodStart, periodEnd } = currentPeriodBounds("DAILY", now);
    const summary = computeObligationSummary("DAILY", 200, [
      submission({ periodStart, periodEnd, amount: 200, status: "APPROVED", paymentDate: now }),
    ], now);
    expect(summary.dueNow).toBe(0);
    expect(summary.periods[summary.periods.length - 1].isPaid).toBe(true);
  });

  it("treats an overpayment as fully paid with nothing due, never a negative amount", () => {
    const now = utc(2026, 8, 26, 10);
    const { periodStart, periodEnd } = currentPeriodBounds("DAILY", now);
    const summary = computeObligationSummary("DAILY", 200, [
      submission({ periodStart, periodEnd, amount: 250, status: "APPROVED", paymentDate: now }),
    ], now);
    expect(summary.dueNow).toBe(0);
    expect(summary.periods[summary.periods.length - 1].isPaid).toBe(true);
  });

  it("keeps a pending (not yet approved) submission out of dueNow and paidThisPeriod, surfacing it separately", () => {
    const now = utc(2026, 8, 26, 10);
    const { periodStart, periodEnd } = currentPeriodBounds("DAILY", now);
    const summary = computeObligationSummary("DAILY", 200, [
      submission({ periodStart, periodEnd, amount: 200, status: "PENDING", paymentDate: now }),
    ], now);
    expect(summary.dueNow).toBe(200);
    expect(summary.paidThisPeriod).toBe(0);
    expect(summary.pendingAmount).toBe(200);
    expect(summary.periods[summary.periods.length - 1].isPaid).toBe(false);
  });

  it("counts a payment submitted exactly at the period's closing instant as on time", () => {
    const now = utc(2026, 8, 26, 10);
    const { periodStart, periodEnd } = currentPeriodBounds("DAILY", now);
    const deadline = new Date(periodEnd);
    deadline.setUTCDate(deadline.getUTCDate() + 1);
    const summary = computeObligationSummary("DAILY", 200, [
      submission({ periodStart, periodEnd, amount: 200, status: "APPROVED", paymentDate: deadline }),
    ], deadline);
    const paidPeriod = summary.periods.find((p) => p.periodStart.getTime() === periodStart.getTime());
    expect(paidPeriod?.isOnTime).toBe(true);
  });

  it("is keyed on the driver's own paymentDate, not a later manager-review timestamp, so approval lag never counts against on-time rate", () => {
    const now = utc(2026, 8, 26, 10);
    const { periodStart, periodEnd } = currentPeriodBounds("DAILY", now);
    // paymentDate is same-day (on time), even though "now" (standing in for a delayed review) is well after the deadline
    const summary = computeObligationSummary("DAILY", 200, [
      submission({ periodStart, periodEnd, amount: 200, status: "APPROVED", paymentDate: periodStart }),
    ], utc(2026, 8, 30));
    const paidPeriod = summary.periods.find((p) => p.periodStart.getTime() === periodStart.getTime());
    expect(paidPeriod?.isOnTime).toBe(true);
  });

  it("computes a weekly period as Monday through Sunday, matching submitFleetDriverPayment's own salesPeriod()", () => {
    const wednesday = utc(2026, 8, 26, 10); // 2026-08-26 is a Wednesday
    const summary = computeObligationSummary("WEEKLY", 1000, [], wednesday);
    const current = summary.periods[summary.periods.length - 1];
    expect(current.periodStart.getUTCDay()).toBe(1); // Monday
    expect(current.periodEnd.getUTCDay()).toBe(0); // Sunday
    expect(current.periodEnd.getTime() - current.periodStart.getTime()).toBe(6 * 24 * 60 * 60 * 1000);
  });

  it("returns a null on-time rate when the trailing window has no resolved period yet", () => {
    const now = utc(2026, 8, 26, 10);
    // a brand-new obligation with the current period still open counts as unresolved
    const summary = computeObligationSummary("DAILY", 200, [], now, 1);
    expect(summary.onTimeRate).toBeNull();
  });

  it("never marks a period overdue if it closed before the obligation existed (existsSince), so a freshly assigned vehicle doesn't inherit fake history", () => {
    const now = utc(2026, 8, 26, 10);
    const assignedToday = utc(2026, 8, 26); // the vehicle/contract was only just created
    const summary = computeObligationSummary("DAILY", 200, [], now, 6, assignedToday);
    const priorDays = summary.periods.filter((p) => p.periodStart.getTime() !== assignedToday.getTime());
    expect(priorDays.every((p) => !p.isOverdue)).toBe(true);
    expect(priorDays.every((p) => p.isOnTime === null)).toBe(true);
    expect(summary.overdueAmount).toBe(0);
  });

  it("still evaluates periods normally once existsSince is far enough in the past to cover the whole window", () => {
    const now = utc(2026, 8, 26, 10);
    const longAgo = utc(2020, 1, 1);
    const summary = computeObligationSummary("DAILY", 150, [], now, 6, longAgo);
    expect(summary.overdueAmount).toBe(150 * 5);
  });

  it("rejected and cancelled submissions never count toward paid, pending, or due-reduction", () => {
    const now = utc(2026, 8, 26, 10);
    const { periodStart, periodEnd } = currentPeriodBounds("DAILY", now);
    const summary = computeObligationSummary("DAILY", 200, [
      submission({ periodStart, periodEnd, amount: 200, status: "REJECTED", paymentDate: now }),
      submission({ periodStart, periodEnd, amount: 200, status: "CANCELLED", paymentDate: now }),
    ], now);
    expect(summary.dueNow).toBe(200);
    expect(summary.paidThisPeriod).toBe(0);
    expect(summary.pendingAmount).toBe(0);
  });
});
