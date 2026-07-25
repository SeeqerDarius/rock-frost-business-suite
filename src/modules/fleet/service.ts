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
import { Prisma } from "@prisma/client";

/**
 * Every function here takes organizationId explicitly and filters on it —
 * per docs/MODULE_BOUNDARIES.md, a module's service layer must never rely on
 * the UI alone to keep one organization's data from another's.
 */

export class NotFoundError extends Error {}

async function requireVehicle(organizationId: string, vehicleId: string) {
  const vehicle = await db.fleetVehicle.findFirst({ where: { id: vehicleId, organizationId } });
  if (!vehicle) throw new NotFoundError("Vehicle not found.");
}

export async function canUserReportFleetVehicle(organizationId: string, vehicleId: string, userId: string) {
  const vehicle = await db.fleetVehicle.findFirst({
    where: {
      id: vehicleId,
      organizationId,
      OR: [
        { assignedDriver: { userId } },
        { owner: { userId } },
      ],
    },
    select: { id: true },
  });
  return Boolean(vehicle);
}

// --- Owners ---

export function listFleetOwners(organizationId: string) {
  return db.fleetOwner.findMany({ where: { organizationId }, orderBy: { name: "asc" } });
}

export function createFleetOwner(
  organizationId: string,
  data: { name: string; businessName?: string | null; phone?: string | null; email?: string | null; branchId?: string | null; userId?: string | null }
) {
  return db.fleetOwner.create({ data: { organizationId, ...data } });
}

export function updateFleetOwner(
  organizationId: string,
  id: string,
  data: { name: string; businessName?: string | null; phone?: string | null; email?: string | null; branchId?: string | null; userId?: string | null }
) {
  return db.fleetOwner.update({ where: { id, organizationId }, data });
}

export async function listAssignableFleetUsers(organizationId: string) {
  const memberships = await db.organizationMember.findMany({
    where: { organizationId, status: "ACTIVE", user: { status: "ACTIVE" } },
    select: { user: { select: { id: true, name: true, email: true } } },
    orderBy: { user: { name: "asc" } },
  });
  return memberships.map(({ user }) => user);
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

async function validateVehicleRefs(organizationId: string, data: { ownerId?: string | null; assignedDriverId?: string | null }) {
  if (data.ownerId) {
    const owner = await db.fleetOwner.findFirst({ where: { id: data.ownerId, organizationId } });
    if (!owner) throw new NotFoundError("Owner not found.");
  }
  if (data.assignedDriverId) {
    const driver = await db.fleetDriver.findFirst({ where: { id: data.assignedDriverId, organizationId } });
    if (!driver) throw new NotFoundError("Driver not found.");
  }
}

export async function createFleetVehicle(
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
  await validateVehicleRefs(organizationId, data);
  return db.fleetVehicle.create({ data: { organizationId, ...data } });
}

export async function updateFleetVehicle(
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
  await validateVehicleRefs(organizationId, data);
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

export async function createFleetVehicleDocument(
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
  await requireVehicle(organizationId, data.vehicleId);
  return db.fleetVehicleDocument.create({ data: { organizationId, ...data, renewalStatus: computeRenewalStatus(data) } });
}

export async function updateFleetVehicleDocument(
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
  await requireVehicle(organizationId, data.vehicleId);
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
    include: {
      vehicle: { include: { owner: true, assignedDriver: true } },
      requestedBy: true,
      events: { include: { actor: true }, orderBy: { createdAt: "asc" } },
    },
    orderBy: { requestedAt: "desc" },
  });
}

