import { Prisma, type PosPaymentMethod } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { logAuditEvent } from "@/lib/audit";
import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import { requireCurrentTenant } from "@/lib/tenant";
import { postModuleRevenue } from "@/lib/accounting-integration";
import { createSale, InsufficientStockError, InvalidSaleInputError, NotFoundError, SaleStateError } from "@/modules/pos/service";

const money = z.string().regex(/^\d+(?:\.\d{1,2})?$/);
const operationSchema = z.object({
  operationId: z.string().min(1).max(100),
  organizationId: z.string().min(1).max(100),
  userId: z.string().min(1).max(100),
  deviceId: z.string().min(1).max(100),
  module: z.string().min(1).max(50),
  entityType: z.string().min(1).max(100),
  entityId: z.string().min(1).max(100),
  operationType: z.string().min(1).max(50),
  clientTimestamp: z.string().datetime(),
  baseServerVersion: z.number().int().nonnegative(),
  idempotencyKey: z.string().min(1).max(100),
  payloadSchemaVersion: z.number().int().positive().max(10),
  payload: z.unknown(),
  attachmentReferences: z.array(z.string().min(1).max(100)).max(20),
  dependencyIds: z.array(z.string().min(1).max(100)).max(50),
});
const requestSchema = z.object({ operations: z.array(operationSchema).min(1).max(100) });
const posSaleSchema = z.object({
  clientRequestId: z.string().min(1).max(100),
  sessionId: z.string().min(1).max(100),
  customerName: z.string().max(200).nullable(),
  lines: z.array(z.object({ itemId: z.string().min(1).max(100).nullable(), description: z.string().min(1).max(200), quantity: z.number().int().positive().max(100_000), unitPrice: money })).min(1).max(100),
  payments: z.array(z.object({ method: z.enum(["CASH", "CARD", "MOBILE_MONEY", "OTHER"]), amount: money, reference: z.string().max(200).nullable() })).max(10),
  mode: z.enum(["COMPLETED", "SUSPENDED"]),
  occurredAt: z.string().datetime(),
});

type Operation = z.infer<typeof operationSchema>;
type SyncResult = { operationId: string; status: "applied" | "rejected" | "conflict" | "synchronizing"; result?: unknown; errorCode?: string };

function sameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  return !origin || origin === new URL(request.url).origin;
}

function storedResult(record: { mutationId: string; status: string; result: Prisma.JsonValue | null; errorCode: string | null }): SyncResult {
  return { operationId: record.mutationId, status: record.status === "APPLIED" ? "applied" : record.status === "REJECTED" ? "rejected" : record.status === "CONFLICT" ? "conflict" : "synchronizing", result: record.result, errorCode: record.errorCode ?? undefined };
}

async function applyPosSale(operation: Operation, userId: string) {
  if (operation.entityType !== "pos.sale" || !["record", "draft"].includes(operation.operationType) || operation.payloadSchemaVersion !== 1) {
    throw new PermanentSyncError("unsupported-operation");
  }
  const parsed = posSaleSchema.safeParse(operation.payload);
  if (!parsed.success || parsed.data.clientRequestId !== operation.idempotencyKey || parsed.data.clientRequestId !== operation.operationId) {
    throw new PermanentSyncError("invalid-payload");
  }
  if (parsed.data.mode === "COMPLETED" && parsed.data.payments.length === 0) throw new PermanentSyncError("invalid-payment");
  const sale = await createSale(operation.organizationId, {
    sessionId: parsed.data.sessionId,
    customerName: parsed.data.customerName,
    paymentMethod: (parsed.data.payments[0]?.method ?? "CASH") as PosPaymentMethod,
    soldById: userId,
    lines: parsed.data.lines,
    payments: parsed.data.payments.map((payment) => ({ ...payment, method: payment.method as PosPaymentMethod })),
    status: parsed.data.mode,
    clientRequestId: parsed.data.clientRequestId,
    occurredAt: new Date(parsed.data.occurredAt),
  });
  if (parsed.data.mode === "COMPLETED") {
    await postModuleRevenue(operation.organizationId, { sourceModule: "pos", sourceType: "POS_SALE", sourceId: sale.id, postingPurpose: "COLLECTED", amount: sale.total.toString(), entryDate: sale.occurredAt ?? sale.createdAt, description: `POS sale ${sale.saleNumber}`, createdById: userId });
  }
  return { id: sale.id, saleNumber: sale.saleNumber, status: sale.status, total: sale.total.toString(), serverTimestamp: new Date().toISOString() };
}

class PermanentSyncError extends Error { constructor(public code: string) { super(code); } }
class ProtectedConflictError extends Error { constructor(public code: string) { super(code); } }

