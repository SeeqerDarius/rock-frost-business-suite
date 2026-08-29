import "server-only";

import { db } from "@/lib/db";
import type { FleetSalesTargetPeriod } from "@prisma/client";

/**
 * Fleet has no due-date column anywhere - a vehicle's remittance and a Work
 * & Pay contract's instalment are both purely periodic (DAILY/WEEKLY). Due
 * date, overdue amount, and on-time rate are therefore derived entirely at
 * read time from FleetDriverPaymentSubmission history, never stored. This
 * mirrors the read-time-derivation shape Installment's getEffectiveAccountStatus
 * and Accounting's sweepOverdueInvoices both use, adapted for a schedule with
 * no stored anchor date at all.
 */

export type PeriodType = "DAILY" | "WEEKLY";

function startOfUtcDay(value: Date): Date {
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
}

function periodBounds(type: PeriodType, referenceDate: Date): { periodStart: Date; periodEnd: Date } {
  const periodStart = startOfUtcDay(referenceDate);
  const periodEnd = new Date(periodStart);
  if (type === "WEEKLY") {
    const daysSinceMonday = (periodStart.getUTCDay() + 6) % 7;
    periodStart.setUTCDate(periodStart.getUTCDate() - daysSinceMonday);
    periodEnd.setTime(periodStart.getTime());
    periodEnd.setUTCDate(periodEnd.getUTCDate() + 6);
  }
  return { periodStart, periodEnd };
}

/** The instant a period is truly over - the start of the day after periodEnd, not periodEnd itself (which is midnight of the period's own last day). */
function periodDeadline(periodEnd: Date): Date {
  const deadline = new Date(periodEnd);
  deadline.setUTCDate(deadline.getUTCDate() + 1);
  return deadline;
}

function stepPeriod(type: PeriodType, referenceDate: Date, direction: 1 | -1): Date {
  const stepped = new Date(referenceDate);
  stepped.setUTCDate(stepped.getUTCDate() + direction * (type === "WEEKLY" ? 7 : 1));
  return stepped;
}

export interface ObligationSubmission {
  periodStart: Date;
  periodEnd: Date;
  amount: number;
  status: "PENDING" | "APPROVED" | "REJECTED" | "CANCELLED";
  paymentDate: Date;
}

export interface ObligationPeriod {
  periodStart: Date;
  periodEnd: Date;
  expectedAmount: number;
  approvedAmount: number;
  pendingAmount: number;
  isCurrent: boolean;
  isClosed: boolean;
  isPaid: boolean;
  isOverdue: boolean;
  /** null until the period is either paid or closed unpaid - there is nothing to judge "on time" against yet. */
  isOnTime: boolean | null;
}

export interface ObligationSummary {
  type: PeriodType;
  expectedAmount: number;
  dueNow: number;
  paidThisPeriod: number;
  pendingAmount: number;
  overdueAmount: number;
  nextDueDate: Date;
  /** null when the trailing window has no resolved period yet (a brand-new assignment). */
  onTimeRate: number | null;
  /** Oldest first. */
  periods: ObligationPeriod[];
}

/**
 * Pure - no DB access. Takes an obligation's schedule/expected amount and
 * the submissions already scoped to it (one vehicle's remittance, or one
 * Work & Pay contract's instalments), and derives everything a driver or
 * manager needs to see about it right now. Trailing window defaults to 6
 * periods (6 days for DAILY, 6 weeks for WEEKLY) - deliberately bounded, not
 * an unbounded historical scan.
 */
export function computeObligationSummary(
  type: PeriodType,
  expectedAmount: number,
  submissions: ObligationSubmission[],
  now: Date = new Date(),
  windowSize = 6,
): ObligationSummary {
  const periods: ObligationPeriod[] = [];
  let cursor = now;
  for (let i = 0; i < windowSize; i++) {
    const { periodStart, periodEnd } = periodBounds(type, cursor);
    const matches = submissions.filter(
      (s) => s.periodStart.getTime() === periodStart.getTime() && s.periodEnd.getTime() === periodEnd.getTime(),
    );
    const approved = matches.filter((s) => s.status === "APPROVED");
    const approvedAmount = approved.reduce((sum, s) => sum + s.amount, 0);
    const pendingAmount = matches.filter((s) => s.status === "PENDING").reduce((sum, s) => sum + s.amount, 0);
    const deadline = periodDeadline(periodEnd);
    const isClosed = now.getTime() >= deadline.getTime();
    const isPaid = approvedAmount >= expectedAmount && expectedAmount > 0;
    const isOverdue = isClosed && !isPaid;
    // Keyed on the driver's own paymentDate, never the manager's review timestamp -
    // a manager's approval lag must never count against the driver's on-time record.
    const earliestApprovedPaymentDate = approved.length > 0 ? Math.min(...approved.map((s) => s.paymentDate.getTime())) : null;
    const isOnTime = isPaid && earliestApprovedPaymentDate !== null
      ? earliestApprovedPaymentDate <= deadline.getTime()
      : isOverdue ? false : null;
    periods.unshift({ periodStart, periodEnd, expectedAmount, approvedAmount, pendingAmount, isCurrent: i === 0, isClosed, isPaid, isOverdue, isOnTime });
    cursor = stepPeriod(type, cursor, -1);
  }

  const current = periods[periods.length - 1];
  const dueNow = current.isPaid ? 0 : Math.max(expectedAmount - current.approvedAmount, 0);
  const overdueAmount = periods.filter((p) => p.isOverdue).reduce((sum, p) => sum + Math.max(p.expectedAmount - p.approvedAmount, 0), 0);
  const resolved = periods.filter((p) => p.isOnTime !== null);
  const onTimeRate = resolved.length > 0 ? resolved.filter((p) => p.isOnTime).length / resolved.length : null;
  const nextDueDate = current.isPaid ? periodBounds(type, stepPeriod(type, now, 1)).periodEnd : current.periodEnd;

  return {
    type,
    expectedAmount,
    dueNow,
    paidThisPeriod: current.approvedAmount,
    pendingAmount: current.pendingAmount,
    overdueAmount,
    nextDueDate,
    onTimeRate,
    periods,
  };
}

