import "server-only";

import { db } from "@/lib/db";
import type {
  FleetContractStatus,
  FleetDriverStatus,
  FleetMaintenanceApprovalStatus,
  FleetMaintenanceProgressStatus,
  FleetPaymentStatus,
  FleetPaymentType,
  FleetVehicleStatus,
} from "@prisma/client";

/**
 * Every function here takes organizationId explicitly and filters on it —
 * per docs/MODULE_BOUNDARIES.md, a module's service layer must never rely on
 * the UI alone to keep one organization's data from another's.
 */

// --- Owners ---

export function listFleetOwners(organizationId: string) {
  return db.fleetOwner.findMany({ where: { organizationId }, orderBy: { name: "asc" } });
}

export function createFleetOwner(
  organizationId: string,
  data: { name: string; businessName?: string | null; phone?: string | null; email?: string | null; branchId?: string | null }
) {
  return db.fleetOwner.create({ data: { organizationId, ...data } });
}

export function updateFleetOwner(
  organizationId: string,
  id: string,
  data: { name: string; businessName?: string | null; phone?: string | null; email?: string | null; branchId?: string | null }
) {
  return db.fleetOwner.update({ where: { id, organizationId }, data });
}

// --- Drivers ---

export function listFleetDrivers(organizationId: string) {
  return db.fleetDriver.findMany({ where: { organizationId }, orderBy: { name: "asc" } });
}

export function createFleetDriver(
  organizationId: string,
  data: {
    name: string;
    licenceNumber?: string | null;
    licenceExpiry?: Date | null;
    phone?: string | null;
    email?: string | null;
    status?: FleetDriverStatus;
    employmentStartDate?: Date | null;
    branchId?: string | null;
  }
) {
  return db.fleetDriver.create({ data: { organizationId, ...data } });
}

export function updateFleetDriver(
  organizationId: string,
  id: string,
  data: {
    name: string;
    licenceNumber?: string | null;
    licenceExpiry?: Date | null;
    phone?: string | null;
    email?: string | null;
    status?: FleetDriverStatus;
    employmentStartDate?: Date | null;
    branchId?: string | null;
  }
) {
  return db.fleetDriver.update({ where: { id, organizationId }, data });
}

// --- Vehicles ---

export function listFleetVehicles(organizationId: string) {
  return db.fleetVehicle.findMany({
    where: { organizationId },
    include: { owner: true, assignedDriver: true },
    orderBy: { createdAt: "desc" },
  });
}

export function getFleetVehicle(organizationId: string, id: string) {
  return db.fleetVehicle.findFirst({ where: { id, organizationId }, include: { owner: true, assignedDriver: true } });
}

export function createFleetVehicle(
  organizationId: string,
  data: {
    assetTag: string;
    plateNumber: string;
    type?: string | null;
    make?: string | null;
    model?: string | null;
    year?: number | null;
    ownerId?: string | null;
    assignedDriverId?: string | null;
    status?: FleetVehicleStatus;
    mileage?: number | null;
    location?: string | null;
    branchId?: string | null;
  }
) {
  return db.fleetVehicle.create({ data: { organizationId, ...data } });
}

export function updateFleetVehicle(
  organizationId: string,
  id: string,
  data: {
    assetTag: string;
    plateNumber: string;
    type?: string | null;
    make?: string | null;
    model?: string | null;
    year?: number | null;
    ownerId?: string | null;
    assignedDriverId?: string | null;
    status?: FleetVehicleStatus;
    mileage?: number | null;
    location?: string | null;
    branchId?: string | null;
  }
) {
  return db.fleetVehicle.update({ where: { id, organizationId }, data });
}

// --- Vehicle documents (insurance & roadworthy) ---

export function listFleetVehicleDocuments(organizationId: string) {
  return db.fleetVehicleDocument.findMany({
    where: { organizationId },
    include: { vehicle: true },
    orderBy: { insuranceExpiresAt: "asc" },
  });
}

export function createFleetVehicleDocument(
  organizationId: string,
  data: {
    vehicleId: string;
    provider: string;
    policyNumber: string;
    insuranceExpiresAt: Date;
    roadworthyExpiresAt: Date;
    alerts?: string | null;
    branchId?: string | null;
  }
) {
  return db.fleetVehicleDocument.create({ data: { organizationId, ...data, renewalStatus: computeRenewalStatus(data) } });
}

export function updateFleetVehicleDocument(
  organizationId: string,
  id: string,
  data: {
    vehicleId: string;
    provider: string;
    policyNumber: string;
    insuranceExpiresAt: Date;
    roadworthyExpiresAt: Date;
    alerts?: string | null;
    branchId?: string | null;
  }
) {
  return db.fleetVehicleDocument.update({
    where: { id, organizationId },
    data: { ...data, renewalStatus: computeRenewalStatus(data) },
  });
}

function computeRenewalStatus(data: { insuranceExpiresAt: Date; roadworthyExpiresAt: Date }) {
  const soonest = data.insuranceExpiresAt < data.roadworthyExpiresAt ? data.insuranceExpiresAt : data.roadworthyExpiresAt;
  const daysUntil = (soonest.getTime() - Date.now()) / (1000 * 60 * 60 * 24);
  if (daysUntil < 0) return "DUE" as const;
  if (daysUntil <= 30) return "READY" as const;
  return "CLEAR" as const;
}

