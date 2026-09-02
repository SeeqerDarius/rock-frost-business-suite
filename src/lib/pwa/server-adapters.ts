import "server-only";

import { Prisma } from "@prisma/client";
import { z } from "zod";
import { db } from "@/lib/db";
import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import type { TenantContext } from "@/lib/tenant";
import { submitFleetDriverPayment, createFleetMaintenanceRequest, ownerDecisionMaintenanceRequest } from "@/modules/fleet/service";
import { updateInventoryCountLine } from "@/modules/inventory/service";
import { recordSchoolAttendanceBulk } from "@/modules/school/service";
import { updateHotelHousekeepingTask } from "@/modules/hotel/service";

export class OfflinePermanentError extends Error { constructor(public code: string) { super(code); } }
export class OfflineProtectedConflict extends Error {
  constructor(public code: string, public cloudSnapshot?: unknown, public cloudVersion?: number) { super(code); }
}

export interface AdapterOperation {
  operationId: string;
  organizationId: string;
  userId: string;
  deviceId: string;
  module: string;
  entityType: string;
  entityId: string;
  operationType: string;
  clientTimestamp: string;
  baseServerVersion: number;
  idempotencyKey: string;
  payloadSchemaVersion: number;
  payload: unknown;
  attachmentReferences: string[];
}

const money = z.string().regex(/^\d+(?:\.\d{1,2})?$/);
const fleetPayment = z.object({ vehicleId: z.string(), contractId: z.string().nullable().optional(), submissionType: z.enum(["DAILY_SALES", "WEEKLY_SALES", "WORK_AND_PAY"]), periodStart: z.string().datetime(), amount: money, paymentDate: z.string().datetime(), paymentMethod: z.enum(["CASH", "MOBILE_MONEY", "BANK_TRANSFER", "CARD", "CHEQUE", "OTHER"]), reference: z.string().max(200).nullable().optional(), notes: z.string().max(2000).nullable().optional() });
const fleetFault = z.object({ vehicleId: z.string(), faultDescription: z.string().trim().min(3).max(5000), branchId: z.string().nullable().optional() });
const ownerDecision = z.object({ requestId: z.string(), approved: z.boolean(), note: z.string().max(2000).nullable().optional() });
const inventoryCountLine = z.object({ countId: z.string(), lineId: z.string(), countedQuantity: z.number().int().nonnegative(), notes: z.string().max(2000).nullable().optional() });
const attendance = z.object({ termId: z.string(), classId: z.string(), date: z.string().datetime(), entries: z.array(z.object({ studentId: z.string(), status: z.enum(["PRESENT", "ABSENT", "LATE", "EXCUSED"]), reason: z.string().max(500).nullable().optional() })).min(1).max(500) });
const housekeeping = z.object({ taskId: z.string(), status: z.enum(["PENDING", "IN_PROGRESS", "INSPECTION", "COMPLETED"]), assignedTo: z.string().max(200).nullable().optional() });
const safeDraft = z.object({ title: z.string().trim().min(1).max(200), fields: z.record(z.string(), z.unknown()) });

function requirePermission(tenant: TenantContext, permission: string) {
  if (!hasPermission(tenant, permission)) throw new OfflinePermanentError("permission-revoked");
}

async function stagedAttachments(operation: AdapterOperation) {
  if (!operation.attachmentReferences.length) return [];
  const rows = await db.offlineAttachmentUpload.findMany({ where: { id: { in: operation.attachmentReferences }, organizationId: operation.organizationId, userId: operation.userId, deviceId: operation.deviceId, moduleKey: operation.module, status: "STAGED", expiresAt: { gt: new Date() } } });
  if (rows.length !== operation.attachmentReferences.length) throw new OfflinePermanentError("attachment-unavailable");
  return rows;
}

function assertVersion(baseVersion: number, updatedAt: Date, snapshot: unknown) {
  if (baseVersion <= 0 || updatedAt.getTime() !== baseVersion) throw new OfflineProtectedConflict("stale-record", snapshot, updatedAt.getTime());
}

