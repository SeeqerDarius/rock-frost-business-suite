import "server-only";

import { db } from "@/lib/db";
import type {
  FleetContractStatus,
  FleetDriverSubmissionType,
  FleetDriverStatus,
  FleetMaintenanceApprovalStatus,
  FleetMaintenanceProgressStatus,
  FleetMechanicStatus,
  FleetPaymentStatus,
  FleetPaymentType,
  FleetSalesTargetPeriod,
  FleetVehicleStatus,
} from "@prisma/client";
import { Prisma } from "@prisma/client";
import {
  getOrganizationModuleConfiguration,
  updateOrganizationModuleConfigurationValues,
} from "@/platform/module-requests/configuration";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { logAuditEvent } from "@/lib/audit";
import { buildTrendBuckets, widestTrendLookback, type TrendGranularity } from "@/lib/trend-buckets";

const DEFAULT_RENEWAL_REMINDER_DAYS = 30;

/** Fleet has no dedicated `FleetSettings` table, so its one real module
 * setting (the renewal reminder window) lives in the generic
 * `OrganizationModule.configuration` store — see
 * `src/platform/module-requests/configuration.ts`. */
export async function getFleetSettings(organizationId: string) {
  const configuration = await getOrganizationModuleConfiguration(organizationId, "fleet");
  const configured = configuration.limits.documentRenewalReminderDays;
  return {
    documentRenewalReminderDays: Number.isFinite(configured) && configured > 0 ? configured : DEFAULT_RENEWAL_REMINDER_DAYS,
  };
}

export async function updateFleetSettings(
  organizationId: string,
  data: { documentRenewalReminderDays: number },
  actorId?: string | null,
) {
  await updateOrganizationModuleConfigurationValues(
    organizationId,
    "fleet",
    { limits: { documentRenewalReminderDays: data.documentRenewalReminderDays } },
    actorId,
  );
}

/**
 * Every function here takes organizationId explicitly and filters on it —
 * per docs/MODULE_BOUNDARIES.md, a module's service layer must never rely on
 * the UI alone to keep one organization's data from another's.
 */

export class NotFoundError extends Error {}

type TxClient = Parameters<Parameters<typeof db.$transaction>[0]>[0];

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

export async function ensureFleetOwnerForUser(tx: TxClient, organizationId: string, userId: string) {
  const existing = await tx.fleetOwner.findUnique({ where: { organizationId_userId: { organizationId, userId } } });
  if (existing) return existing;
  const user = await tx.user.findUnique({ where: { id: userId }, select: { name: true, email: true } });
  if (!user) return null;
  // Link to a roster row a manager already created by name/email (userId still
  // null) instead of creating a duplicate - the manual "add owner" flow and the
  // invite-then-accept flow can both name the same person for the same vehicle.
  if (user.email) {
    const unlinked = await tx.fleetOwner.findFirst({ where: { organizationId, userId: null, email: user.email } });
    if (unlinked) return tx.fleetOwner.update({ where: { id: unlinked.id }, data: { userId } });
  }
  return tx.fleetOwner.create({ data: { organizationId, userId, name: user.name || user.email, email: user.email } });
}

/**
 * Lazily provisions the one FleetOwner row that represents the organization
 * itself, since a company can own a vehicle directly rather than through an
 * individual owner. Runs on every owner-roster read (same backfill-on-read
 * shape as backfillMissingFleetOwners) so a later organization rename stays
 * reflected without a separate migration step.
 */
export async function ensureOrganizationFleetOwner(organizationId: string) {
  const organization = await db.organization.findUnique({ where: { id: organizationId }, select: { name: true } });
  if (!organization) return null;
  const existing = await db.fleetOwner.findFirst({ where: { organizationId, isOrganizationOwner: true } });
  if (existing) {
    if (existing.name === organization.name) return existing;
    return db.fleetOwner.update({ where: { id: existing.id }, data: { name: organization.name } });
  }
  return db.fleetOwner.create({ data: { organizationId, name: organization.name, isOrganizationOwner: true } });
}

async function backfillMissingFleetOwners(organizationId: string) {
  const missing = await db.organizationMember.findMany({
    where: {
      organizationId,
      status: "ACTIVE",
      role: { name: "Vehicle Owner" },
      user: { fleetOwnerProfiles: { none: { organizationId } } },
    },
    select: { userId: true },
  });
  if (missing.length === 0) return;
  await db.$transaction((tx) => Promise.all(missing.map((member) => ensureFleetOwnerForUser(tx, organizationId, member.userId))));
}

export async function listFleetOwners(organizationId: string) {
  await Promise.all([backfillMissingFleetOwners(organizationId), ensureOrganizationFleetOwner(organizationId)]);
  return db.fleetOwner.findMany({ where: { organizationId }, orderBy: { name: "asc" } });
}