export async function createFleetMaintenanceRequest(
  organizationId: string,
  data: {
    vehicleId: string;
    faultDescription: string;
    requestedById?: string | null;
    branchId?: string | null;
    ownerApprovalRequired?: boolean;
  }
) {
  await requireVehicle(organizationId, data.vehicleId);
  return db.$transaction(async (tx) => {
    const request = await tx.fleetMaintenanceRequest.create({ data: { organizationId, ...data } });
    await tx.fleetMaintenanceEvent.create({
      data: {
        organizationId,
        requestId: request.id,
        actorId: data.requestedById,
        eventType: "SUBMITTED",
        toStatus: "REPORTED",
        note: data.faultDescription,
      },
    });
    return request;
  });
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

export class InvalidMaintenanceTransitionError extends Error {}
export class MaintenanceApprovalRequiredError extends Error {}

export async function managerReviewMaintenanceRequest(
  organizationId: string,
  id: string,
  actorId: string,
  data: {
    approved: boolean;
    ownerApprovalRequired: boolean;
    fleetManagerReview?: string | null;
  },
) {
  return db.$transaction(async (tx) => {
    const request = await tx.fleetMaintenanceRequest.findFirst({ where: { id, organizationId } });
    if (!request) throw new NotFoundError("Maintenance request not found.");
    if (!["REPORTED", "REVIEWING"].includes(request.progressStatus)) {
      throw new InvalidMaintenanceTransitionError("Only newly reported requests can be reviewed.");
    }
    const approvalStatus: FleetMaintenanceApprovalStatus = data.approved ? "APPROVED" : "REJECTED";
    const progressStatus: FleetMaintenanceProgressStatus = data.approved
      ? data.ownerApprovalRequired ? "REVIEWING" : "APPROVED"
      : "CANCELLED";
    await tx.fleetMaintenanceRequest.update({
      where: { id },
      data: {
        approvalStatus,
        ownerApprovalRequired: data.ownerApprovalRequired,
        ownerApprovalStatus: data.ownerApprovalRequired ? "PENDING" : approvalStatus,
        fleetManagerReview: data.fleetManagerReview,
        progressStatus,
      },
    });
    await tx.fleetMaintenanceEvent.create({
      data: {
        organizationId, requestId: id, actorId, eventType: data.approved ? "MANAGER_REVIEWED" : "CANCELLED",
        fromStatus: request.progressStatus, toStatus: progressStatus, note: data.fleetManagerReview,
        metadata: { approvalStatus, ownerApprovalRequired: data.ownerApprovalRequired },
      },
    });
  });
}

export async function ownerDecisionMaintenanceRequest(
  organizationId: string,
  id: string,
  actorId: string,
  approved: boolean,
  note?: string | null,
) {
  return db.$transaction(async (tx) => {
    const request = await tx.fleetMaintenanceRequest.findFirst({
      where: { id, organizationId },
      include: { vehicle: { include: { owner: true } } },
    });
    if (!request) throw new NotFoundError("Maintenance request not found.");
    if (!request.ownerApprovalRequired || request.approvalStatus !== "APPROVED" || request.ownerApprovalStatus !== "PENDING") {
      throw new InvalidMaintenanceTransitionError("This request is not awaiting owner approval.");
    }
    if (request.vehicle.owner?.userId !== actorId) throw new NotFoundError("Maintenance request not found.");
    const progressStatus: FleetMaintenanceProgressStatus = approved ? "APPROVED" : "CANCELLED";
    await tx.fleetMaintenanceRequest.update({
      where: { id },
      data: { ownerApprovalStatus: approved ? "APPROVED" : "REJECTED", progressStatus },
    });
    await tx.fleetMaintenanceEvent.create({
      data: {
        organizationId, requestId: id, actorId,
        eventType: approved ? "OWNER_APPROVED" : "OWNER_REJECTED",
        fromStatus: request.progressStatus, toStatus: progressStatus, note,
      },
    });
  });
}

export async function assignMaintenanceMechanic(
  organizationId: string,
  id: string,
  actorId: string,
  mechanicAssigned: string,
) {
  return db.$transaction(async (tx) => {
    const request = await tx.fleetMaintenanceRequest.findFirst({ where: { id, organizationId } });
    if (!request) throw new NotFoundError("Maintenance request not found.");
    if (request.approvalStatus !== "APPROVED" || (request.ownerApprovalRequired && request.ownerApprovalStatus !== "APPROVED")) {
      throw new MaintenanceApprovalRequiredError("Required approvals must be completed before assigning a mechanic.");
    }
    if (request.progressStatus !== "APPROVED") {
      throw new InvalidMaintenanceTransitionError("The request must be approved before mechanic assignment.");
    }
    await tx.fleetMaintenanceRequest.update({ where: { id }, data: { mechanicAssigned } });
    await tx.fleetMaintenanceEvent.create({
      data: { organizationId, requestId: id, actorId, eventType: "MECHANIC_ASSIGNED", fromStatus: request.progressStatus, toStatus: request.progressStatus, note: mechanicAssigned },
    });
  });
}

export async function startMaintenanceRepair(organizationId: string, id: string, actorId: string) {
  return db.$transaction(async (tx) => {
    const request = await tx.fleetMaintenanceRequest.findFirst({ where: { id, organizationId } });
    if (!request) throw new NotFoundError("Maintenance request not found.");
    if (request.progressStatus !== "APPROVED" || !request.mechanicAssigned) {
      throw new InvalidMaintenanceTransitionError("Assign a mechanic to an approved request before starting repair.");
    }
    await tx.fleetMaintenanceRequest.update({ where: { id }, data: { progressStatus: "IN_PROGRESS" } });
    await tx.fleetVehicle.update({ where: { id: request.vehicleId }, data: { status: "MAINTENANCE" } });
    await tx.fleetMaintenanceEvent.create({
      data: { organizationId, requestId: id, actorId, eventType: "REPAIR_STARTED", fromStatus: "APPROVED", toStatus: "IN_PROGRESS" },
    });
  });
}

export async function completeMaintenanceRepair(
  organizationId: string,
  id: string,
  actorId: string,
  repairCost: string,
  note?: string | null,
) {
  const cost = new Prisma.Decimal(repairCost);
  if (cost.isNegative()) throw new InvalidPaymentAmountError("Repair cost cannot be negative.");
  return db.$transaction(async (tx) => {
    const request = await tx.fleetMaintenanceRequest.findFirst({ where: { id, organizationId } });
    if (!request) throw new NotFoundError("Maintenance request not found.");
    if (request.progressStatus !== "IN_PROGRESS") {
      throw new InvalidMaintenanceTransitionError("Only repairs in progress can be marked complete.");
    }
    await tx.fleetMaintenanceRequest.update({
      where: { id },
      data: { progressStatus: "COMPLETED", repairCost: cost.toFixed(2), completedAt: new Date(), completionVerified: false },
    });
    await tx.fleetMaintenanceEvent.create({
      data: { organizationId, requestId: id, actorId, eventType: "REPAIR_COMPLETED", fromStatus: "IN_PROGRESS", toStatus: "COMPLETED", note },
    });
  });
}

export async function verifyMaintenanceCompletion(organizationId: string, id: string, actorId: string) {
  return db.$transaction(async (tx) => {
    const request = await tx.fleetMaintenanceRequest.findFirst({
      where: { id, organizationId },
      include: { vehicle: { include: { owner: true } } },
    });
    if (!request) throw new NotFoundError("Maintenance request not found.");
    if (request.progressStatus !== "COMPLETED" || request.completionVerified) {
      throw new InvalidMaintenanceTransitionError("Only an unverified completed repair can be verified.");
    }
    const now = new Date();
    await tx.fleetMaintenanceRequest.update({ where: { id }, data: { completionVerified: true, ownerNotifiedAt: now } });
    await tx.fleetVehicle.update({
      where: { id: request.vehicleId },
      data: { status: request.vehicle.assignedDriverId ? "ASSIGNED" : "AVAILABLE", nextServiceDueAt: null },
    });
    await tx.fleetMaintenanceEvent.createMany({
      data: [
        { organizationId, requestId: id, actorId, eventType: "COMPLETION_VERIFIED", fromStatus: "COMPLETED", toStatus: "COMPLETED" },
        { organizationId, requestId: id, actorId, eventType: "OWNER_NOTIFIED", fromStatus: "COMPLETED", toStatus: "COMPLETED", note: request.vehicle.owner?.email ?? request.vehicle.owner?.phone ?? "In-app notification" },
      ],
    });
    await tx.notification.create({
      data: {
        organizationId,
        userId: request.vehicle.owner?.userId ?? null,
        type: "FLEET_MAINTENANCE_COMPLETED",
        title: `Repair completed: ${request.vehicle.plateNumber}`,
        message: `Maintenance for ${request.vehicle.assetTag} has been completed and verified.`,
        status: "SENT",
        sentAt: now,
        metadata: { maintenanceRequestId: id, vehicleId: request.vehicleId, ownerId: request.vehicle.ownerId },
      },
    });
  });
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

export async function createFleetWorkAndPayContract(
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
  await requireVehicle(organizationId, data.vehicleId);
  const contractAmount = new Prisma.Decimal(data.contractAmount);
  const depositAmount = new Prisma.Decimal(data.depositAmount);
  if (!contractAmount.isPositive() || depositAmount.isNegative() || depositAmount.greaterThan(contractAmount)) {
    throw new InvalidPaymentAmountError("Contract and deposit amounts are invalid.");
  }
  return db.$transaction(async (tx) => {
    const outstandingBalance = contractAmount.minus(depositAmount);
    const completionPercentage = contractAmount.isPositive() ? depositAmount.div(contractAmount).times(100) : new Prisma.Decimal(0);
    const contract = await tx.fleetWorkAndPayContract.create({
      data: {
        organizationId,
        ...data,
        amountPaid: depositAmount.toFixed(2),
        outstandingBalance: outstandingBalance.toFixed(2),
        completionPercentage: completionPercentage.toFixed(2),
        contractStatus: outstandingBalance.lessThanOrEqualTo(0) ? "COMPLETED" : "ACTIVE",
      },
    });
    if (depositAmount.greaterThan(0)) {
      await tx.fleetPayment.create({
        data: {
          organizationId,
          reference: `WAP-DEP-${Date.now().toString(36).toUpperCase()}-${contract.id.slice(-5).toUpperCase()}`,
          date: data.startsAt ?? new Date(),
          type: "WORK_AND_PAY",
          amount: depositAmount.toFixed(2),
          status: "VERIFIED",
          verified: true,
          relatedEntity: "FleetWorkAndPayContract",
          relatedEntityId: contract.id,
          metadata: { kind: "deposit", contractName: contract.contractName },
        },
      });
    }
    return contract;
  });
}

export class InvalidPaymentAmountError extends Error {}

/**
 * amountPaid/outstandingBalance are updated via one atomic multi-field
 * increment/decrement (a single UPDATE statement), not a JS-computed
 * absolute write from a pre-read snapshot — the same lost-update race
 * Pass 2 fixed in Installment's recordPayment() applied here too: two
 * concurrent payments on the same contract could otherwise lose one
 * payment's contribution to the running total.
 */
export async function recordFleetWorkAndPayPayment(organizationId: string, id: string, amount: number) {
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new InvalidPaymentAmountError("Payment amount must be a positive number.");
  }

  return db.$transaction(async (tx) => {
    const contract = await tx.fleetWorkAndPayContract.findFirst({ where: { id, organizationId } });
    if (!contract) throw new NotFoundError("Contract not found.");
    if (!["ACTIVE", "PAUSED"].includes(contract.contractStatus)) {
      throw new InvalidPaymentAmountError("Payments can only be recorded against active or paused contracts.");
    }

    const updated = await tx.fleetWorkAndPayContract.update({
      where: { id, organizationId },
      data: { amountPaid: { increment: amount }, outstandingBalance: { decrement: amount } },
    });
    const rawBalance = Number(updated.outstandingBalance);
    const contractAmount = Number(updated.contractAmount);
    const clampedBalance = Math.max(rawBalance, 0);
    const completionPercentage = contractAmount > 0 ? Math.min((Number(updated.amountPaid) / contractAmount) * 100, 100) : 0;
    const contractStatus: FleetContractStatus = rawBalance <= 0 ? "COMPLETED" : updated.contractStatus;
    const finalContract = await tx.fleetWorkAndPayContract.update({
      where: { id, organizationId },
      data: {
        outstandingBalance: clampedBalance.toFixed(2),
        completionPercentage: completionPercentage.toFixed(2),
        contractStatus,
      },
    });
    await tx.fleetPayment.create({
      data: {
        organizationId,
        reference: `WAP-${Date.now().toString(36).toUpperCase()}-${id.slice(-5).toUpperCase()}`,
        date: new Date(),
        type: "WORK_AND_PAY",
        amount: amount.toFixed(2),
        status: "VERIFIED",
        verified: true,
        relatedEntity: "FleetWorkAndPayContract",
        relatedEntityId: id,
        metadata: { contractName: contract.contractName, clientName: contract.clientName },
      },
    });
    return finalContract;
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

export async function getFleetInvestorSummary(organizationId: string, userId?: string | null) {
  const ownerFilter = userId ? { userId } : {};
  const owners = await db.fleetOwner.findMany({
    where: { organizationId, ...ownerFilter },
    include: {
      vehicles: {
        include: {
          maintenanceRequests: true,
          workAndPayContracts: true,
        },
      },
    },
    orderBy: { name: "asc" },
  });

  return owners.map((owner) => {
    const vehicles = owner.vehicles;
    const vehicleIds = vehicles.map((vehicle) => vehicle.id);
    const contracts = vehicles.flatMap((vehicle) => vehicle.workAndPayContracts);
    const maintenance = vehicles.flatMap((vehicle) => vehicle.maintenanceRequests);
    const contractValue = contracts.reduce((sum, contract) => sum + Number(contract.contractAmount), 0);
    const amountCollected = contracts.reduce((sum, contract) => sum + Number(contract.amountPaid), 0);
    const outstanding = contracts.reduce((sum, contract) => sum + Number(contract.outstandingBalance), 0);
    const maintenanceCost = maintenance.reduce((sum, request) => sum + Number(request.repairCost ?? 0), 0);
    return {
      owner,
      vehicleIds,
      vehicleCount: vehicles.length,
      activeVehicleCount: vehicles.filter((vehicle) => ["AVAILABLE", "ASSIGNED"].includes(vehicle.status)).length,
      activeContractCount: contracts.filter((contract) => contract.contractStatus === "ACTIVE").length,
      contractValue,
      amountCollected,
      outstanding,
      maintenanceCost,
      netCashPosition: amountCollected - maintenanceCost,
      maintenanceOpenCount: maintenance.filter((request) => !request.completionVerified && request.progressStatus !== "CANCELLED").length,
    };
  });
}

export async function getFleetManagementReport(organizationId: string) {
  const [summary, investors, payments, documents, maintenance] = await Promise.all([
    getFleetSummary(organizationId),
    getFleetInvestorSummary(organizationId),
    listFleetPayments(organizationId),
    listFleetVehicleDocuments(organizationId),
    listFleetMaintenanceRequests(organizationId),
  ]);
  const now = new Date();
  const weekStart = new Date(now);
  weekStart.setDate(now.getDate() - 7);
  const weeklyPayments = payments.filter((payment) => payment.date >= weekStart);
  return {
    summary,
    investors,
    weeklyCollections: weeklyPayments.reduce((sum, payment) => sum + Number(payment.amount), 0),
    verifiedCollections: payments.filter((payment) => payment.verified).reduce((sum, payment) => sum + Number(payment.amount), 0),
    pendingPaymentCount: payments.filter((payment) => payment.status === "PENDING").length,
    expiringDocumentCount: documents.filter((document) => document.renewalStatus !== "CLEAR").length,
    unverifiedRepairCount: maintenance.filter((request) => request.progressStatus === "COMPLETED" && !request.completionVerified).length,
  };
}