export interface VehicleObligation {
  vehicleId: string;
  plateNumber: string;
  summary: ObligationSummary | null;
}

export interface ContractObligation {
  contractId: string;
  vehicleId: string;
  contractName: string;
  summary: ObligationSummary | null;
}

export interface FleetDriverObligations {
  vehicles: VehicleObligation[];
  contracts: ContractObligation[];
  totals: {
    dueNow: number;
    paidThisPeriod: number;
    pendingAmount: number;
    overdueAmount: number;
    onTimeRate: number | null;
  };
}

/**
 * DB-facing wrapper. Fetches one bounded window of submission history (60
 * days comfortably covers 6 trailing weekly periods) and hands it to
 * computeObligationSummary per vehicle/contract, then aggregates a driver-
 * level total for the Overview KPI row. Deliberately queries fresh rather
 * than reusing getFleetDriverWorkspace's own paymentSubmissions list, since
 * that list is capped at the 20 most recent across every vehicle/contract
 * and isn't reliably enough history once a driver has more than one
 * obligation.
 */
export async function getFleetDriverObligations(
  organizationId: string,
  vehicles: {
    id: string;
    plateNumber: string;
    salesTargetPeriod: FleetSalesTargetPeriod | null;
    salesTargetAmount: { toNumber?: () => number } | number | null;
    workAndPayContracts: {
      id: string;
      contractName: string;
      paymentSchedule: FleetSalesTargetPeriod;
      scheduledPaymentAmount: { toNumber?: () => number } | number | null;
      weeklyPaymentAmount: { toNumber?: () => number } | number;
    }[];
  }[],
  now: Date = new Date(),
): Promise<FleetDriverObligations> {
  const toNumber = (value: { toNumber?: () => number } | number | null): number =>
    value === null ? 0 : typeof value === "number" ? value : value.toNumber ? value.toNumber() : Number(value);

  const vehicleIds = vehicles.map((v) => v.id);
  const contractIds = vehicles.flatMap((v) => v.workAndPayContracts.map((c) => c.id));
  const lookback = new Date(now);
  lookback.setUTCDate(lookback.getUTCDate() - 60);

  const submissions = vehicleIds.length === 0 && contractIds.length === 0
    ? []
    : await db.fleetDriverPaymentSubmission.findMany({
        where: {
          organizationId,
          periodStart: { gte: lookback },
          OR: [
            ...(vehicleIds.length ? [{ vehicleId: { in: vehicleIds }, contractId: null }] : []),
            ...(contractIds.length ? [{ contractId: { in: contractIds } }] : []),
          ],
        },
        select: { vehicleId: true, contractId: true, periodStart: true, periodEnd: true, amount: true, status: true, paymentDate: true },
      });

  const asObligationSubmission = (s: (typeof submissions)[number]): ObligationSubmission => ({
    periodStart: s.periodStart,
    periodEnd: s.periodEnd,
    amount: toNumber(s.amount),
    status: s.status,
    paymentDate: s.paymentDate,
  });

  const vehicleObligations: VehicleObligation[] = vehicles.map((vehicle) => {
    if (!vehicle.salesTargetPeriod || !vehicle.salesTargetAmount) {
      return { vehicleId: vehicle.id, plateNumber: vehicle.plateNumber, summary: null };
    }
    const relevant = submissions.filter((s) => s.vehicleId === vehicle.id && !s.contractId).map(asObligationSubmission);
    const summary = computeObligationSummary(vehicle.salesTargetPeriod, toNumber(vehicle.salesTargetAmount), relevant, now);
    return { vehicleId: vehicle.id, plateNumber: vehicle.plateNumber, summary };
  });

  const contractObligations: ContractObligation[] = vehicles.flatMap((vehicle) =>
    vehicle.workAndPayContracts.map((contract) => {
      const relevant = submissions.filter((s) => s.contractId === contract.id).map(asObligationSubmission);
      const expected = toNumber(contract.scheduledPaymentAmount ?? contract.weeklyPaymentAmount);
      const summary = computeObligationSummary(contract.paymentSchedule, expected, relevant, now);
      return { contractId: contract.id, vehicleId: vehicle.id, contractName: contract.contractName, summary };
    }),
  );

  const allSummaries = [...vehicleObligations.map((v) => v.summary), ...contractObligations.map((c) => c.summary)].filter(
    (s): s is ObligationSummary => s !== null,
  );
  const resolvedOnTime = allSummaries.filter((s) => s.onTimeRate !== null);

  return {
    vehicles: vehicleObligations,
    contracts: contractObligations,
    totals: {
      dueNow: allSummaries.reduce((sum, s) => sum + s.dueNow, 0),
      paidThisPeriod: allSummaries.reduce((sum, s) => sum + s.paidThisPeriod, 0),
      pendingAmount: allSummaries.reduce((sum, s) => sum + s.pendingAmount, 0),
      overdueAmount: allSummaries.reduce((sum, s) => sum + s.overdueAmount, 0),
      onTimeRate: resolvedOnTime.length > 0 ? resolvedOnTime.reduce((sum, s) => sum + (s.onTimeRate ?? 0), 0) / resolvedOnTime.length : null,
    },
  };
}
