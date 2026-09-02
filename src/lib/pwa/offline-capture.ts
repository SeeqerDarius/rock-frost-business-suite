"use client";

import { enqueueOfflineOperation, ensureOfflineCapacity, getOfflineDeviceRegistration, putOfflineAttachment, putOfflineWorkPack } from "@/lib/pwa/indexed-db";
import type { OfflineOperation, OfflineWorkPack } from "@/lib/pwa/types";

export async function captureOfflineOperation(
  organizationId: string,
  userId: string,
  input: Omit<OfflineOperation, "operationId" | "organizationId" | "userId" | "deviceId" | "idempotencyKey" | "clientTimestamp" | "status" | "attempts" | "nextAttemptAt">,
  files: File[] = [],
) {
  const registration = await getOfflineDeviceRegistration(organizationId, userId);
  if (!registration || !registration.moduleKeys.includes(input.module) || registration.mutationKillSwitch || Date.parse(registration.offlineAccessUntil) <= Date.now()) throw new Error("Offline capture is not authorized for this module on this device.");
  await ensureOfflineCapacity(files.reduce((sum, file) => sum + file.size, JSON.stringify(input.payload).length));
  const operationId = crypto.randomUUID();
  const attachmentReferences: string[] = [];
  for (const file of files) {
    if (file.size > 5 * 1024 * 1024 || !["image/jpeg", "image/png", "image/webp", "application/pdf"].includes(file.type)) throw new Error("Attachments must be JPEG, PNG, WebP, or PDF files no larger than 5 MB.");
    const attachmentId = crypto.randomUUID();
    attachmentReferences.push(attachmentId);
    await putOfflineAttachment({ attachmentId, organizationId, userId, module: input.module, deviceId: registration.deviceId, operationId, fileName: file.name, mimeType: file.type, size: file.size, blob: file, createdAt: new Date().toISOString(), status: "pending" });
  }
  const now = new Date().toISOString();
  const operation: OfflineOperation = { ...input, operationId, organizationId, userId, deviceId: registration.deviceId, idempotencyKey: operationId, clientTimestamp: now, attachmentReferences: [...input.attachmentReferences, ...attachmentReferences], status: "pending", attempts: 0, nextAttemptAt: now };
  await enqueueOfflineOperation(operation);
  return operation;
}

export async function downloadOfflineWorkPack(organizationId: string, userId: string, module: string) {
  const registration = await getOfflineDeviceRegistration(organizationId, userId);
  if (!registration || !registration.moduleKeys.includes(module)) throw new Error("This module is not authorized for offline access.");
  const response = await fetch(`/api/offline/work-packs?module=${encodeURIComponent(module)}&deviceId=${encodeURIComponent(registration.deviceId)}`, { cache: "no-store" });
  if (!response.ok) throw new Error(`Work-pack download failed with HTTP ${response.status}.`);
  const data = await response.json() as Omit<OfflineWorkPack, "key" | "organizationId" | "userId" | "deviceId" | "workPackType" | "title" | "downloadedAt" | "sizeBytes">;
  const serialized = JSON.stringify(data.records);
  await ensureOfflineCapacity(serialized.length);
  const workPack: OfflineWorkPack = { ...data, key: `${organizationId}:${userId}:${module}:${data.workPackId}`, organizationId, userId, deviceId: registration.deviceId, workPackType: `${module}-authorized`, title: `${module} offline work pack`, downloadedAt: new Date().toISOString(), sizeBytes: new Blob([serialized]).size };
  await putOfflineWorkPack(workPack);
  return workPack;
}
