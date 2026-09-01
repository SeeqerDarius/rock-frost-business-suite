"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireCurrentTenant } from "@/lib/tenant";
import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import type { Prisma } from "@prisma/client";
import { logAuditEvent } from "@/lib/audit";

const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_IMAGE_BYTES = 1024 * 1024;

function objectMetadata(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? { ...(value as Record<string, unknown>) } : {};
}

async function authorizedTenant() {
  const tenant = await requireCurrentTenant();
  if (!hasPermission(tenant, PERMISSIONS.ORG_SETTINGS_MANAGE)) redirect("/app/dashboard");
  return tenant;
}

export async function updateWorkspaceSettings(formData: FormData): Promise<void> {
  const tenant = await authorizedTenant();
  const theme = String(formData.get("theme"));
  const backupFrequency = String(formData.get("backupFrequency"));
  const recoveryDays = Number(formData.get("recoveryDays"));
  const backupRetentionDays = Number(formData.get("backupRetentionDays"));
  if (!["system", "light", "dark"].includes(theme) ||
      !["daily", "weekly", "monthly"].includes(backupFrequency) ||
      !Number.isInteger(recoveryDays) || recoveryDays < 1 || recoveryDays > 365 ||
      !Number.isInteger(backupRetentionDays) || backupRetentionDays < 1 || backupRetentionDays > 365) {
    redirect("/app/organization/settings?error=invalid");
  }
  const organization = await db.organization.findUnique({
    where: { id: tenant.organizationId },
    select: { metadata: true },
  });
  const metadata = objectMetadata(organization?.metadata);
  metadata.workspaceSettings = {
    theme,
    backupFrequency,
    recoveryDays,
    backupRetentionDays,
    dataRecoveryEnabled: formData.get("dataRecoveryEnabled") === "on",
  };
  await db.organization.update({
    where: { id: tenant.organizationId },
    data: { metadata: metadata as Prisma.InputJsonValue },
  });
  revalidatePath("/app");
  redirect("/app/organization/settings?saved=1");
}

export async function uploadCompanyLogo(formData: FormData): Promise<void> {
  const tenant = await authorizedTenant();
  const file = formData.get("logo");
  if (!(file instanceof File) || !file.size || file.size > MAX_IMAGE_BYTES || !IMAGE_TYPES.has(file.type)) {
    redirect("/app/organization/settings?error=image");
  }
  const logoUrl = `data:${file.type};base64,${Buffer.from(await file.arrayBuffer()).toString("base64")}`;
  await db.organization.update({ where: { id: tenant.organizationId }, data: { logoUrl } });
  revalidatePath("/app");
  redirect("/app/organization/settings?saved=logo");
}

export async function updateOfflineAccessSettings(formData: FormData): Promise<void> {
  const tenant = await authorizedTenant();
  const leaseHours = Number(formData.get("offlineLeaseHours"));
  const requestedModules = formData.getAll("offlineModule").map(String);
  if (!Number.isInteger(leaseHours) || leaseHours < 1 || leaseHours > 24 || requestedModules.some((key) => !tenant.accessibleModuleKeys.includes(key))) {
    redirect("/app/organization/settings?error=offline");
  }
  const organization = await db.organization.findUnique({ where: { id: tenant.organizationId }, select: { metadata: true } });
  const metadata = objectMetadata(organization?.metadata);
  metadata.offlineAccess = {
    enabled: formData.get("offlineEnabled") === "on",
    mutationKillSwitch: formData.get("offlineMutationEnabled") !== "on",
    moduleKeys: [...new Set(requestedModules)],
    leaseHours,
  };
  await db.organization.update({ where: { id: tenant.organizationId }, data: { metadata: metadata as Prisma.InputJsonValue } });
  await logAuditEvent({ organizationId: tenant.organizationId, userId: tenant.userId, module: "administration", action: "offline_access.policy_updated", entityName: "Organization", entityId: tenant.organizationId, metadata: metadata.offlineAccess as Record<string, unknown> });
  revalidatePath("/app");
  redirect("/app/organization/settings?saved=offline");
}