export async function listFleetOwnersWithPortfolio(organizationId: string) {
  await Promise.all([backfillMissingFleetOwners(organizationId), ensureOrganizationFleetOwner(organizationId)]);
  const [owners, payments] = await Promise.all([
    db.fleetOwner.findMany({
      where: { organizationId },
      include: { vehicles: { include: { workAndPayContracts: true } } },
      orderBy: { name: "asc" },
    }),
    db.fleetPayment.findMany({ where: { organizationId, status: "VERIFIED" }, select: { amount: true, relatedEntity: true, relatedEntityId: true } }),
  ]);
  return owners.map((owner) => {
    const vehicleIds = new Set(owner.vehicles.map((vehicle) => vehicle.id));
    const contractIds = new Set(owner.vehicles.flatMap((vehicle) => vehicle.workAndPayContracts.map((contract) => contract.id)));
    const revenue = payments.reduce((total, payment) => {
      const belongsToOwner =
        (payment.relatedEntity === "FleetVehicle" && payment.relatedEntityId && vehicleIds.has(payment.relatedEntityId)) ||
        (payment.relatedEntity === "FleetWorkAndPayContract" && payment.relatedEntityId && contractIds.has(payment.relatedEntityId));
      return belongsToOwner ? total + Number(payment.amount) : total;
    }, 0);
    return { ...owner, vehicleCount: owner.vehicles.length, revenue };
  });
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

/**
 * Owner-portal and driver-login dropdowns must only offer people who can
 * actually use that login - not every active member of the organization
 * (which previously let, e.g., the Organization Owner show up as a
 * selectable driver). Scoped the same way the roster backfills already are:
 * drivers by the fleet.driver.self_service permission, owners by the
 * "Vehicle Owner" role name.
 */
export async function listAssignableDriverUsers(organizationId: string) {
  const memberships = await db.organizationMember.findMany({
    where: {
      organizationId,
      status: "ACTIVE",
      user: { status: "ACTIVE" },
      role: { rolePermissions: { some: { permission: { key: PERMISSIONS.FLEET_DRIVER_SELF_SERVICE } } } },
    },
    select: { user: { select: { id: true, name: true, email: true, fleetDriverProfiles: { where: { organizationId }, select: { id: true }, take: 1 } } } },
    orderBy: { user: { name: "asc" } },
  });
  return memberships.map(({ user }) => ({
    id: user.id,
    name: user.name,
    email: user.email,
    linkedDriverId: user.fleetDriverProfiles[0]?.id ?? null,
  }));
}

export async function listAssignableOwnerUsers(organizationId: string) {
  const memberships = await db.organizationMember.findMany({
    where: { organizationId, status: "ACTIVE", user: { status: "ACTIVE" }, role: { name: "Vehicle Owner" } },
    select: { user: { select: { id: true, name: true, email: true } } },
    orderBy: { user: { name: "asc" } },
  });
  return memberships.map(({ user }) => user);
}

// --- Mechanics ---

export function listFleetMechanics(organizationId: string) {
  return db.fleetMechanic.findMany({ where: { organizationId }, orderBy: { name: "asc" } });
}

export function createFleetMechanic(
  organizationId: string,
  data: {
    name: string;
    businessName?: string | null;
    phone?: string | null;
    email?: string | null;
    location?: string | null;
    specialty?: string | null;
    branchId?: string | null;
    userId?: string | null;
  }
) {
  return db.fleetMechanic.create({ data: { organizationId, ...data } });
}

export function updateFleetMechanic(
  organizationId: string,
  id: string,
  data: {
    name: string;
    businessName?: string | null;
    phone?: string | null;
    email?: string | null;
    location?: string | null;
    specialty?: string | null;
    branchId?: string | null;
    userId?: string | null;
    status?: FleetMechanicStatus;
  }
) {
  return db.fleetMechanic.update({ where: { id, organizationId }, data });
}

export async function listAssignableMechanicUsers(organizationId: string) {
  const memberships = await db.organizationMember.findMany({
    where: { organizationId, status: "ACTIVE", user: { status: "ACTIVE" }, role: { name: "Mechanic" } },
    select: { user: { select: { id: true, name: true, email: true } } },
    orderBy: { user: { name: "asc" } },
  });
  return memberships.map(({ user }) => user);
}

// --- Drivers ---

/**
 * Called from Administration's role-assignment and invitation-acceptance
 * flows whenever a member ends up holding a role with the
 * fleet.driver.self_service permission — closes the gap where assigning
 * the Driver role only granted login access, without ever putting the
 * person on the actual Fleet roster (FleetDriver), so /app/fleet/drivers
 * stayed empty and their own self-service pages (which resolve "me" via
 * FleetDriver.userId) had nothing to show. Idempotent: a user who already
 * has a FleetDriver row in this organization (e.g. a manager created one
 * manually first) is left untouched rather than duplicated, relying on
 * the same @@unique([organizationId, userId]) constraint the manual
 * "Driver login" link on the Drivers page already depends on.
 */
export async function ensureFleetDriverForUser(tx: TxClient, organizationId: string, userId: string) {
  const existing = await tx.fleetDriver.findUnique({ where: { organizationId_userId: { organizationId, userId } } });
  if (existing) return existing;
  const user = await tx.user.findUnique({ where: { id: userId }, select: { name: true, email: true } });
  if (!user) return null;
  // Same email-based linking as ensureFleetOwnerForUser: a driver manually
  // added by name/email before being invited must be linked, not duplicated.
  if (user.email) {
    const unlinked = await tx.fleetDriver.findFirst({ where: { organizationId, userId: null, email: user.email } });
    if (unlinked) return tx.fleetDriver.update({ where: { id: unlinked.id }, data: { userId, status: "ACTIVE" } });
  }
  return tx.fleetDriver.create({ data: { organizationId, userId, name: user.name || user.email, email: user.email } });
}

/**
 * Self-heals members who were assigned a Driver-permission role before
 * ensureFleetDriverForUser existed (or through some other historical path)
 * and so never got a FleetDriver row — the same lazy backfill-on-read
 * pattern ensureDefaultAccounts() already uses for Accounting. Runs before
 * every driver-roster read rather than as a one-off migration, so it also
 * covers the (extremely narrow) case of a role's permissions being edited
 * to add driver self-service after members already hold it.
 */
async function backfillMissingFleetDrivers(organizationId: string) {
  const missing = await db.organizationMember.findMany({
    where: {
      organizationId,
      status: "ACTIVE",
      role: { rolePermissions: { some: { permission: { key: PERMISSIONS.FLEET_DRIVER_SELF_SERVICE } } } },
      user: { fleetDriverProfiles: { none: { organizationId } } },
    },
    select: { userId: true },
  });
  if (missing.length === 0) return;
  await db.$transaction((tx) => Promise.all(missing.map((member) => ensureFleetDriverForUser(tx, organizationId, member.userId))));
}

export async function listFleetDrivers(organizationId: string) {
  await backfillMissingFleetDrivers(organizationId);
  return db.fleetDriver.findMany({ where: { organizationId }, include: { user: true }, orderBy: { name: "asc" } });
}

export async function createFleetDriver(
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
    userId?: string | null;
  }
) {
  if (data.userId) {
    const linked = await db.fleetDriver.findUnique({ where: { organizationId_userId: { organizationId, userId: data.userId } }, select: { id: true } });
    if (linked) throw new FleetDriverLoginConflictError("This login is already linked to another driver profile.");
  }
  try {
    return await db.fleetDriver.create({ data: { organizationId, ...data } });
  } catch (error) {
    if (data.userId && error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw new FleetDriverLoginConflictError("This login is already linked to another driver profile.");
    }
    throw error;
  }
}

export async function updateFleetDriver(
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
    userId?: string | null;
  }
) {
  if (data.userId) {
    const linked = await db.fleetDriver.findUnique({ where: { organizationId_userId: { organizationId, userId: data.userId } }, select: { id: true } });
    if (linked && linked.id !== id) throw new FleetDriverLoginConflictError("This login is already linked to another driver profile.");
  }
  try {
    return await db.fleetDriver.update({ where: { id, organizationId }, data });
  } catch (error) {
    if (data.userId && error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw new FleetDriverLoginConflictError("This login is already linked to another driver profile.");
    }
    throw error;
  }
}

export async function getFleetDriverWorkspace(organizationId: string, userId: string) {
  return db.fleetDriver.findFirst({
    where: { organizationId, userId, status: "ACTIVE" },
    include: {
      assignedVehicles: {
        include: {
          maintenanceRequests: { orderBy: { requestedAt: "desc" }, take: 10 },
          workAndPayContracts: {
            where: { contractStatus: "ACTIVE", driver: { userId } },
            orderBy: { createdAt: "desc" },
          },
        },
      },
      paymentSubmissions: { include: { vehicle: true, contract: true }, orderBy: { createdAt: "desc" }, take: 20 },
    },
  });
}

export class FleetDuplicateSubmissionError extends Error {}
export class FleetSalesTargetError extends Error {}
export class FleetPaymentEvidenceError extends Error {}
export class FleetPaymentDateError extends Error {}
export class FleetDriverAssignmentError extends Error {}
export class FleetDriverLoginConflictError extends Error {}

