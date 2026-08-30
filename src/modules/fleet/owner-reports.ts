import "server-only";

import type { ReportExportInput } from "@/lib/reports/export";
import { formatMoney } from "@/lib/currency";
import type { getFleetOwnerWorkspace } from "@/modules/fleet/owner-workspace";

type OwnerWorkspace = NonNullable<Awaited<ReturnType<typeof getFleetOwnerWorkspace>>>;

export interface OwnerReportLedgerLine {
  date: Date;
  vehiclePlate: string;
  kind: "COLLECTION" | "EXPENSE";
  description: string;
  amount: number;
}

export interface OwnerReportVehiclePerformance {
  plateNumber: string;
  verifiedCollections: number;
  verifiedExpenses: number;
  operatingPosition: number;
  openMaintenanceCount: number;
}

export interface OwnerReport {
  owner: { id: string; name: string; businessName: string | null };
  generatedAt: Date;
  totals: { verifiedCollections: number; verifiedExpenses: number; operatingPosition: number; vehicleCount: number };
  ledger: OwnerReportLedgerLine[];
  vehiclePerformance: OwnerReportVehiclePerformance[];
  settlementConfigured: false;
}

/**
 * Shapes the same owner-workspace read every other owner page already uses
 * (scoped by construction to (organizationId, userId) — see
 * getFleetOwnerWorkspace) into report-ready sections. Never queries the
 * database itself, so it can't accidentally widen that scope: every figure
 * here traces back to a workspace the caller was already handed.
 */
export function buildFleetOwnerReport(workspace: OwnerWorkspace): OwnerReport {
  const collections: OwnerReportLedgerLine[] = workspace.vehicles.flatMap((vehicle) =>
    vehicle.payments.map((payment) => ({
      date: payment.date,
      vehiclePlate: vehicle.plateNumber,
      kind: "COLLECTION" as const,
      description: payment.relatedEntity === "FleetWorkAndPayContract" ? "Work & Pay remittance" : "Vehicle remittance",
      amount: Number(payment.amount),
    })),
  );

  const expenses: OwnerReportLedgerLine[] = workspace.vehicles.flatMap((vehicle) =>
    vehicle.maintenanceRequests
      .filter((request) => request.completionVerified && request.repairCost)
      .map((request) => ({
        date: request.completedAt ?? request.requestedAt,
        vehiclePlate: vehicle.plateNumber,
        kind: "EXPENSE" as const,
        description: request.faultDescription,
        amount: Number(request.repairCost),
      })),
  );

  const ledger = [...collections, ...expenses].sort((a, b) => b.date.getTime() - a.date.getTime());

  const vehiclePerformance: OwnerReportVehiclePerformance[] = workspace.vehicles.map((vehicle) => ({
    plateNumber: vehicle.plateNumber,
    verifiedCollections: vehicle.verifiedCollections,
    verifiedExpenses: vehicle.verifiedExpenses,
    operatingPosition: vehicle.operatingPosition,
    openMaintenanceCount: vehicle.openMaintenanceCount,
  }));

  return {
    owner: workspace.owner,
    generatedAt: new Date(),
    totals: {
      verifiedCollections: workspace.totals.verifiedCollections,
      verifiedExpenses: workspace.totals.verifiedExpenses,
      operatingPosition: workspace.totals.operatingPosition,
      vehicleCount: workspace.totals.vehicleCount,
    },
    ledger,
    vehiclePerformance,
    settlementConfigured: false,
  };
}

/**
 * A single consolidated statement (collections and verified expenses in one
 * chronological ledger) — src/lib/reports/export.ts's builders take one
 * table per document, so the richer multi-section breakdown the Reports tab
 * shows on-screen collapses to this one exportable ledger plus a summary
 * block, same shape every other module's report export already uses.
 */
export function buildFleetOwnerReportExportInput(report: OwnerReport, currency: string, organizationName: string): ReportExportInput {
  return {
    title: "Vehicle Owner Statement",
    subtitle: `${organizationName} - ${report.owner.name}`,
    generatedAt: report.generatedAt,
    summary: [
      { label: "Vehicles", value: report.totals.vehicleCount.toString() },
      { label: "Verified collections", value: formatMoney(report.totals.verifiedCollections, currency) },
      { label: "Verified expenses", value: formatMoney(report.totals.verifiedExpenses, currency) },
      { label: "Operating position", value: formatMoney(report.totals.operatingPosition, currency) },
      { label: "Settlement", value: "Not configured - no approved owner agreement defines revenue share or fees" },
    ],
    columns: [
      { key: "date", header: "Date", width: 1 },
      { key: "vehiclePlate", header: "Vehicle", width: 1 },
      { key: "kind", header: "Type", width: 1, format: (value) => (value === "COLLECTION" ? "Collection" : "Expense") },
      { key: "description", header: "Description", width: 2 },
      { key: "amount", header: "Amount", width: 1, align: "right", format: (value) => formatMoney(Number(value), currency) },
    ],
    rows: report.ledger as unknown as Record<string, unknown>[],
  };
}