async function rejectMutation(ledgerId: string, operation: Operation, membershipId: string, code: string): Promise<SyncResult> {
  const record = await db.offlineMutation.update({ where: { id: ledgerId }, data: { status: "REJECTED", errorCode: code, result: { message: code } } });
  await logAuditEvent({ organizationId: operation.organizationId, userId: operation.userId, membershipId, module: operation.module, action: "offline_mutation.rejected", entityName: operation.entityType, entityId: operation.entityId, status: "FAILURE", correlationId: operation.operationId, metadata: { deviceId: operation.deviceId, errorCode: code } });
  return storedResult(record);
}

async function conflictMutation(ledgerId: string, operation: Operation, membershipId: string, code: string): Promise<SyncResult> {
  const record = await db.$transaction(async (tx) => {
    const conflict = await tx.offlineConflict.upsert({
      where: { mutationId: ledgerId },
      update: {},
      create: { organizationId: operation.organizationId, deviceId: operation.deviceId, mutationId: ledgerId, conflictType: code, allowedResolutions: ["KEEP_SERVER", "MANAGER_REVIEW"] },
    });
    return tx.offlineMutation.update({ where: { id: ledgerId }, data: { status: "CONFLICT", errorCode: code, result: { conflictId: conflict.id, message: code, allowedResolutions: conflict.allowedResolutions } } });
  });
  await logAuditEvent({ organizationId: operation.organizationId, userId: operation.userId, membershipId, module: operation.module, action: "offline_mutation.conflict", entityName: operation.entityType, entityId: operation.entityId, status: "FAILURE", correlationId: operation.operationId, metadata: { deviceId: operation.deviceId, conflictType: code } });
  return storedResult(record);
}

async function processOperation(operation: Operation, tenant: Awaited<ReturnType<typeof requireCurrentTenant>>, membershipId: string): Promise<SyncResult> {
  const existing = await db.offlineMutation.findFirst({ where: { organizationId: tenant.organizationId, OR: [{ mutationId: operation.operationId }, { idempotencyKey: operation.idempotencyKey }] } });
  if (existing) {
    if (existing.deviceId !== operation.deviceId || existing.userId !== tenant.userId || existing.mutationId !== operation.operationId || existing.idempotencyKey !== operation.idempotencyKey) throw new PermanentSyncError("idempotency-key-owned");
    if (existing.status !== "PROCESSING" || existing.updatedAt.getTime() > Date.now() - 120_000) return storedResult(existing);
  }
  let ledger = existing;
  if (!ledger) {
    try {
      ledger = await db.offlineMutation.create({ data: { organizationId: tenant.organizationId, deviceId: operation.deviceId, userId: tenant.userId, mutationId: operation.operationId, idempotencyKey: operation.idempotencyKey, moduleKey: operation.module, entityType: operation.entityType, entityId: operation.entityId, operation: operation.operationType, baseVersion: operation.baseServerVersion, payloadSchemaVersion: operation.payloadSchemaVersion, attachmentReferences: operation.attachmentReferences, dependencyIds: operation.dependencyIds, payload: operation.payload as Prisma.InputJsonValue, changedAt: new Date(operation.clientTimestamp) } });
    } catch (error) {
      if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002") throw error;
      const raced = await db.offlineMutation.findFirstOrThrow({ where: { organizationId: tenant.organizationId, OR: [{ mutationId: operation.operationId }, { idempotencyKey: operation.idempotencyKey }] } });
      return storedResult(raced);
    }
  }
  try {
    if (operation.module !== "pos") throw new PermanentSyncError("unsupported-module");
    if (!hasPermission(tenant, PERMISSIONS.POS_SALES_MANAGE)) throw new PermanentSyncError("permission-revoked");
    const result = await applyPosSale(operation, tenant.userId);
    const applied = await db.offlineMutation.update({ where: { id: ledger.id }, data: { status: "APPLIED", result, appliedAt: new Date(), errorCode: null } });
    await logAuditEvent({ organizationId: operation.organizationId, userId: operation.userId, membershipId, module: operation.module, action: "offline_mutation.applied", entityName: operation.entityType, entityId: result.id, correlationId: operation.operationId, metadata: { deviceId: operation.deviceId, saleNumber: result.saleNumber } });
    return storedResult(applied);
  } catch (error) {
    if (error instanceof PermanentSyncError) return rejectMutation(ledger.id, operation, membershipId, error.code);
    if (error instanceof InsufficientStockError) return conflictMutation(ledger.id, operation, membershipId, "stale-stock");
    if (error instanceof SaleStateError) return conflictMutation(ledger.id, operation, membershipId, "stale-register-session");
    if (error instanceof NotFoundError) return conflictMutation(ledger.id, operation, membershipId, "stale-reference");
    if (error instanceof InvalidSaleInputError) return rejectMutation(ledger.id, operation, membershipId, "invalid-payload");
    if (error instanceof ProtectedConflictError) return conflictMutation(ledger.id, operation, membershipId, error.code);
    throw error;
  }
}