export const FLEET_REMITTANCE_METHODS = ["CASH", "MOBILE_MONEY", "BANK_TRANSFER", "CARD", "CHEQUE", "OTHER"] as const;
export type FleetRemittanceMethod = (typeof FLEET_REMITTANCE_METHODS)[number];

function requirePaymentEvidence(paymentMethod: string, reference?: string | null) {
  if (!(FLEET_REMITTANCE_METHODS as readonly string[]).includes(paymentMethod)) {
    throw new FleetPaymentEvidenceError("Choose a supported payment method.");
  }
  if (paymentMethod !== "CASH" && !reference?.trim()) {
    throw new FleetPaymentEvidenceError("Enter the transaction reference for this payment method.");
  }
}

function startOfUtcDay(value: Date) {
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
}

function salesPeriod(type: FleetDriverSubmissionType, selectedStart: Date) {
  const periodStart = startOfUtcDay(selectedStart);
  const periodEnd = new Date(periodStart);
  if (type !== "DAILY_SALES") {
    const daysSinceMonday = (periodStart.getUTCDay() + 6) % 7;
    periodStart.setUTCDate(periodStart.getUTCDate() - daysSinceMonday);
    periodEnd.setTime(periodStart.getTime());
    periodEnd.setUTCDate(periodEnd.getUTCDate() + 6);
  }
  return { periodStart, periodEnd };
}

export async function submitFleetDriverPayment(
  organizationId: string,
  userId: string,
  data: {
    vehicleId: string;
    contractId?: string | null;
    submissionType: FleetDriverSubmissionType;
    periodStart: Date;
    amount: string;
    paymentDate: Date;
    paymentMethod: string;
    reference?: string | null;
    notes?: string | null;
  },
) {
  const driver = await db.fleetDriver.findFirst({ where: { organizationId, userId, status: "ACTIVE" } });
  if (!driver) throw new NotFoundError("Driver profile not found.");
  let amount: Prisma.Decimal;
  try {
    amount = new Prisma.Decimal(data.amount);
  } catch {
    throw new InvalidPaymentAmountError("Payment amount must be a number.");
  }
  if (!amount.isPositive()) throw new InvalidPaymentAmountError("Payment amount must be positive.");
  if (Number.isNaN(data.paymentDate.getTime()) || Number.isNaN(data.periodStart.getTime())) {
    throw new FleetPaymentDateError("Payment and obligation dates must be valid.");
  }
  const today = startOfUtcDay(new Date());
  if (startOfUtcDay(data.paymentDate) > today || startOfUtcDay(data.periodStart) > today) {
    throw new FleetPaymentDateError("Completed payments and obligation periods cannot be dated in the future.");
  }
  requirePaymentEvidence(data.paymentMethod, data.reference);
  const vehicle = await db.fleetVehicle.findFirst({ where: { id: data.vehicleId, organizationId, assignedDriverId: driver.id } });
  if (!vehicle) throw new NotFoundError("Assigned vehicle not found.");

  let expectedAmount: Prisma.Decimal | null = null;
  let paymentSchedule: FleetSalesTargetPeriod | null = null;
  if (data.submissionType === "WORK_AND_PAY") {
    if (!data.contractId) throw new FleetSalesTargetError("Select an active Work & Pay contract.");
    const contract = await db.fleetWorkAndPayContract.findFirst({
      where: {
        id: data.contractId,
        organizationId,
        vehicleId: vehicle.id,
        driverId: driver.id,
        contractStatus: { in: ["ACTIVE", "PAUSED"] },
      },
    });
    if (!contract) throw new NotFoundError("Assigned contract not found.");
    paymentSchedule = contract.paymentSchedule;
    expectedAmount = contract.scheduledPaymentAmount ?? contract.weeklyPaymentAmount;
  } else {
    if (data.contractId) throw new FleetSalesTargetError("A vehicle remittance cannot use a Work & Pay contract.");
    const requiredPeriod: FleetSalesTargetPeriod = data.submissionType === "DAILY_SALES" ? "DAILY" : "WEEKLY";
    if (vehicle.salesTargetPeriod !== requiredPeriod || !vehicle.salesTargetAmount) {
      throw new FleetSalesTargetError(`This vehicle is not configured for ${requiredPeriod.toLowerCase()} remittances.`);
    }
    expectedAmount = vehicle.salesTargetAmount;
  }

  const periodType: FleetDriverSubmissionType = paymentSchedule === "DAILY" ? "DAILY_SALES" : data.submissionType;
  const { periodStart, periodEnd } = salesPeriod(periodType, data.periodStart);
  const existing = await db.fleetDriverPaymentSubmission.findFirst({
    where: {
      organizationId,
      driverId: driver.id,
      vehicleId: vehicle.id,
      submissionType: data.submissionType,
      periodStart,
      periodEnd,
      status: { in: ["PENDING", "APPROVED"] },
    },
    select: { id: true },
  });
  if (existing) throw new FleetDuplicateSubmissionError("A remittance for this vehicle and payment period already exists.");

  let submission;
  try {
    submission = await db.fleetDriverPaymentSubmission.create({
      data: {
        organizationId,
        driverId: driver.id,
        vehicleId: vehicle.id,
        contractId: data.submissionType === "WORK_AND_PAY" ? data.contractId : null,
        submissionType: data.submissionType,
        periodStart,
        periodEnd,
        expectedAmount,
        amount,
        paymentDate: data.paymentDate,
        paymentMethod: data.paymentMethod,
        reference: data.reference,
        notes: data.notes,
      },
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw new FleetDuplicateSubmissionError("A remittance for this vehicle and payment period already exists.");
    }
    throw error;
  }
  // Notifying the driver is not a condition of the submission's own success -
  // a failure here must never surface as a duplicate-submission error, so it
  // sits outside the try/catch above rather than inside it.
  await db.notification.create({
    data: {
      organizationId,
      userId,
      type: "FLEET_DRIVER_PAYMENT_SUBMITTED",
      title: `Payment recorded: ${vehicle.plateNumber}`,
      message: `Your ${amount.toString()} payment for ${vehicle.plateNumber} has been recorded and sent for manager verification.`,
      status: "SENT",
      sentAt: new Date(),
      metadata: { submissionId: submission.id, vehicleId: vehicle.id, amount: amount.toString() },
    },
  });
  return submission;
}

export function listFleetDriverPaymentSubmissions(organizationId: string) {
  return db.fleetDriverPaymentSubmission.findMany({
    where: { organizationId },
    include: { driver: true, vehicle: true, contract: true },
    orderBy: { createdAt: "desc" },
  });
}

export async function reviewFleetDriverPaymentSubmission(organizationId: string, id: string, reviewerId: string, approved: boolean, rejectionReason?: string | null) {
  return db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`fleet-driver-submission:${organizationId}:${id}`}))`;
    const submission = await tx.fleetDriverPaymentSubmission.findFirst({
      where: { id, organizationId, status: "PENDING" },
      include: { vehicle: true, contract: true, driver: true },
    });
    if (!submission) throw new NotFoundError("Pending submission not found.");
    let fleetPaymentId: string | null = null;
    if (approved) {
      if (submission.submissionType === "WORK_AND_PAY") {
        if (!submission.contractId || !submission.contract) throw new NotFoundError("Work & Pay contract not found.");
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`fleet-contract:${organizationId}:${submission.contractId}`}))`;
        const contract = await tx.fleetWorkAndPayContract.findFirst({
          where: { id: submission.contractId, organizationId, contractStatus: { in: ["ACTIVE", "PAUSED"] } },
        });
        if (!contract) throw new NotFoundError("Work & Pay contract not found.");
        const newAmountPaid = new Prisma.Decimal(contract.amountPaid).plus(submission.amount);
        const rawBalance = new Prisma.Decimal(contract.contractAmount).minus(newAmountPaid);
        const outstandingBalance = Prisma.Decimal.max(rawBalance, 0);
        const completionPercentage = Prisma.Decimal.min(newAmountPaid.div(contract.contractAmount).mul(100), 100);
        await tx.fleetWorkAndPayContract.update({
          where: { id: contract.id, organizationId },
          data: {
            amountPaid: newAmountPaid,
            outstandingBalance,
            completionPercentage,
            contractStatus: rawBalance.lte(0) ? "COMPLETED" : contract.contractStatus,
          },
        });
      }
      const payment = await tx.fleetPayment.create({
        data: {
          organizationId,
          reference: submission.reference || `DRV-${submission.id.slice(-8).toUpperCase()}`,
          date: submission.paymentDate,
          type: submission.submissionType === "WORK_AND_PAY" ? "WORK_AND_PAY" : "WEEKLY_SALES",
          amount: submission.amount,
          status: "VERIFIED",
          relatedEntity: submission.contractId ? "FleetWorkAndPayContract" : "FleetVehicle",
          relatedEntityId: submission.contractId || submission.vehicleId,
          verified: true,
          metadata: {
            driverSubmissionId: submission.id,
            driverId: submission.driverId,
            paymentMethod: submission.paymentMethod,
            submissionType: submission.submissionType,
            periodStart: submission.periodStart.toISOString(),
            periodEnd: submission.periodEnd.toISOString(),
            targetAmount: submission.expectedAmount?.toString() ?? null,
          },
        },
      });
      fleetPaymentId = payment.id;
    }
    const reviewedSubmission = await tx.fleetDriverPaymentSubmission.update({
      where: { id },
      data: { status: approved ? "APPROVED" : "REJECTED", reviewedById: reviewerId, reviewedAt: new Date(), rejectionReason: approved ? null : rejectionReason, fleetPaymentId },
    });
    await logAuditEvent({
      organizationId,
      userId: reviewerId,
      module: "fleet",
      action: approved ? "driver.payment_approved" : "driver.payment_rejected",
      entityName: "FleetDriverPaymentSubmission",
      entityId: submission.id,
      metadata: {
        driverId: submission.driverId,
        vehicleId: submission.vehicleId,
        submissionType: submission.submissionType,
        amount: submission.amount.toString(),
        paymentId: fleetPaymentId,
      },
    }, tx);
    if (submission.driver.userId) {
      const vehicleLabel = submission.vehicle?.plateNumber ?? "your vehicle";
      await tx.notification.create({
        data: {
          organizationId,
          userId: submission.driver.userId,
          type: approved ? "FLEET_DRIVER_PAYMENT_APPROVED" : "FLEET_DRIVER_PAYMENT_REJECTED",
          title: approved ? `Payment approved: ${vehicleLabel}` : `Payment rejected: ${vehicleLabel}`,
          message: approved
            ? `Your ${submission.amount.toString()} payment for ${vehicleLabel} has been verified.`
            : `Your ${submission.amount.toString()} payment for ${vehicleLabel} was rejected.${rejectionReason ? ` Reason: ${rejectionReason}` : ""}`,
          status: "SENT",
          sentAt: new Date(),
          metadata: { submissionId: submission.id, vehicleId: submission.vehicleId, amount: submission.amount.toString() },
        },
      });
    }
    return reviewedSubmission;
  });
}

