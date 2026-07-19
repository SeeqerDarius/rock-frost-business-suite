import "server-only";

import { db } from "@/lib/db";
import type {
  FleetMetric,
  VehicleRecord,
  OwnerRecord,
  DriverRecord,
  PolicyRecord,
  MaintenanceRecord,
  WorkPayRecord,
  PaymentRecord,
  PerformanceRecord,
} from "./types";

type Moneyish = number | { toNumber(): number } | null | undefined;

function formatMoney(value: Moneyish): string {
  const n = value == null ? 0 : typeof value === "number" ? value : value.toNumber();
  if (Math.abs(n) >= 1_000_000) return `GHS ${(n / 1_000_000).toFixed(1)}M`;
  if (Math.abs(n) >= 1_000) return `GHS ${(n / 1_000).toFixed(1)}k`;
  return `GHS ${n.toLocaleString("en-US")}`;
}

function formatDate(date: Date | null | undefined): string {
  return date ? date.toISOString().slice(0, 10) : "—";
}

function jsonToText(value: unknown, fallback: string): string {
  return typeof value === "string" && value.length > 0 ? value : fallback;
}

/** Owner.history is seeded as { summary, revenueLabel } but may also be a plain string or absent. */
function ownerHistorySummary(value: unknown): string {
  if (typeof value === "string" && value.length > 0) return value;
  if (value && typeof value === "object" && "summary" in value && typeof (value as any).summary === "string") {
    return (value as any).summary;
  }
  return "New partner";
}

function ownerHistoryRevenue(value: unknown): string | null {
  if (value && typeof value === "object" && "revenueLabel" in value && typeof (value as any).revenueLabel === "string") {
    return (value as any).revenueLabel;
  }
  return null;
}

/** Driver.performanceMetrics is seeded as { onTimeRate, completedTrips } but may also be a plain string or absent. */
function driverPerformanceSummary(value: unknown): string {
  if (typeof value === "string" && value.length > 0) return value;
  if (value && typeof value === "object" && "onTimeRate" in value && typeof (value as any).onTimeRate === "string") {
    const trips = "completedTrips" in value ? (value as any).completedTrips : undefined;
    return trips != null ? `${(value as any).onTimeRate} on-time (${trips} trips)` : `${(value as any).onTimeRate} on-time`;
  }
  return "No data yet";
}

const VEHICLE_STATUS_LABEL: Record<string, string> = {
  AVAILABLE: "Active",
  ASSIGNED: "Active",
  MAINTENANCE: "Maintenance",
  INACTIVE: "Inactive",
  RETIRED: "Retired",
};

const DOCUMENT_STATUS_LABEL: Record<string, string> = {
  VALID: "Verified",
  EXPIRING_SOON: "Due review",
  EXPIRED: "Expired",
  MISSING: "Missing",
};

const DRIVER_STATUS_LABEL: Record<string, string> = {
  ACTIVE: "Active",
  INACTIVE: "On leave",
  SUSPENDED: "Suspended",
};

const MAINTENANCE_PROGRESS_LABEL: Record<string, string> = {
  REPORTED: "Reported",
  REVIEWING: "In review",
  APPROVED: "Approved",
  IN_PROGRESS: "Assigned",
  COMPLETED: "Completed",
  CANCELLED: "Cancelled",
};

const PAYMENT_STATUS_LABEL: Record<string, string> = {
  PENDING: "Pending",
  VERIFIED: "Verified",
  REJECTED: "Rejected",
  CANCELLED: "Cancelled",
};

const PAYMENT_TYPE_LABEL: Record<string, string> = {
  OWNER_PAYOUT: "Owner payout",
  DRIVER_PAYMENT: "Driver payment",
  MAINTENANCE: "Maintenance",
  WORK_AND_PAY: "Work & Pay",
  OTHER: "Reconciliation",
};

