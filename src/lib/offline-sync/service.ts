import "server-only";

import { createHash, randomBytes } from "node:crypto";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { logAuditEvent } from "@/lib/audit";
import type { TenantContext } from "@/lib/tenant";
import {
  OFFLINE_SYNC_LIMITS,
  type OfflineMutationInput,
  type OfflineSupportedModule,
} from "@/lib/offline-sync/contract";
import { applyOfflineMutation, OfflineMutationConflictError, OfflineMutationDeniedError } from "@/lib/offline-sync/adapters";
import { createOfflineToken, resolveTenantForOfflineIdentity, type OfflineDeviceContext } from "@/lib/offline-sync/auth";
import { buildFleetSnapshot } from "@/lib/offline-sync/snapshot-builders/fleet";
import { buildInstallmentSnapshot } from "@/lib/offline-sync/snapshot-builders/installment";
import { buildInventorySnapshot } from "@/lib/offline-sync/snapshot-builders/inventory";
import { buildPosSnapshot } from "@/lib/offline-sync/snapshot-builders/pos";
import type { OfflineSnapshotRow } from "@/lib/offline-sync/snapshot-builders/types";

function addDays(date: Date, days: number) {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}

function addHours(date: Date, hours: number) {
  return new Date(date.getTime() + hours * 60 * 60 * 1000);
}

function activationCodeHash(code: string) {
  return createHash("sha256").update(code.replaceAll("-", ""), "utf8").digest("hex");
}

function generateActivationCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = randomBytes(10);
  const value = Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join("");
  return `${value.slice(0, 5)}-${value.slice(5)}`;
}

export async function createOfflineActivationCode(tenant: TenantContext, requestedModuleKeys: OfflineSupportedModule[]) {
  const moduleKeys = [...new Set(requestedModuleKeys)].filter((key) => tenant.accessibleModuleKeys.includes(key));
  if (moduleKeys.length === 0) throw new OfflineMutationDeniedError("None of the requested modules is available to this account.");
  const membership = await db.organizationMember.findUnique({
    where: { organizationId_userId: { organizationId: tenant.organizationId, userId: tenant.userId } },
    select: { id: true, status: true, user: { select: { name: true, email: true } } },
  });
  if (!membership || membership.status !== "ACTIVE") throw new OfflineMutationDeniedError("The organization membership is not active.");

  await db.offlineActivationCode.deleteMany({
    where: { organizationId: tenant.organizationId, userId: tenant.userId, usedAt: null, expiresAt: { lt: new Date() } },
  });
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const code = generateActivationCode();
    try {
      const record = await db.offlineActivationCode.create({
        data: {
          organizationId: tenant.organizationId,
          userId: tenant.userId,
          membershipId: membership.id,
          codeHash: activationCodeHash(code),
          moduleKeys,
          expiresAt: new Date(Date.now() + 10 * 60 * 1000),
        },
      });
      await logAuditEvent({
        organizationId: tenant.organizationId,
        userId: tenant.userId,
        membershipId: membership.id,
        module: "administration",
        action: "offline_activation_code.created",
        entityName: "OfflineActivationCode",
        entityId: record.id,
        metadata: { moduleKeys, expiresInMinutes: 10 },
      });
      return { code, expiresAt: record.expiresAt.toISOString(), moduleKeys };
    } catch (error) {
      if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002") throw error;
    }
  }
  throw new Error("Could not create a unique activation code.");
}

export async function exchangeOfflineActivationCode(input: {
  activationCode: string;
  installationId: string;
  name: string;
  platform: string;
  moduleKeys: OfflineSupportedModule[];
}) {
  const codeHash = activationCodeHash(input.activationCode.toUpperCase());
  const code = await db.offlineActivationCode.findUnique({ where: { codeHash } });
  if (!code || code.usedAt || code.expiresAt <= new Date()) {
    throw new OfflineMutationDeniedError("The activation code is invalid or expired.");
  }
  const claimed = await db.offlineActivationCode.updateMany({
    where: { id: code.id, usedAt: null, expiresAt: { gt: new Date() } },
    data: { usedAt: new Date() },
  });
  if (claimed.count !== 1) throw new OfflineMutationDeniedError("The activation code has already been used.");
  const tenant = await resolveTenantForOfflineIdentity(code.organizationId, code.userId, code.membershipId);
  const allowedByCode = input.moduleKeys.filter((key) => code.moduleKeys.includes(key));
  if (allowedByCode.length === 0) throw new OfflineMutationDeniedError("The activation code does not authorize the requested modules.");
  return activateOfflineDevice(tenant, { ...input, moduleKeys: allowedByCode });
}