// --- Vehicles ---

export function listFleetVehicles(organizationId: string) {
  return db.fleetVehicle.findMany({
    where: { organizationId },
    include: { owner: true, assignedDriver: true, ownershipHistory: { orderBy: { changedAt: "desc" } } },
    orderBy: { createdAt: "desc" },
  });
}

export function getFleetVehicle(organizationId: string, id: string) {
  return db.fleetVehicle.findFirst({
    where: { id, organizationId },
    include: { owner: true, assignedDriver: true, ownershipHistory: { orderBy: { changedAt: "desc" } } },
  });
}

export function listFleetActorVehicles(
  organizationId: string,
  userId: string,
  access: { driver: boolean; owner: boolean },
) {
  const clauses: Prisma.FleetVehicleWhereInput[] = [];
  if (access.driver) clauses.push({ assignedDriver: { userId } });
  if (access.owner) clauses.push({ owner: { userId } });
  if (clauses.length === 0) return Promise.resolve([]);
  return db.fleetVehicle.findMany({
    where: { organizationId, OR: clauses },
    include: { owner: true, assignedDriver: true, ownershipHistory: { orderBy: { changedAt: "desc" } } },
    orderBy: { createdAt: "desc" },
  });
}

async function validateVehicleRefs(organizationId: string, data: { ownerId?: string | null; assignedDriverId?: string | null }) {
  let owner: { id: string; name: string } | null = null;
  let driver: { id: string; name: string } | null = null;
  if (data.ownerId) {
    owner = await db.fleetOwner.findFirst({ where: { id: data.ownerId, organizationId }, select: { id: true, name: true } });
    if (!owner) throw new NotFoundError("Owner not found.");
  }
  if (data.assignedDriverId) {
    driver = await db.fleetDriver.findFirst({ where: { id: data.assignedDriverId, organizationId }, select: { id: true, name: true } });
    if (!driver) throw new NotFoundError("Driver not found.");
  }
  return { owner, driver };
}

type FleetVehicleInput = {
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
  salesTargetPeriod?: FleetSalesTargetPeriod | null;
  salesTargetAmount?: string | null;
};

function vehicleSalesTarget(data: FleetVehicleInput) {
  if (!data.salesTargetPeriod && !data.salesTargetAmount) return { salesTargetPeriod: null, salesTargetAmount: null };
  if (!data.salesTargetPeriod || !data.salesTargetAmount) throw new FleetSalesTargetError("Select a remittance schedule and enter its required amount.");
  let amount: Prisma.Decimal;
  try {
    amount = new Prisma.Decimal(data.salesTargetAmount);
  } catch {
    throw new FleetSalesTargetError("Sales target must be a number.");
  }
  if (!amount.isPositive()) throw new FleetSalesTargetError("Sales target must be greater than zero.");
  return { salesTargetPeriod: data.salesTargetPeriod, salesTargetAmount: amount };
}