const CONTRACT_STATUS_LABEL: Record<string, string> = {
  DRAFT: "Draft",
  ACTIVE: "Active",
  PAUSED: "Paused",
  COMPLETED: "Completed",
  DEFAULTED: "Defaulted",
  CANCELLED: "Cancelled",
};

const RENEWAL_STATUS_LABEL: Record<string, string> = { READY: "Ready", DUE: "Due", CLEAR: "Clear" };

export async function getDashboardMetrics(organizationId: string): Promise<FleetMetric[]> {
  const in30Days = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  const in7Days = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const in30DaysBack = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const [
    totalVehicles,
    activeDrivers,
    vehicleOwners,
    underMaintenance,
    weeklyRevenueAgg,
    monthlyRevenueAgg,
    outstandingAgg,
    expiringInsurance,
    expiringRoadworthy,
  ] = await Promise.all([
    db.fleetVehicle.count({ where: { organizationId } }),
    db.fleetDriver.count({ where: { organizationId, status: "ACTIVE" } }),
    db.fleetOwner.count({ where: { organizationId } }),
    db.fleetVehicle.count({ where: { organizationId, status: "MAINTENANCE" } }),
    db.fleetPayment.aggregate({ where: { organizationId, date: { gte: in7Days } }, _sum: { amount: true } }),
    db.fleetPayment.aggregate({ where: { organizationId, date: { gte: in30DaysBack } }, _sum: { amount: true } }),
    db.fleetWorkAndPayContract.aggregate({ where: { organizationId }, _sum: { outstandingBalance: true } }),
    db.fleetVehicleDocument.count({ where: { organizationId, insuranceExpiresAt: { lte: in30Days } } }),
    db.fleetVehicleDocument.count({ where: { organizationId, roadworthyExpiresAt: { lte: in30Days } } }),
  ]);

  return [
    { label: "Total vehicles", value: String(totalVehicles), note: "Fleet-ready for multi-company use.", icon: "🚛" },
    { label: "Active drivers", value: String(activeDrivers), note: "Assigned across current contracts.", icon: "🧑‍✈️" },
    { label: "Vehicle owners", value: String(vehicleOwners), note: "Partner organizations and asset holders.", icon: "👥" },
    { label: "Under maintenance", value: String(underMaintenance), note: "Vehicles currently in service.", icon: "🔧" },
    { label: "Weekly revenue", value: formatMoney(weeklyRevenueAgg._sum.amount), note: "Work-and-pay and logistics earnings.", icon: "💰" },
    { label: "Monthly revenue", value: formatMoney(monthlyRevenueAgg._sum.amount), note: "Enterprise fleet income projection.", icon: "📈" },
    { label: "Outstanding balances", value: formatMoney(outstandingAgg._sum.outstandingBalance), note: "Pending settlement across contracts.", icon: "⚖️" },
    { label: "Expiring insurance", value: `${expiringInsurance} vehicles`, note: "Renewal alerts in the next 30 days.", icon: "🛡️" },
    { label: "Expiring roadworthy", value: `${expiringRoadworthy} vehicles`, note: "Certificates due this month.", icon: "📜" },
  ];
}

export async function getVehicles(organizationId: string): Promise<VehicleRecord[]> {
  const vehicles = await db.fleetVehicle.findMany({
    where: { organizationId },
    include: { owner: true, assignedDriver: true },
    orderBy: { createdAt: "asc" },
  });

  return vehicles.map((v) => ({
    id: v.assetTag,
    plate: v.plateNumber,
    type: v.type ?? "—",
    owner: v.owner?.name ?? "Unassigned",
    driver: v.assignedDriver?.name ?? "Unassigned",
    status: VEHICLE_STATUS_LABEL[v.status] ?? v.status,
    documentStatus: DOCUMENT_STATUS_LABEL[v.documentStatus] ?? v.documentStatus,
    serviceHistory: jsonToText(v.serviceNotes, "No service history recorded"),
    nextService: formatDate(v.nextServiceDueAt),
    mileage: v.mileage != null ? `${v.mileage.toLocaleString("en-US")} km` : "—",
    location: v.location ?? "—",
  }));
}