export async function POST(request: Request) {
  if (!sameOrigin(request)) return NextResponse.json({ error: "cross-origin-request" }, { status: 403 });
  const tenant = await requireCurrentTenant();
  const parsed = requestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success || Buffer.byteLength(JSON.stringify(parsed.data), "utf8") > 1_000_000) return NextResponse.json({ error: "invalid-request" }, { status: 400 });
  const membership = await db.organizationMember.findUnique({ where: { organizationId_userId: { organizationId: tenant.organizationId, userId: tenant.userId } }, select: { id: true, status: true } });
  if (!membership || membership.status !== "ACTIVE") return NextResponse.json({ error: "membership-inactive" }, { status: 403 });
  const deviceIds = [...new Set(parsed.data.operations.map((operation) => operation.deviceId))];
  if (deviceIds.length !== 1) return NextResponse.json({ error: "single-device-required" }, { status: 400 });
  const device = await db.offlineDevice.findFirst({ where: { id: deviceIds[0], organizationId: tenant.organizationId, userId: tenant.userId, membershipId: membership.id, status: "ACTIVE", platform: { startsWith: "browser:" } } });
  if (!device) return NextResponse.json({ error: "device-revoked" }, { status: 403 });
  const operationsById = new Map(parsed.data.operations.map((operation) => [operation.operationId, operation]));
  const externalDependencyIds = [...new Set(parsed.data.operations.flatMap((operation) => operation.dependencyIds).filter((dependency) => !operationsById.has(dependency)))];
  const priorDependencies = externalDependencyIds.length ? await db.offlineMutation.findMany({ where: { organizationId: tenant.organizationId, userId: tenant.userId, deviceId: device.id, mutationId: { in: externalDependencyIds }, status: "APPLIED" }, select: { mutationId: true } }) : [];
  const applied = new Set(priorDependencies.map((dependency) => dependency.mutationId));
  const processed = new Set<string>();
  const results: SyncResult[] = [];
  let remaining = [...parsed.data.operations];
  while (remaining.length) {
    const blocked = remaining.filter((operation) => operation.dependencyIds.some((dependency) => processed.has(dependency) && !applied.has(dependency)));
    for (const operation of blocked) {
      results.push({ operationId: operation.operationId, status: "rejected", errorCode: "dependency-failed" });
      processed.add(operation.operationId);
    }
    const blockedIds = new Set(blocked.map((operation) => operation.operationId));
    remaining = remaining.filter((operation) => !blockedIds.has(operation.operationId));
    const ready = remaining.filter((operation) => operation.dependencyIds.every((dependency) => applied.has(dependency)));
    if (!ready.length) {
      results.push(...remaining.map((operation) => ({ operationId: operation.operationId, status: "rejected" as const, errorCode: operation.dependencyIds.some((dependency) => !operationsById.has(dependency) && !applied.has(dependency)) ? "dependency-unavailable" : "dependency-cycle" })));
      break;
    }
    for (const operation of ready) {
      if (operation.organizationId !== tenant.organizationId || operation.userId !== tenant.userId || operation.deviceId !== device.id || !device.moduleKeys.includes(operation.module) || !tenant.accessibleModuleKeys.includes(operation.module) || !operation.entityType.startsWith(`${operation.module}.`)) {
        results.push({ operationId: operation.operationId, status: "rejected", errorCode: "access-revoked" });
      } else {
        try {
          const result = await processOperation(operation, tenant, membership.id);
          results.push(result);
          if (result.status === "applied") applied.add(operation.operationId);
        }
        catch (error) { if (error instanceof PermanentSyncError) results.push({ operationId: operation.operationId, status: "rejected", errorCode: error.code }); else throw error; }
      }
      processed.add(operation.operationId);
    }
    const readyIds = new Set(ready.map((operation) => operation.operationId));
    remaining = remaining.filter((operation) => !readyIds.has(operation.operationId));
  }
  await db.offlineDevice.update({ where: { id: device.id }, data: { lastSeenAt: new Date(), lastSyncAt: new Date() } });
  return NextResponse.json({ results, serverTimestamp: new Date().toISOString(), offlineAccessUntil: device.offlineAccessUntil.toISOString() });
}