export async function createFleetVehicle(
  organizationId: string,
  data: FleetVehicleInput,
  actorId?: string | null,
) {
  const { owner } = await validateVehicleRefs(organizationId, data);
  const salesTarget = vehicleSalesTarget(data);
  return db.$transaction(async (tx) => {
    const vehicle = await tx.fleetVehicle.create({ data: { organizationId, ...data, ...salesTarget } });
    if (owner) {
      await tx.fleetVehicleOwnershipHistory.create({
        data: { organizationId, vehicleId: vehicle.id, newOwnerId: owner.id, newOwnerName: owner.name, changedById: actorId },
      });
    }
    return vehicle;
  });
}

export async function updateFleetVehicle(
  organizationId: string,
  id: string,
  data: FleetVehicleInput,
  actorId?: string | null,
) {
  const { owner } = await validateVehicleRefs(organizationId, data);
  const salesTarget = vehicleSalesTarget(data);
  return db.$transaction(async (tx) => {
    const existing = await tx.fleetVehicle.findFirst({
      where: { id, organizationId },
      include: { owner: { select: { id: true, name: true } } },
    });
    if (!existing) throw new NotFoundError("Vehicle not found.");
    const vehicle = await tx.fleetVehicle.update({ where: { id, organizationId }, data: { ...data, ...salesTarget } });
    if ((existing.ownerId ?? null) !== (data.ownerId ?? null)) {
      await tx.fleetVehicleOwnershipHistory.create({
        data: {
          organizationId,
          vehicleId: id,
          previousOwnerId: existing.ownerId,
          previousOwnerName: existing.owner?.name,
          newOwnerId: owner?.id,
          newOwnerName: owner?.name,
          changedById: actorId,
        },
      });
    }
    return vehicle;
  });
}

// --- Vehicle documents (insurance & roadworthy) ---

export async function listFleetVehicleDocuments(organizationId: string) {
  await refreshFleetDocumentStatuses(organizationId);
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
  const { documentRenewalReminderDays } = await getFleetSettings(organizationId);
  return db.fleetVehicleDocument.create({ data: { organizationId, ...data, renewalStatus: computeRenewalStatus(data, documentRenewalReminderDays) } });
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
  const { documentRenewalReminderDays } = await getFleetSettings(organizationId);
  return db.fleetVehicleDocument.update({
    where: { id, organizationId },
    data: { ...data, renewalStatus: computeRenewalStatus(data, documentRenewalReminderDays) },
  });
}

function computeRenewalStatus(data: { insuranceExpiresAt: Date; roadworthyExpiresAt: Date }, reminderDays: number) {
  const soonest = data.insuranceExpiresAt < data.roadworthyExpiresAt ? data.insuranceExpiresAt : data.roadworthyExpiresAt;
  const daysUntil = (soonest.getTime() - Date.now()) / (1000 * 60 * 60 * 24);
  if (daysUntil < 0) return "DUE" as const;
  if (daysUntil <= reminderDays) return "READY" as const;
  return "CLEAR" as const;
}

export async function refreshFleetDocumentStatuses(organizationId: string) {
  const [documents, { documentRenewalReminderDays }] = await Promise.all([
    db.fleetVehicleDocument.findMany({
      where: { organizationId },
      include: { vehicle: true },
    }),
    getFleetSettings(organizationId),
  ]);
  for (const document of documents) {
    const renewalStatus = computeRenewalStatus(document, documentRenewalReminderDays);
    const documentStatus = renewalStatus === "DUE" ? "EXPIRED" : renewalStatus === "READY" ? "EXPIRING_SOON" : "VALID";
    if (document.renewalStatus === renewalStatus && document.vehicle.documentStatus === documentStatus) continue;
    await db.$transaction(async (tx) => {
      await tx.fleetVehicleDocument.update({ where: { id: document.id }, data: { renewalStatus } });
      await tx.fleetVehicle.update({ where: { id: document.vehicleId }, data: { documentStatus } });
      if (renewalStatus !== "CLEAR" && document.renewalStatus !== renewalStatus) {
        await tx.notification.create({
          data: {
            organizationId,
            type: "FLEET_DOCUMENT_RENEWAL",
            title: `${document.vehicle.plateNumber} documents ${renewalStatus === "DUE" ? "are due" : "expire soon"}`,
            message: `Insurance or roadworthy renewal requires attention for ${document.vehicle.assetTag}.`,
            status: "SENT",
            sentAt: new Date(),
            metadata: { vehicleId: document.vehicleId, documentId: document.id, renewalStatus },
          },
        });
      }
    });
  }
}

// --- Maintenance requests ---

export function listFleetMaintenanceRequests(organizationId: string, vehicleIds?: string[]) {
  return db.fleetMaintenanceRequest.findMany({
    where: { organizationId, ...(vehicleIds ? { vehicleId: { in: vehicleIds } } : {}) },
    include: {
      vehicle: { include: { owner: true, assignedDriver: true } },
      requestedBy: true,
      mechanic: true,
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
    photo?: { fileName: string; mimeType: string; size: number; dataUrl: string } | null;
  }
) {
  const vehicle = await db.fleetVehicle.findFirst({ where: { id: data.vehicleId, organizationId } });
  if (!vehicle) throw new NotFoundError("Vehicle not found.");
  return db.$transaction(async (tx) => {
    const { photo, ...requestData } = data;
    const request = await tx.fleetMaintenanceRequest.create({ data: { organizationId, ...requestData } });
    if (photo) {
      const asset = await tx.fileAsset.create({
        data: {
          organizationId,
          branchId: data.branchId,
          uploadedById: data.requestedById,
          fileName: photo.fileName,
          mimeType: photo.mimeType,
          size: photo.size,
          storagePath: `database://fleet-maintenance/${request.id}`,
          url: photo.dataUrl,
          metadata: { purpose: "fleet-maintenance-photo", requestId: request.id },
        },
      });
      await tx.fleetMaintenanceRequest.update({ where: { id: request.id }, data: { photoAssetId: asset.id } });
    }
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
    if (data.requestedById) {
      await tx.notification.create({
        data: {
          organizationId,
          userId: data.requestedById,
          type: "FLEET_MAINTENANCE_SUBMITTED",
          title: `Maintenance reported: ${vehicle.plateNumber}`,
          message: `Your report for ${vehicle.plateNumber} has been submitted for review.`,
          status: "SENT",
          sentAt: new Date(),
          metadata: { maintenanceRequestId: request.id, vehicleId: vehicle.id },
        },
      });
    }
    return request;
  });
}

export function getFleetMaintenancePhoto(
  organizationId: string,
  requestId: string,
  userId: string,
  canViewAll: boolean,
) {
  return db.fleetMaintenanceRequest.findFirst({
    where: {
      id: requestId,
      organizationId,
      ...(canViewAll ? {} : { vehicle: { OR: [{ assignedDriver: { userId } }, { owner: { userId } }] } }),
    },
    select: { photoAsset: { select: { url: true, updatedAt: true } } },
  });
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
    const request = await tx.fleetMaintenanceRequest.findFirst({ where: { id, organizationId }, include: { vehicle: true } });
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
    if (request.requestedById) {
      const message = !data.approved
        ? `Your maintenance report for ${request.vehicle.plateNumber} was declined.${data.fleetManagerReview ? ` Reason: ${data.fleetManagerReview}` : ""}`
        : data.ownerApprovalRequired
          ? `Your maintenance report for ${request.vehicle.plateNumber} is approved and now awaiting the vehicle owner's sign-off.`
          : `Your maintenance report for ${request.vehicle.plateNumber} has been approved. A mechanic will be assigned.`;
      await tx.notification.create({
        data: {
          organizationId,
          userId: request.requestedById,
          type: data.approved ? "FLEET_MAINTENANCE_APPROVED" : "FLEET_MAINTENANCE_REJECTED",
          title: data.approved ? `Maintenance approved: ${request.vehicle.plateNumber}` : `Maintenance declined: ${request.vehicle.plateNumber}`,
          message,
          status: "SENT",
          sentAt: new Date(),
          metadata: { maintenanceRequestId: id, vehicleId: request.vehicleId },
        },
      });
    }
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
  mechanicId: string,
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
    const mechanic = await tx.fleetMechanic.findFirst({ where: { id: mechanicId, organizationId } });
    if (!mechanic) throw new NotFoundError("Mechanic not found.");
    await tx.fleetMaintenanceRequest.update({ where: { id }, data: { mechanicId } });
    await tx.fleetMaintenanceEvent.create({
      data: { organizationId, requestId: id, actorId, eventType: "MECHANIC_ASSIGNED", fromStatus: request.progressStatus, toStatus: request.progressStatus, note: mechanic.name },
    });
  });
}