export async function getOwners(organizationId: string): Promise<OwnerRecord[]> {
  const owners = await db.fleetOwner.findMany({
    where: { organizationId },
    include: { vehicles: true },
    orderBy: { createdAt: "asc" },
  });

  const payoutSums = await db.fleetPayment.groupBy({
    by: ["relatedEntityId"],
    where: { organizationId, relatedEntity: "FleetOwner", relatedEntityId: { in: owners.map((o) => o.id) } },
    _sum: { amount: true },
  });
  const payoutByOwner = new Map(payoutSums.map((p) => [p.relatedEntityId, p._sum.amount]));

  return owners.map((o) => ({
    id: o.id,
    name: o.name,
    business: o.businessName ?? "—",
    phone: o.phone ?? "—",
    email: o.email ?? "—",
    vehicles: o.vehicles.length,
    revenue: ownerHistoryRevenue(o.history) ?? formatMoney(payoutByOwner.get(o.id) ?? 0),
    history: ownerHistorySummary(o.history),
  }));
}

export async function getDrivers(organizationId: string): Promise<DriverRecord[]> {
  const drivers = await db.fleetDriver.findMany({
    where: { organizationId },
    include: { assignedVehicles: true },
    orderBy: { createdAt: "asc" },
  });

  return drivers.map((d) => ({
    id: d.id,
    name: d.name,
    licence: d.licenceNumber ?? "—",
    phone: d.phone ?? "—",
    email: d.email ?? "—",
    assignedVehicle: d.assignedVehicles[0]?.assetTag ?? "Unassigned",
    startDate: formatDate(d.employmentStartDate),
    status: DRIVER_STATUS_LABEL[d.status] ?? d.status,
    performance: driverPerformanceSummary(d.performanceMetrics),
  }));
}

export async function getVehicleDocuments(organizationId: string): Promise<PolicyRecord[]> {
  const docs = await db.fleetVehicleDocument.findMany({
    where: { organizationId },
    include: { vehicle: true },
    orderBy: { createdAt: "asc" },
  });

  return docs.map((doc) => ({
    id: doc.id,
    vehicle: doc.vehicle.assetTag,
    provider: doc.provider,
    policyNumber: doc.policyNumber,
    insuranceExpires: formatDate(doc.insuranceExpiresAt),
    roadworthyExpires: formatDate(doc.roadworthyExpiresAt),
    renewalStatus: RENEWAL_STATUS_LABEL[doc.renewalStatus] ?? doc.renewalStatus,
    alerts: doc.alerts ?? "No active alerts",
  }));
}

export async function getMaintenanceRequests(organizationId: string): Promise<MaintenanceRecord[]> {
  const requests = await db.fleetMaintenanceRequest.findMany({
    where: { organizationId },
    include: { vehicle: true, requestedBy: true },
    orderBy: { requestedAt: "desc" },
  });

  return requests.map((r) => ({
    id: r.id,
    vehicle: r.vehicle.assetTag,
    requestedBy: r.requestedBy?.name ?? "Fleet system",
    fault: r.faultDescription,
    status: MAINTENANCE_PROGRESS_LABEL[r.progressStatus] ?? r.progressStatus,
    timeline: r.completedAt ? "Verified" : r.mechanicAssigned ? "Mechanic en route" : "Approval pending",
    mechanic: r.mechanicAssigned ?? "Unassigned",
    cost: formatMoney(r.repairCost),
    requestDate: formatDate(r.requestedAt),
  }));
}

