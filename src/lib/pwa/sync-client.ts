"use client";

import { getOfflineDeviceRegistration, listOfflineAttachments, listOfflineOperations, purgeOfflineModuleData, putOfflineAttachment, putOfflineConflict, putOfflineOperation, putOfflineSyncAttempt, removeOfflineAttachment, removeOfflineOperation } from "@/lib/pwa/indexed-db";
import type { OfflineConflictRecord, OfflineOperation } from "@/lib/pwa/types";

function encode(bytes: ArrayBuffer) {
  const binary = String.fromCharCode(...new Uint8Array(bytes));
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

export async function signedOfflineFetch(organizationId: string, userId: string, url: string, body: string) {
  const registration = await getOfflineDeviceRegistration(organizationId, userId);
  if (!registration?.signingPrivateKey) throw new Error("This offline device must reconnect and renew its authorization.");
  const key = await crypto.subtle.importKey("jwk", registration.signingPrivateKey, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
  const timestamp = new Date().toISOString();
  const signature = await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key, new TextEncoder().encode(`${timestamp}\n${body}`));
  return fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-rf-offline-timestamp": timestamp,
      "x-rf-offline-signature": encode(signature),
    },
    body,
  });
}

async function blobToBase64(blob: Blob) {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 32_768) binary += String.fromCharCode(...bytes.subarray(offset, offset + 32_768));
  return btoa(binary);
}

async function uploadDependencies(organizationId: string, userId: string, operation: OfflineOperation) {
  if (!operation.attachmentReferences.length) return operation;
  const registration = await getOfflineDeviceRegistration(organizationId, userId);
  if (!registration) throw new Error("Offline device registration is unavailable.");
  const attachments = await listOfflineAttachments(organizationId, userId);
  const serverIds: string[] = [];
  for (const reference of operation.attachmentReferences) {
    const attachment = attachments.find((item) => item.attachmentId === reference);
    if (!attachment) { serverIds.push(reference); continue; }
    await putOfflineAttachment({ ...attachment, status: "uploading" });
    const body = JSON.stringify({ deviceId: registration.deviceId, clientId: attachment.attachmentId, module: attachment.module, fileName: attachment.fileName, mimeType: attachment.mimeType, size: attachment.size, data: await blobToBase64(attachment.blob) });
    const response = await signedOfflineFetch(organizationId, userId, "/api/offline/attachments", body);
    if (!response.ok) {
      await putOfflineAttachment({ ...attachment, status: response.status < 500 ? "rejected" : "pending", lastError: `Upload failed with HTTP ${response.status}.` });
      throw new Error(`Attachment upload failed with HTTP ${response.status}.`);
    }
    const uploaded = await response.json() as { attachmentId: string };
    serverIds.push(uploaded.attachmentId);
    await putOfflineAttachment({ ...attachment, status: "uploaded", uploadToken: uploaded.attachmentId });
  }
  const updated = { ...operation, attachmentReferences: serverIds };
  await putOfflineOperation(updated);
  return updated;
}

async function synchronizeUnlocked(organizationId: string, userId: string) {
  const now = Date.now();
  const operations = (await listOfflineOperations(organizationId, userId)).filter((operation) => operation.status === "pending" && Date.parse(operation.nextAttemptAt) <= now);
  if (!operations.length) return [];
  const attemptId = crypto.randomUUID();
  await putOfflineSyncAttempt({ attemptId, organizationId, userId, deviceId: operations[0].deviceId, startedAt: new Date().toISOString(), operationCount: operations.length, outcome: "running" });
  try {
    const ready: OfflineOperation[] = [];
    for (const operation of operations) ready.push(await uploadDependencies(organizationId, userId, operation));
    const body = JSON.stringify({ operations: ready });
    const response = await signedOfflineFetch(organizationId, userId, "/api/offline/sync", body);
    if (!response.ok) throw new Error(`Offline synchronization failed with HTTP ${response.status}.`);
    const payload = await response.json() as { results: Array<{ operationId: string; status: "applied" | "rejected" | "conflict" | "synchronizing"; errorCode?: string; result?: unknown }> };
    for (const result of payload.results) {
      const operation = ready.find((entry) => entry.operationId === result.operationId);
      if (!operation) continue;
      if (result.status === "applied") {
        await removeOfflineOperation(result.operationId);
        for (const attachment of await listOfflineAttachments(organizationId, userId)) if (attachment.operationId === result.operationId) await removeOfflineAttachment(attachment.attachmentId);
      } else {
        if (["access-revoked", "permission-revoked", "membership-inactive", "module-unavailable"].includes(result.errorCode ?? "")) {
          await purgeOfflineModuleData(organizationId, userId, operation.module);
          continue;
        }
        const attempts = operation.attempts + 1;
        const retryable = result.status === "synchronizing";
        await putOfflineOperation({ ...operation, status: retryable ? "pending" : result.status, attempts, nextAttemptAt: new Date(Date.now() + Math.min(60_000, 1000 * 2 ** attempts)).toISOString(), lastError: result.errorCode ?? result.status });
      }
    }
    const conflictResponse = await fetch("/api/offline/conflicts", { cache: "no-store" });
    if (conflictResponse.ok) {
      const data = await conflictResponse.json() as { conflicts: OfflineConflictRecord[] };
      for (const conflict of data.conflicts) await putOfflineConflict({ ...conflict, organizationId, userId, deviceId: operations[0].deviceId });
    }
    const partial = payload.results.some((result) => result.status !== "applied");
    await putOfflineSyncAttempt({ attemptId, organizationId, userId, deviceId: operations[0].deviceId, startedAt: new Date(now).toISOString(), finishedAt: new Date().toISOString(), operationCount: operations.length, outcome: partial ? "partial" : "succeeded" });
    new BroadcastChannel("rock-frost-offline-sync").postMessage({ type: "sync-complete", organizationId, userId });
    return payload.results;
  } catch (error) {
    await putOfflineSyncAttempt({ attemptId, organizationId, userId, deviceId: operations[0].deviceId, startedAt: new Date(now).toISOString(), finishedAt: new Date().toISOString(), operationCount: operations.length, outcome: "failed", errorCode: error instanceof Error ? error.message : "sync-failed" });
    throw error;
  }
}

export async function synchronizeOfflineOperations(organizationId: string, userId: string) {
  if (navigator.locks) return navigator.locks.request(`rock-frost-sync:${organizationId}:${userId}`, () => synchronizeUnlocked(organizationId, userId));
  return synchronizeUnlocked(organizationId, userId);
}