/**
 * A mechanic recording their own scheduled repair date for a request
 * assigned to them - gated to the FleetMechanic profile linked to the
 * caller's own userId, never any mechanicId the caller happens to pass.
 * Deliberately does not advance progressStatus: the ASSIGNED/SCHEDULED
 * states this action conceptually belongs to don't exist in
 * FleetMaintenanceProgressStatus yet (see the plan's later enum expansion),
 * so for now this only records the date and logs a REPAIR_SCHEDULED event -
 * a mechanical follow-on activates the real transition once those values
 * are added, not a rebuild of this action.
 */
export async function acceptMaintenanceAssignment(
  organizationId: string,
  id: string,
  userId: string,
  scheduledRepairAt: Date,
) {
  return db.$transaction(async (tx) => {
    const mechanic = await tx.fleetMechanic.findFirst({ where: { organizationId, userId } });
    if (!mechanic) throw new NotFoundError("Mechanic profile not found.");
    const request = await tx.fleetMaintenanceRequest.findFirst({ where: { id, organizationId, mechanicId: mechanic.id } });
    if (!request) throw new NotFoundError("Maintenance request not found.");
    await tx.fleetMaintenanceRequest.update({ where: { id }, data: { scheduledRepairAt } });
    await tx.fleetMaintenanceEvent.create({
      data: {
        organizationId,
        requestId: id,
        actorId: userId,
        eventType: "REPAIR_SCHEDULED",
        fromStatus: request.progressStatus,
        toStatus: request.progressStatus,
        note: `Repair scheduled for ${scheduledRepairAt.toISOString().slice(0, 10)}`,
      },
    });
  });
}