export async function getWorkAndPayContracts(organizationId: string): Promise<WorkPayRecord[]> {
  const contracts = await db.fleetWorkAndPayContract.findMany({
    where: { organizationId },
    include: { vehicle: true },
    orderBy: { createdAt: "asc" },
  });

  return contracts.map((c) => ({
    id: c.id,
    contractName: c.contractName,
    vehicle: c.vehicle.assetTag,
    client: c.clientName,
    contractAmount: formatMoney(c.contractAmount),
    deposit: formatMoney(c.depositAmount),
    weeklyPayment: formatMoney(c.weeklyPaymentAmount),
    paid: formatMoney(c.amountPaid),
    outstanding: formatMoney(c.outstandingBalance),
    remaining: c.remainingDurationWeeks != null ? `${c.remainingDurationWeeks} weeks` : "—",
    completion: `${Number(c.completionPercentage)}%`,
    status: CONTRACT_STATUS_LABEL[c.contractStatus] ?? c.contractStatus,
  }));
}

export async function getPayments(organizationId: string): Promise<PaymentRecord[]> {
  const payments = await db.fleetPayment.findMany({
    where: { organizationId },
    orderBy: { date: "desc" },
    take: 20,
  });

  return payments.map((p) => ({
    id: p.id,
    date: formatDate(p.date),
    type: PAYMENT_TYPE_LABEL[p.type] ?? p.type,
    reference: p.reference,
    amount: formatMoney(p.amount),
    status: PAYMENT_STATUS_LABEL[p.status] ?? p.status,
    related: p.relatedEntity ?? "—",
    verified: p.verified,
  }));
}

export async function getReportSummary(organizationId: string): Promise<PerformanceRecord[]> {
  const [revenueAgg, totalDrivers, activeDrivers, maintenanceCostAgg, dueDocs] = await Promise.all([
    db.fleetPayment.aggregate({ where: { organizationId }, _sum: { amount: true } }),
    db.fleetDriver.count({ where: { organizationId } }),
    db.fleetDriver.count({ where: { organizationId, status: "ACTIVE" } }),
    db.fleetMaintenanceRequest.aggregate({ where: { organizationId }, _sum: { repairCost: true } }),
    db.fleetVehicleDocument.count({ where: { organizationId, renewalStatus: "DUE" } }),
  ]);
  const utilization = totalDrivers > 0 ? Math.round((activeDrivers / totalDrivers) * 100) : 0;

  return [
    { name: "Fleet revenue", value: formatMoney(revenueAgg._sum.amount), delta: "Live", note: "Total recorded payments" },
    { name: "Driver utilization", value: `${utilization}%`, delta: "Live", note: "Active drivers of total roster" },
    { name: "Maintenance cost", value: formatMoney(maintenanceCostAgg._sum.repairCost), delta: "Live", note: "Total repair costs recorded" },
    {
      name: "Insurance risk",
      value: dueDocs > 0 ? "Attention needed" : "Low",
      delta: "Live",
      note: dueDocs > 0 ? `${dueDocs} renewal(s) due` : "Renewals on schedule",
    },
  ];
}

export async function getInvestorSummary(organizationId: string): Promise<PerformanceRecord[]> {
  const [outstandingAgg, vehicleCount, activeContracts, revenueAgg] = await Promise.all([
    db.fleetWorkAndPayContract.aggregate({ where: { organizationId }, _sum: { outstandingBalance: true } }),
    db.fleetVehicle.count({ where: { organizationId } }),
    db.fleetWorkAndPayContract.count({ where: { organizationId, contractStatus: "ACTIVE" } }),
    db.fleetPayment.aggregate({ where: { organizationId }, _sum: { amount: true } }),
  ]);

  return [
    { name: "Outstanding receivables", value: formatMoney(outstandingAgg._sum.outstandingBalance), delta: "Live", note: "Pending contract balances" },
    { name: "Fleet size", value: String(vehicleCount), delta: "Live", note: "Vehicles under management" },
    { name: "Active contracts", value: String(activeContracts), delta: "Live", note: "Work & Pay contracts in progress" },
    { name: "Recorded revenue", value: formatMoney(revenueAgg._sum.amount), delta: "Live", note: "All recorded payments to date" },
  ];
}