export async function activateOfflineDevice(
  tenant: TenantContext,
  input: { installationId: string; name: string; platform: string; moduleKeys: OfflineSupportedModule[] },
) {
  const moduleKeys = [...new Set(input.moduleKeys)].filter((key) => tenant.accessibleModuleKeys.includes(key));
  if (moduleKeys.length === 0) throw new OfflineMutationDeniedError("None of the requested modules is available to this account.");

  const membership = await db.organizationMember.findUnique({
    where: { organizationId_userId: { organizationId: tenant.organizationId, userId: tenant.userId } },
    select: { id: true, status: true, user: { select: { name: true, email: true } } },
  });
  if (!membership || membership.status !== "ACTIVE") throw new OfflineMutationDeniedError("The organization membership is not active.");

  const existing = await db.offlineDevice.findUnique({
    where: { organizationId_installationId: { organizationId: tenant.organizationId, installationId: input.installationId } },
  });
  if (existing?.status === "REVOKED") throw new OfflineMutationDeniedError("This installation was revoked and cannot reactivate itself.");

  if (!existing) {
    const activeDeviceCount = await db.offlineDevice.count({
      where: { organizationId: tenant.organizationId, userId: tenant.userId, status: "ACTIVE" },
    });
    if (activeDeviceCount >= OFFLINE_SYNC_LIMITS.maximumActiveDevicesPerUser) {
      throw new OfflineMutationDeniedError("The maximum number of active desktop devices has been reached.");
    }
  }

  const now = new Date();
  const placeholderHash = createOfflineToken(`pending${now.getTime()}`).hash;
  const device = existing
    ? await db.offlineDevice.update({
        where: { id: existing.id },
        data: {
          name: input.name,
          platform: input.platform,
          moduleKeys,
          membershipId: membership.id,
          tokenHash: placeholderHash,
          tokenExpiresAt: addDays(now, OFFLINE_SYNC_LIMITS.tokenLifetimeDays),
          offlineAccessUntil: addHours(now, OFFLINE_SYNC_LIMITS.offlineAccessHours),
          lastSeenAt: now,
        },
      })
    : await db.offlineDevice.create({
        data: {
          organizationId: tenant.organizationId,
          userId: tenant.userId,
          membershipId: membership.id,
          installationId: input.installationId,
          name: input.name,
          platform: input.platform,
          moduleKeys,
          tokenHash: placeholderHash,
          tokenExpiresAt: addDays(now, OFFLINE_SYNC_LIMITS.tokenLifetimeDays),
          offlineAccessUntil: addHours(now, OFFLINE_SYNC_LIMITS.offlineAccessHours),
          lastSeenAt: now,
        },
      });

  const credential = createOfflineToken(device.id);
  await db.offlineDevice.update({ where: { id: device.id }, data: { tokenHash: credential.hash } });
  await logAuditEvent({
    organizationId: tenant.organizationId,
    userId: tenant.userId,
    membershipId: membership.id,
    module: "administration",
    action: existing ? "offline_device.reactivated" : "offline_device.activated",
    entityName: "OfflineDevice",
    entityId: device.id,
    metadata: { name: input.name, platform: input.platform, moduleKeys },
  });

  return {
    deviceId: device.id,
    organizationId: tenant.organizationId,
    organizationName: tenant.organization.name,
    userId: tenant.userId,
    userName: membership.user.name ?? membership.user.email,
    token: credential.token,
    tokenExpiresAt: device.tokenExpiresAt.toISOString(),
    offlineAccessUntil: device.offlineAccessUntil.toISOString(),
    moduleKeys,
  };
}

function storedMutationResult(mutation: {
  mutationId: string;
  status: string;
  result: Prisma.JsonValue | null;
  errorCode: string | null;
}) {
  return {
    mutationId: mutation.mutationId,
    status: mutation.status.toLowerCase(),
    result: mutation.result,
    errorCode: mutation.errorCode,
  };
}