export async function startMaintenanceRepair(organizationId: string, id: string, actorId: string) {
  return db.$transaction(async (tx) => {
    const request = await tx.fleetMaintenanceRequest.findFirst({ where: { id, organizationId } });
    if (!request) throw new NotFoundError("Maintenance request not found.");
    if (request.progressStatus !== "APPROVED" || !request.mechanicId) {
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
    if (request.requestedById && request.requestedById !== request.vehicle.owner?.userId) {
      await tx.notification.create({
        data: {
          organizationId,
          userId: request.requestedById,
          type: "FLEET_MAINTENANCE_COMPLETED",
          title: `Repair completed: ${request.vehicle.plateNumber}`,
          message: `The issue you reported for ${request.vehicle.plateNumber} has been repaired and verified. Your vehicle is ready.`,
          status: "SENT",
          sentAt: now,
          metadata: { maintenanceRequestId: id, vehicleId: request.vehicleId },
        },
      });
    }
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
    include: { vehicle: true, driver: true },
    orderBy: { createdAt: "desc" },
  });
}

export async function createFleetWorkAndPayContract(
  organizationId: string,
  data: {
    contractName: string;
    vehicleId: string;
    contractAmount: string;
    depositAmount: string;
    paymentSchedule: FleetSalesTargetPeriod;
    scheduledPaymentAmount: string;
    remainingPaymentPeriods?: number | null;
    startsAt?: Date | null;
    branchId?: string | null;
  }
) {
  if (!(["DAILY", "WEEKLY"] as const).includes(data.paymentSchedule)) {
    throw new InvalidPaymentAmountError("Choose a daily or weekly payment schedule.");
  }
  let contractAmount: Prisma.Decimal;
  let depositAmount: Prisma.Decimal;
  let scheduledPaymentAmount: Prisma.Decimal;
  try {
    contractAmount = new Prisma.Decimal(data.contractAmount);
    depositAmount = new Prisma.Decimal(data.depositAmount);
    scheduledPaymentAmount = new Prisma.Decimal(data.scheduledPaymentAmount);
  } catch {
    throw new InvalidPaymentAmountError("Contract, deposit, and instalment amounts must be valid numbers.");
  }
  if (!contractAmount.isPositive() || depositAmount.isNegative() || depositAmount.greaterThan(contractAmount) || !scheduledPaymentAmount.isPositive() || (data.remainingPaymentPeriods != null && data.remainingPaymentPeriods <= 0)) {
    throw new InvalidPaymentAmountError("Contract and deposit amounts are invalid.");
  }
  return db.$transaction(async (tx) => {
    const vehicle = await tx.fleetVehicle.findFirst({
      where: { id: data.vehicleId, organizationId },
      include: { assignedDriver: true },
    });
    if (!vehicle) throw new NotFoundError("Vehicle not found.");
    if (!vehicle.assignedDriver || vehicle.assignedDriver.status !== "ACTIVE") {
      throw new FleetDriverAssignmentError("Assign an active driver to the vehicle before creating a Work & Pay contract.");
    }

    const outstandingBalance = contractAmount.minus(depositAmount);
    const completionPercentage = contractAmount.isPositive() ? depositAmount.div(contractAmount).times(100) : new Prisma.Decimal(0);
    const contract = await tx.fleetWorkAndPayContract.create({
      data: {
        organizationId,
        ...data,
        branchId: data.branchId ?? vehicle.branchId,
        driverId: vehicle.assignedDriver.id,
        clientName: vehicle.assignedDriver.name,
        weeklyPaymentAmount: scheduledPaymentAmount,
        scheduledPaymentAmount,
        remainingDurationWeeks: data.paymentSchedule === "WEEKLY" ? data.remainingPaymentPeriods : null,
        amountPaid: depositAmount.toFixed(2),
        outstandingBalance: outstandingBalance.toFixed(2),
        completionPercentage: completionPercentage.toFixed(2),
        contractStatus: outstandingBalance.lessThanOrEqualTo(0) ? "COMPLETED" : "ACTIVE",
      },
    });
    let depositPayment = null;
    if (depositAmount.greaterThan(0)) {
      depositPayment = await tx.fleetPayment.create({
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
    return { contract, depositPayment };
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
export async function recordFleetWorkAndPayPayment(organizationId: string, id: string, data: {
  amount: number;
  paymentDate: Date;
  paymentMethod: FleetRemittanceMethod;
  reference?: string | null;
  actorId?: string | null;
}) {
  const { amount } = data;
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new InvalidPaymentAmountError("Payment amount must be a positive number.");
  }
  if (Number.isNaN(data.paymentDate.getTime())) {
    throw new InvalidPaymentAmountError("Payment date must be valid.");
  }
  requirePaymentEvidence(data.paymentMethod, data.reference);

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
    const ledgerPayment = await tx.fleetPayment.create({
      data: {
        organizationId,
        reference: data.reference || `WAP-CASH-${Date.now().toString(36).toUpperCase()}-${id.slice(-5).toUpperCase()}`,
        date: data.paymentDate,
        type: "WORK_AND_PAY",
        amount: amount.toFixed(2),
        status: "VERIFIED",
        verified: true,
        relatedEntity: "FleetWorkAndPayContract",
        relatedEntityId: id,
        metadata: { contractName: contract.contractName, clientName: contract.clientName, paymentMethod: data.paymentMethod, source: "office-recorded" },
      },
    });
    await logAuditEvent({
      organizationId,
      userId: data.actorId ?? null,
      module: "fleet",
      action: "work_and_pay.office_payment_recorded",
      entityName: "FleetPayment",
      entityId: ledgerPayment.id,
      metadata: { contractId: id, amount: amount.toFixed(2), paymentMethod: data.paymentMethod, resultingOutstandingBalance: finalContract.outstandingBalance.toString() },
    }, tx);
    return { contract: finalContract, payment: ledgerPayment };
  });
}

export function updateFleetWorkAndPayContractStatus(organizationId: string, id: string, contractStatus: FleetContractStatus) {
  return db.fleetWorkAndPayContract.update({ where: { id, organizationId }, data: { contractStatus } });
}

// --- Aggregates (Reports, dashboard widget) ---

export async function getFleetSummary(organizationId: string) {
  const now = new Date();
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const weekStart = new Date(now);
  weekStart.setUTCDate(weekStart.getUTCDate() - 7);
  const { documentRenewalReminderDays } = await getFleetSettings(organizationId);
  const expiryThreshold = new Date(now);
  expiryThreshold.setUTCDate(expiryThreshold.getUTCDate() + documentRenewalReminderDays);
  const [
    vehicleCount,
    vehiclesByStatus,
    activeDriverCount,
    ownerCount,
    pendingMaintenanceCount,
    maintenanceVehicles,
    activeContractCount,
    pendingDriverSubmissionCount,
    expiringDocumentCount,
    weeklyRevenue,
    monthlyRevenue,
    outstandingBalances,
    recentPayments,
  ] = await Promise.all([
      db.fleetVehicle.count({ where: { organizationId } }),
      db.fleetVehicle.groupBy({ by: ["status"], where: { organizationId }, _count: true }),
      db.fleetDriver.count({ where: { organizationId, status: "ACTIVE" } }),
      db.fleetOwner.count({ where: { organizationId } }),
      db.fleetMaintenanceRequest.count({ where: { organizationId, progressStatus: { notIn: ["COMPLETED", "CANCELLED"] } } }),
      db.fleetMaintenanceRequest.groupBy({ by: ["vehicleId"], where: { organizationId, progressStatus: { notIn: ["COMPLETED", "CANCELLED"] } } }),
      db.fleetWorkAndPayContract.count({ where: { organizationId, contractStatus: "ACTIVE" } }),
      db.fleetDriverPaymentSubmission.count({ where: { organizationId, status: "PENDING" } }),
      db.fleetVehicleDocument.count({
        where: { organizationId, OR: [{ insuranceExpiresAt: { lte: expiryThreshold } }, { roadworthyExpiresAt: { lte: expiryThreshold } }] },
      }),
      db.fleetPayment.aggregate({
        where: { organizationId, status: "VERIFIED", date: { gte: weekStart } },
        _sum: { amount: true },
      }),
      db.fleetPayment.aggregate({
        where: { organizationId, status: "VERIFIED", date: { gte: monthStart } },
        _sum: { amount: true },
      }),
      db.fleetWorkAndPayContract.aggregate({
        where: { organizationId, contractStatus: { in: ["ACTIVE", "PAUSED"] } },
        _sum: { outstandingBalance: true },
      }),
      db.fleetPayment.findMany({
        where: { organizationId },
        orderBy: [{ date: "desc" }, { createdAt: "desc" }],
        take: 5,
      }),
    ]);

  return {
    vehicleCount,
    vehiclesByStatus,
    activeDriverCount,
    ownerCount,
    pendingMaintenanceCount,
    maintenanceVehicleCount: maintenanceVehicles.length,
    activeContractCount,
    pendingDriverSubmissionCount,
    expiringDocumentCount,
    weeklyRevenue: Number(weeklyRevenue._sum.amount ?? 0),
    monthlyRevenue: Number(monthlyRevenue._sum.amount ?? 0),
    paymentsThisMonthTotal: Number(monthlyRevenue._sum.amount ?? 0),
    outstandingBalance: Number(outstandingBalances._sum.outstandingBalance ?? 0),
    recentPayments,
  };
}

export interface FleetPaymentTrends {
  trends: Record<TrendGranularity, { label: string; revenue: number }[]>;
}

/**
 * Verified-payment revenue bucketed for the Reports page's trend chart.
 * Fetches once against the widest lookback window and buckets that same
 * result three ways, matching the pattern already used for the Dashboard
 * and Accounting overview trend widgets (src/lib/trend-buckets.ts).
 */
export async function getFleetPaymentTrends(organizationId: string): Promise<FleetPaymentTrends> {
  const payments = await db.fleetPayment.findMany({
    where: { organizationId, status: "VERIFIED", date: { gte: widestTrendLookback() } },
    select: { amount: true, date: true },
  });
  const revenueBetween = (start: Date, end: Date) =>
    payments.filter((payment) => payment.date >= start && payment.date < end).reduce((sum, payment) => sum + Number(payment.amount), 0);
  const buildSeries = (granularity: TrendGranularity) =>
    buildTrendBuckets(granularity).map((bucket) => ({ label: bucket.label, revenue: revenueBetween(bucket.start, bucket.end) }));
  return { trends: { days: buildSeries("days"), weeks: buildSeries("weeks"), months: buildSeries("months") } };
}

/**
 * Collections trend scoped the same way getFleetInvestorSummary is - all
 * owners when userId is omitted (the Fleet-manager view), or only the
 * portfolio linked to that userId (the Vehicle Owner's own investor view).
 */
export async function getFleetInvestorTrends(organizationId: string, userId?: string | null): Promise<FleetPaymentTrends> {
  const ownerFilter = userId ? { userId } : {};
  const owners = await db.fleetOwner.findMany({
    where: { organizationId, ...ownerFilter },
    include: { vehicles: { include: { workAndPayContracts: true } } },
  });
  const vehicleIds = new Set(owners.flatMap((owner) => owner.vehicles.map((vehicle) => vehicle.id)));
  const contractIds = new Set(owners.flatMap((owner) => owner.vehicles.flatMap((vehicle) => vehicle.workAndPayContracts.map((contract) => contract.id))));

  const payments = await db.fleetPayment.findMany({
    where: { organizationId, status: "VERIFIED", date: { gte: widestTrendLookback() } },
    select: { amount: true, date: true, relatedEntity: true, relatedEntityId: true },
  });
  const relevant = payments.filter(
    (payment) =>
      (payment.relatedEntity === "FleetVehicle" && payment.relatedEntityId && vehicleIds.has(payment.relatedEntityId)) ||
      (payment.relatedEntity === "FleetWorkAndPayContract" && payment.relatedEntityId && contractIds.has(payment.relatedEntityId)),
  );
  const revenueBetween = (start: Date, end: Date) =>
    relevant.filter((payment) => payment.date >= start && payment.date < end).reduce((sum, payment) => sum + Number(payment.amount), 0);
  const buildSeries = (granularity: TrendGranularity) =>
    buildTrendBuckets(granularity).map((bucket) => ({ label: bucket.label, revenue: revenueBetween(bucket.start, bucket.end) }));
  return { trends: { days: buildSeries("days"), weeks: buildSeries("weeks"), months: buildSeries("months") } };
}

/**
 * A driver's own two revenue trends, kept separate rather than merged: how
 * much they've remitted from vehicle sales versus how much they've paid
 * toward a Work & Pay contract are different obligations with different
 * schedules, so showing one combined number would blur what the driver
 * actually needs to track. Mirrors getFleetInvestorTrends's
 * filter-by-relatedEntity pattern, but takes the vehicle/contract id sets as
 * input rather than looking them up itself, since every caller already has
 * them from getFleetDriverWorkspace.
 */
export async function getFleetDriverTrends(
  organizationId: string,
  scope: { vehicleIds: string[]; contractIds: string[] },
): Promise<{ vehicleRevenue: FleetPaymentTrends["trends"]; workAndPay: FleetPaymentTrends["trends"] }> {
  const vehicleIds = new Set(scope.vehicleIds);
  const contractIds = new Set(scope.contractIds);
  const emptyTrends = () => {
    const empty = (granularity: TrendGranularity) => buildTrendBuckets(granularity).map((bucket) => ({ label: bucket.label, revenue: 0 }));
    return { days: empty("days"), weeks: empty("weeks"), months: empty("months") };
  };
  if (vehicleIds.size === 0 && contractIds.size === 0) {
    return { vehicleRevenue: emptyTrends(), workAndPay: emptyTrends() };
  }

  const payments = await db.fleetPayment.findMany({
    where: { organizationId, status: "VERIFIED", date: { gte: widestTrendLookback() } },
    select: { amount: true, date: true, relatedEntity: true, relatedEntityId: true },
  });
  const buildSeriesFor = (relatedEntity: "FleetVehicle" | "FleetWorkAndPayContract", ids: Set<string>) => {
    const relevant = payments.filter((payment) => payment.relatedEntity === relatedEntity && payment.relatedEntityId && ids.has(payment.relatedEntityId));
    const revenueBetween = (start: Date, end: Date) =>
      relevant.filter((payment) => payment.date >= start && payment.date < end).reduce((sum, payment) => sum + Number(payment.amount), 0);
    const buildSeries = (granularity: TrendGranularity) =>
      buildTrendBuckets(granularity).map((bucket) => ({ label: bucket.label, revenue: revenueBetween(bucket.start, bucket.end) }));
    return { days: buildSeries("days"), weeks: buildSeries("weeks"), months: buildSeries("months") };
  };
  return {
    vehicleRevenue: buildSeriesFor("FleetVehicle", vehicleIds),
    workAndPay: buildSeriesFor("FleetWorkAndPayContract", contractIds),
  };
}

export async function getFleetDriverDashboardSummary(organizationId: string, userId: string) {
  const driver = await getFleetDriverWorkspace(organizationId, userId);
  if (!driver) return { assignedVehicleCount: 0, openMaintenanceCount: 0, pendingSubmissionCount: 0 };
  return {
    assignedVehicleCount: driver.assignedVehicles.length,
    openMaintenanceCount: driver.assignedVehicles.reduce(
      (total, vehicle) => total + vehicle.maintenanceRequests.filter((request) => !["COMPLETED", "CANCELLED"].includes(request.progressStatus)).length,
      0,
    ),
    pendingSubmissionCount: driver.paymentSubmissions.filter((submission) => submission.status === "PENDING").length,
  };
}

export async function getFleetInvestorSummary(organizationId: string, userId?: string | null) {
  const ownerFilter = userId ? { userId } : {};
  const [owners, payments] = await Promise.all([
    db.fleetOwner.findMany({
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
    }),
    db.fleetPayment.findMany({
      where: { organizationId, status: "VERIFIED" },
      select: { amount: true, relatedEntity: true, relatedEntityId: true },
    }),
  ]);

  return owners.map((owner) => {
    const vehicles = owner.vehicles;
    const vehicleIds = vehicles.map((vehicle) => vehicle.id);
    const contracts = vehicles.flatMap((vehicle) => vehicle.workAndPayContracts);
    const contractIds = new Set(contracts.map((contract) => contract.id));
    const vehicleIdSet = new Set(vehicleIds);
    const maintenance = vehicles.flatMap((vehicle) => vehicle.maintenanceRequests);
    const contractValue = contracts.reduce((sum, contract) => sum + Number(contract.contractAmount), 0);
    const amountCollected = payments.reduce((sum, payment) => {
      const belongsToPortfolio =
        (payment.relatedEntity === "FleetVehicle" && payment.relatedEntityId && vehicleIdSet.has(payment.relatedEntityId)) ||
        (payment.relatedEntity === "FleetWorkAndPayContract" && payment.relatedEntityId && contractIds.has(payment.relatedEntityId));
      return belongsToPortfolio ? sum + Number(payment.amount) : sum;
    }, 0);
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