// --- Maintenance requests ---

export function listFleetMaintenanceRequests(organizationId: string) {
  return db.fleetMaintenanceRequest.findMany({
    where: { organizationId },
    include: { vehicle: true, requestedBy: true },
    orderBy: { requestedAt: "desc" },
  });
}

export function createFleetMaintenanceRequest(
  organizationId: string,
  data: { vehicleId: string; faultDescription: string; requestedById?: string | null; branchId?: string | null }
) {
  return db.fleetMaintenanceRequest.create({ data: { organizationId, ...data } });
}

export function updateFleetMaintenanceRequest(
  organizationId: string,
  id: string,
  data: {
    approvalStatus?: FleetMaintenanceApprovalStatus;
    fleetManagerReview?: string | null;
    ownerApprovalStatus?: FleetMaintenanceApprovalStatus;
    mechanicAssigned?: string | null;
    progressStatus?: FleetMaintenanceProgressStatus;
    repairCost?: string | null;
    completionVerified?: boolean;
    completedAt?: Date | null;
  }
) {
  return db.fleetMaintenanceRequest.update({ where: { id, organizationId }, data });
}

// --- Payments ---

export function listFleetPayments(organizationId: string) {
  return db.fleetPayment.findMany({ where: { organizationId }, orderBy: { date: "desc" } });
}

export function createFleetPayment(
  organizationId: string,
  data: {
    reference: string;
    date: Date;
    type: FleetPaymentType;
    amount: string;
    relatedEntity?: string | null;
    relatedEntityId?: string | null;
    branchId?: string | null;
  }
) {
  return db.fleetPayment.create({ data: { organizationId, ...data } });
}

export function updateFleetPaymentStatus(organizationId: string, id: string, status: FleetPaymentStatus, verified: boolean) {
  return db.fleetPayment.update({ where: { id, organizationId }, data: { status, verified } });
}

// --- Work & Pay contracts ---

export function listFleetWorkAndPayContracts(organizationId: string) {
  return db.fleetWorkAndPayContract.findMany({
    where: { organizationId },
    include: { vehicle: true },
    orderBy: { createdAt: "desc" },
  });
}

export function createFleetWorkAndPayContract(
  organizationId: string,
  data: {
    contractName: string;
    vehicleId: string;
    clientName: string;
    contractAmount: string;
    depositAmount: string;
    weeklyPaymentAmount: string;
    remainingDurationWeeks?: number | null;
    startsAt?: Date | null;
    branchId?: string | null;
  }
) {
  return db.fleetWorkAndPayContract.create({
    data: { organizationId, ...data, contractStatus: "ACTIVE" },
  });
}

export async function recordFleetWorkAndPayPayment(organizationId: string, id: string, amount: number) {
  const contract = await db.fleetWorkAndPayContract.findFirst({ where: { id, organizationId } });
  if (!contract) return null;

  const amountPaid = Number(contract.amountPaid) + amount;
  const contractAmount = Number(contract.contractAmount);
  const outstandingBalance = Math.max(contractAmount - amountPaid, 0);
  const completionPercentage = contractAmount > 0 ? Math.min((amountPaid / contractAmount) * 100, 100) : 0;
  const contractStatus: FleetContractStatus = outstandingBalance <= 0 ? "COMPLETED" : contract.contractStatus;

  return db.fleetWorkAndPayContract.update({
    where: { id, organizationId },
    data: {
      amountPaid: amountPaid.toFixed(2),
      outstandingBalance: outstandingBalance.toFixed(2),
      completionPercentage: completionPercentage.toFixed(2),
      contractStatus,
    },
  });
}

export function updateFleetWorkAndPayContractStatus(organizationId: string, id: string, contractStatus: FleetContractStatus) {
  return db.fleetWorkAndPayContract.update({ where: { id, organizationId }, data: { contractStatus } });
}

// --- Aggregates (Reports, dashboard widget) ---

export async function getFleetSummary(organizationId: string) {
  const [vehicleCount, vehiclesByStatus, activeDriverCount, pendingMaintenanceCount, activeContractCount, paymentsThisMonth] =
    await Promise.all([
      db.fleetVehicle.count({ where: { organizationId } }),
      db.fleetVehicle.groupBy({ by: ["status"], where: { organizationId }, _count: true }),
      db.fleetDriver.count({ where: { organizationId, status: "ACTIVE" } }),
      db.fleetMaintenanceRequest.count({ where: { organizationId, progressStatus: { in: ["REPORTED", "REVIEWING", "IN_PROGRESS"] } } }),
      db.fleetWorkAndPayContract.count({ where: { organizationId, contractStatus: "ACTIVE" } }),
      db.fleetPayment.aggregate({
        where: { organizationId, date: { gte: new Date(new Date().getFullYear(), new Date().getMonth(), 1) } },
        _sum: { amount: true },
      }),
    ]);

  return {
    vehicleCount,
    vehiclesByStatus,
    activeDriverCount,
    pendingMaintenanceCount,
    activeContractCount,
    paymentsThisMonthTotal: Number(paymentsThisMonth._sum.amount ?? 0),
  };
}