export async function processOfflineMutation(context: OfflineDeviceContext, input: OfflineMutationInput) {
  if (input.organizationId !== context.device.organizationId) {
    throw new OfflineMutationDeniedError("The mutation organization does not match the activated device.");
  }
  if (!context.authorizedModuleKeys.includes(input.moduleKey)) {
    throw new OfflineMutationDeniedError("This module is not available to the activated device.");
  }
  if (!input.entityType.startsWith(`${input.moduleKey}.`)) {
    throw new OfflineMutationDeniedError("The entity does not belong to the declared module.");
  }
  if (Buffer.byteLength(JSON.stringify(input.payload), "utf8") > OFFLINE_SYNC_LIMITS.maximumPayloadBytes) {
    throw new OfflineMutationDeniedError("The offline payload is too large.");
  }

  const unique = { organizationId_mutationId: { organizationId: context.device.organizationId, mutationId: input.mutationId } };
  const existing = await db.offlineMutation.findUnique({ where: unique });
  if (existing) {
    if (existing.deviceId !== context.device.id || existing.userId !== context.device.userId) {
      throw new OfflineMutationDeniedError("The mutation identifier is already owned by another device.");
    }
    return storedMutationResult(existing);
  }

  let ledger;
  try {
    ledger = await db.offlineMutation.create({
      data: {
        organizationId: context.device.organizationId,
        deviceId: context.device.id,
        userId: context.device.userId,
        mutationId: input.mutationId,
        moduleKey: input.moduleKey,
        entityType: input.entityType,
        entityId: input.entityId,
        operation: input.operation,
        baseVersion: input.baseVersion,
        payload: input.payload as Prisma.InputJsonValue,
        changedAt: input.changedAt,
      },
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const raced = await db.offlineMutation.findUniqueOrThrow({ where: unique });
      if (raced.deviceId !== context.device.id || raced.userId !== context.device.userId) {
        throw new OfflineMutationDeniedError("The mutation identifier is already owned by another device.");
      }
      return storedMutationResult(raced);
    }
    throw error;
  }

  try {
    const result = await applyOfflineMutation(context.tenant, input);
    const applied = await db.offlineMutation.update({
      where: { id: ledger.id },
      data: { status: "APPLIED", result: result as Prisma.InputJsonValue, appliedAt: new Date() },
    });
    await logAuditEvent({
      organizationId: context.device.organizationId,
      userId: context.device.userId,
      membershipId: context.device.membershipId,
      module: input.moduleKey,
      action: "offline_mutation.applied",
      entityName: input.entityType,
      entityId: input.entityId,
      metadata: { deviceId: context.device.id, mutationId: input.mutationId },
    });
    return storedMutationResult(applied);
  } catch (error) {
    if (error instanceof OfflineMutationDeniedError) {
      const rejected = await db.offlineMutation.update({
        where: { id: ledger.id },
        data: { status: "REJECTED", errorCode: "ACCESS_REVOKED", result: { message: error.message } },
      });
      await logAuditEvent({
        organizationId: context.device.organizationId,
        userId: context.device.userId,
        membershipId: context.device.membershipId,
        module: input.moduleKey,
        action: "offline_mutation.rejected",
        entityName: input.entityType,
        entityId: input.entityId,
        status: "FAILURE",
        metadata: { deviceId: context.device.id, mutationId: input.mutationId, errorCode: "ACCESS_REVOKED" },
      });
      return storedMutationResult(rejected);
    }

    const conflict = error instanceof OfflineMutationConflictError
      ? error
      : new OfflineMutationConflictError("The operation could not be synchronized safely.", "SERVER_STATE_CHANGED");
    const conflicted = await db.$transaction(async (tx) => {
      const conflictRecord = await tx.offlineConflict.create({
        data: {
          organizationId: context.device.organizationId,
          deviceId: context.device.id,
          mutationId: ledger.id,
          conflictType: conflict.conflictType,
          allowedResolutions: ["KEEP_CLOUD"],
        },
      });
      const updated = await tx.offlineMutation.update({
        where: { id: ledger.id },
        data: {
          status: "CONFLICT",
          errorCode: conflict.conflictType,
          result: { message: conflict.message, conflictId: conflictRecord.id, allowedResolutions: conflictRecord.allowedResolutions },
        },
      });
      return updated;
    });
    await logAuditEvent({
      organizationId: context.device.organizationId,
      userId: context.device.userId,
      membershipId: context.device.membershipId,
      module: input.moduleKey,
      action: "offline_mutation.conflict",
      entityName: input.entityType,
      entityId: input.entityId,
      status: "FAILURE",
      metadata: { deviceId: context.device.id, mutationId: input.mutationId, conflictType: conflict.conflictType },
    });
    return storedMutationResult(conflicted);
  }
}

/**
 * Builds the device's pull response as a flat, per-entity row list rather
 * than one nested blob per module (see snapshot-builders/types.ts). Each
 * module's builder owns its own row-level scoping (driver-assigned
 * vehicles, staff-owned accounts, POS-session-linked warehouses, etc.) -
 * this function only decides *which* builders run, based on the same
 * `authorizedModuleKeys` gating as before, and flattens their results.
 */
export async function buildOfflineSnapshot(context: OfflineDeviceContext) {
  const builders: Promise<{ rows: OfflineSnapshotRow[]; truncated: boolean }>[] = [];

  if (context.authorizedModuleKeys.includes("fleet")) builders.push(buildFleetSnapshot(context));
  if (context.authorizedModuleKeys.includes("installment")) builders.push(buildInstallmentSnapshot(context));
  if (context.authorizedModuleKeys.includes("inventory") || context.authorizedModuleKeys.includes("pos")) {
    builders.push(buildInventorySnapshot(context, context.authorizedModuleKeys));
  }
  if (context.authorizedModuleKeys.includes("pos")) builders.push(buildPosSnapshot(context));

  const results = await Promise.all(builders);
  const rows = results.flatMap((result) => result.rows);
  const truncated = results.some((result) => result.truncated);

  await db.offlineDevice.update({ where: { id: context.device.id }, data: { lastSyncAt: new Date() } });
  return {
    generatedAt: new Date().toISOString(),
    offlineAccessUntil: context.device.offlineAccessUntil.toISOString(),
    fullSnapshot: true,
    truncated,
    rows,
  };
}