export async function applyOfflineModuleOperation(operation: AdapterOperation, tenant: TenantContext, ledgerId: string) {
  const attachments = await stagedAttachments(operation);
  // Every branch below sets at least `status` - a bare `Record<string,
  // unknown>` annotation would type-check the same but loses that literal
  // shape entirely on the `{ ...result, serverTimestamp }` spread below
  // (TypeScript drops a plain index signature when inferring an object
  // spread's type), so callers lose access to `.status` on the return value.
  let result: { status: string } & Record<string, unknown>;

  if (operation.module === "fleet" && operation.entityType === "fleet.driver-payment" && operation.operationType === "declare") {
    requirePermission(tenant, PERMISSIONS.FLEET_DRIVER_SELF_SERVICE);
    const data = fleetPayment.parse(operation.payload);
    const submission = await submitFleetDriverPayment(operation.organizationId, tenant.userId, { ...data, periodStart: new Date(data.periodStart), paymentDate: new Date(data.paymentDate) });
    result = { id: submission.id, status: submission.status, confirmation: "awaiting-manager-verification" };
  } else if (operation.module === "fleet" && operation.entityType === "fleet.fault-report" && operation.operationType === "report") {
    requirePermission(tenant, PERMISSIONS.FLEET_DRIVER_SELF_SERVICE);
    const data = fleetFault.parse(operation.payload);
    const allowed = await db.fleetVehicle.findFirst({ where: { id: data.vehicleId, organizationId: operation.organizationId, assignedDriver: { userId: tenant.userId, status: "ACTIVE" } }, select: { id: true, updatedAt: true } });
    if (!allowed) throw new OfflineProtectedConflict("stale-vehicle-assignment");
    assertVersion(operation.baseServerVersion, allowed.updatedAt, allowed);
    const request = await createFleetMaintenanceRequest(operation.organizationId, { ...data, requestedById: tenant.userId, photos: attachments.filter((item) => item.mimeType.startsWith("image/")).map((item) => ({ fileName: item.fileName, mimeType: item.mimeType, size: item.size, dataUrl: `data:${item.mimeType};base64,${Buffer.from(item.data).toString("base64")}` })) });
    result = { id: request.id, status: request.progressStatus, confirmation: "awaiting-manager-review" };
  } else if (operation.module === "fleet" && operation.entityType === "fleet.owner-maintenance-decision" && operation.operationType === "decide") {
    requirePermission(tenant, PERMISSIONS.FLEET_INVESTOR_VIEW);
    const data = ownerDecision.parse(operation.payload);
    const current = await db.fleetMaintenanceRequest.findFirst({ where: { id: data.requestId, organizationId: operation.organizationId }, select: { id: true, progressStatus: true, ownerApprovalStatus: true, updatedAt: true } });
    if (!current) throw new OfflineProtectedConflict("stale-maintenance-request");
    assertVersion(operation.baseServerVersion, current.updatedAt, current);
    await ownerDecisionMaintenanceRequest(operation.organizationId, data.requestId, tenant.userId, data.approved, data.note);
    const updated = await db.fleetMaintenanceRequest.findUniqueOrThrow({ where: { id: data.requestId }, select: { id: true, progressStatus: true, ownerApprovalStatus: true } });
    result = { id: updated.id, status: updated.progressStatus, ownerApprovalStatus: updated.ownerApprovalStatus };
  } else if (operation.module === "inventory" && operation.entityType === "inventory.count-line" && operation.operationType === "count") {
    requirePermission(tenant, PERMISSIONS.INVENTORY_COUNTS_MANAGE);
    const data = inventoryCountLine.parse(operation.payload);
    const current = await db.inventoryCountLine.findFirst({ where: { id: data.lineId, countId: data.countId, count: { organizationId: operation.organizationId } }, select: { id: true, countedQuantity: true, notes: true, updatedAt: true, count: { select: { status: true } } } });
    if (!current || current.count.status !== "DRAFT") throw new OfflineProtectedConflict("stale-stock-count", current);
    assertVersion(operation.baseServerVersion, current.updatedAt, current);
    const updated = await updateInventoryCountLine(operation.organizationId, data.countId, data.lineId, data.countedQuantity, data.notes);
    result = { id: updated.id, countedQuantity: updated.countedQuantity, variance: updated.variance, status: "pending-count-draft" };
  } else if (operation.module === "school" && operation.entityType === "school.attendance" && operation.operationType === "record") {
    requirePermission(tenant, PERMISSIONS.SCHOOL_ATTENDANCE_MANAGE);
    const data = attendance.parse(operation.payload);
    const changed = await db.schoolAttendance.findFirst({ where: { organizationId: operation.organizationId, classId: data.classId, date: new Date(data.date), updatedAt: { gt: new Date(operation.baseServerVersion || 0) } }, select: { id: true, studentId: true, status: true, reason: true, updatedAt: true } });
    if (changed) throw new OfflineProtectedConflict("attendance-changed", changed, changed.updatedAt.getTime());
    const saved = await recordSchoolAttendanceBulk(operation.organizationId, tenant.userId, { ...data, date: new Date(data.date) });
    result = { ...saved, status: "server-recorded" };
  } else if (operation.module === "hotel" && operation.entityType === "hotel.housekeeping" && operation.operationType === "update") {
    requirePermission(tenant, PERMISSIONS.HOTEL_HOUSEKEEPING_MANAGE);
    const data = housekeeping.parse(operation.payload);
    const current = await db.hotelHousekeepingTask.findFirst({ where: { id: data.taskId, organizationId: operation.organizationId }, select: { id: true, status: true, assignedTo: true, notes: true, updatedAt: true } });
    if (!current) throw new OfflineProtectedConflict("housekeeping-task-unavailable");
    assertVersion(operation.baseServerVersion, current.updatedAt, current);
    const updated = await updateHotelHousekeepingTask(operation.organizationId, data.taskId, data.status, data.assignedTo);
    result = { id: updated.id, status: updated.status, confirmation: "server-confirmed" };
  } else if (["accounting", "pharmacy", "hospital", "school", "hotel", "inventory", "fleet", "hostel"].includes(operation.module) && operation.operationType === "draft") {
    const permissionByModule: Record<string, string> = {
      accounting: PERMISSIONS.ACCOUNTING_VIEW, pharmacy: PERMISSIONS.PHARMACY_VIEW, hospital: PERMISSIONS.HOSPITAL_VIEW,
      school: PERMISSIONS.SCHOOL_VIEW, hotel: PERMISSIONS.HOTEL_VIEW, inventory: PERMISSIONS.INVENTORY_VIEW,
      fleet: PERMISSIONS.FLEET_VIEW, hostel: PERMISSIONS.HOSTEL_VIEW,
    };
    requirePermission(tenant, permissionByModule[operation.module]);
    const data = safeDraft.parse(operation.payload);
    const draft = await db.offlineDraft.create({ data: { organizationId: operation.organizationId, userId: tenant.userId, moduleKey: operation.module, entityType: operation.entityType, entityId: operation.entityId, title: data.title, payload: { fields: data.fields, attachmentIds: attachments.map((item) => item.id), offlineStatus: "DRAFT_REQUIRES_SERVER_REVIEW" } as Prisma.InputJsonValue, sourceMutationId: ledgerId } });
    result = { id: draft.id, status: "draft", confirmation: "requires-online-review" };
  } else throw new OfflinePermanentError("unsupported-operation");

  if (attachments.length) await db.offlineAttachmentUpload.updateMany({ where: { id: { in: attachments.map((item) => item.id) } }, data: { status: "CONSUMED", consumedAt: new Date() } });
  return { ...result, serverTimestamp: new Date().toISOString() };
}
