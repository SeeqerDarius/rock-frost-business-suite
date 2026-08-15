"use server";

import { revalidatePath } from "next/cache";
import { getCurrentTenant } from "@/lib/tenant";
import { createOfflineActivationCode } from "@/lib/offline-sync/service";
import { OFFLINE_SUPPORTED_MODULES, type OfflineSupportedModule } from "@/lib/offline-sync/contract";
import { OfflineMutationDeniedError } from "@/lib/offline-sync/adapters";
import { db } from "@/lib/db";
import { logAuditEvent } from "@/lib/audit";

export interface ActivationCodeState {
  code?: string;
  expiresAt?: string;
  error?: string;
}

export async function generateDesktopActivationCode(
  _previousState: ActivationCodeState,
  formData: FormData,
): Promise<ActivationCodeState> {
  const tenant = await getCurrentTenant();
  if (!tenant) return { error: "Sign in again before activating a desktop device." };
  const requested = OFFLINE_SUPPORTED_MODULES.filter((key) => formData.getAll("moduleKeys").includes(key));
  try {
    return await createOfflineActivationCode(tenant, requested as OfflineSupportedModule[]);
  } catch (error) {
    if (error instanceof OfflineMutationDeniedError) return { error: error.message };
    console.error("Could not create desktop activation code", { error });
    return { error: "Could not create an activation code." };
  }
}

export async function revokeDesktopDevice(formData: FormData) {
  const tenant = await getCurrentTenant();
  if (!tenant) return;
  const deviceId = String(formData.get("deviceId") ?? "");
  const device = await db.offlineDevice.findFirst({
    where: { id: deviceId, organizationId: tenant.organizationId, userId: tenant.userId, status: "ACTIVE" },
  });
  if (!device) return;
  await db.offlineDevice.update({
    where: { id: device.id },
    data: { status: "REVOKED", revokedAt: new Date(), revokedById: tenant.userId },
  });
  await logAuditEvent({
    organizationId: tenant.organizationId,
    userId: tenant.userId,
    module: "administration",
    action: "offline_device.revoked",
    entityName: "OfflineDevice",
    entityId: device.id,
    metadata: { name: device.name, platform: device.platform },
  });
  revalidatePath("/app/account/desktop");
}
