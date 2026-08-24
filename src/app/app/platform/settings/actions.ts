"use server";

import { redirect } from "next/navigation";
import { revalidatePath, updateTag } from "next/cache";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { logAuditEvent } from "@/lib/audit";
import { isValidProfileImage } from "@/lib/profile-image";
import { readPlatformMarketing, PUBLIC_MARKETING_CACHE_TAG } from "@/lib/platform-marketing";
import { requireCurrentTenant } from "@/lib/tenant";
import { isPlatformOperator } from "@/lib/auth/permissions";

const marketingSchema = z.object({
  organizationDeletionRecoveryDays: z.coerce.number().int().min(1).max(365),
  showcaseEnabled: z.boolean(),
  showIndustry: z.boolean(),
  eyebrow: z.string().trim().min(2).max(60),
  headline: z.string().trim().min(5).max(140),
  description: z.string().trim().min(5).max(240),
  salesEmail: z.union([z.string().trim().email().max(320), z.literal("")]),
  supportEmail: z.union([z.string().trim().email().max(320), z.literal("")]),
  publicPhone: z.string().trim().max(40),
  publicWhatsapp: z.string().trim().max(40),
});

const customerSchema = z.object({
  customerId: z.string().uuid().optional(),
  name: z.string().trim().min(2).max(120),
  industry: z.string().trim().max(100),
  quote: z.string().trim().min(5).max(320),
  attribution: z.string().trim().min(2).max(120),
  enabled: z.boolean(),
});

async function requirePlatformContext() {
  const tenant = await requireCurrentTenant();
  if (!isPlatformOperator(tenant)) redirect("/app/dashboard");
  const organization = await db.organization.findUnique({
    where: { id: tenant.organizationId },
    select: { metadata: true },
  });
  const metadata = organization?.metadata && typeof organization.metadata === "object" && !Array.isArray(organization.metadata)
    ? { ...(organization.metadata as Record<string, unknown>) }
    : {};
  return { tenant, metadata };
}

function publicMarketingInput(settings: ReturnType<typeof readPlatformMarketing>) {
  return {
    showcaseEnabled: settings.showcaseEnabled,
    showIndustry: settings.showIndustry,
    eyebrow: settings.eyebrow,
    headline: settings.headline,
    description: settings.description,
    externalCustomers: settings.externalCustomers,
  };
}

async function persistMetadata(organizationId: string, metadata: Record<string, unknown>) {
  await db.organization.update({
    where: { id: organizationId },
    data: { metadata: metadata as Prisma.InputJsonValue },
  });
}

function revalidateSettingsAndMarketing() {
  revalidatePath("/app/platform/settings");
  revalidatePath("/");
  updateTag(PUBLIC_MARKETING_CACHE_TAG);
}

export async function updatePlatformSettings(formData: FormData): Promise<void> {
  const { tenant, metadata } = await requirePlatformContext();
  const parsed = marketingSchema.safeParse({
    organizationDeletionRecoveryDays: formData.get("organizationDeletionRecoveryDays"),
    showcaseEnabled: formData.get("showcaseEnabled") === "on",
    showIndustry: formData.get("showIndustry") === "on",
    eyebrow: String(formData.get("eyebrow") ?? ""),
    headline: String(formData.get("headline") ?? ""),
    description: String(formData.get("description") ?? ""),
    salesEmail: String(formData.get("salesEmail") ?? ""),
    supportEmail: String(formData.get("supportEmail") ?? ""),
    publicPhone: String(formData.get("publicPhone") ?? ""),
    publicWhatsapp: String(formData.get("publicWhatsapp") ?? ""),
  });
  if (!parsed.success) redirect("/app/platform/settings?error=invalid-settings");
  const current = readPlatformMarketing(metadata);
  metadata.organizationDeletionRecoveryDays = parsed.data.organizationDeletionRecoveryDays;
  metadata.publicContact = { salesEmail: parsed.data.salesEmail, supportEmail: parsed.data.supportEmail, phone: parsed.data.publicPhone, whatsapp: parsed.data.publicWhatsapp };
  metadata.publicMarketing = {
    ...publicMarketingInput(current),
    showcaseEnabled: parsed.data.showcaseEnabled,
    showIndustry: parsed.data.showIndustry,
    eyebrow: parsed.data.eyebrow,
    headline: parsed.data.headline,
    description: parsed.data.description,
  };
  await persistMetadata(tenant.organizationId, metadata);
  await logAuditEvent({
    organizationId: tenant.organizationId,
    userId: tenant.userId,
    module: "platform",
    action: "platform.settings_updated",
    entityName: "Organization",
    entityId: tenant.organizationId,
    metadata: { showcaseEnabled: parsed.data.showcaseEnabled, showIndustry: parsed.data.showIndustry, publicContactUpdated: true },
  });
  revalidateSettingsAndMarketing();
  redirect("/app/platform/settings?saved=settings");
}

export async function saveExternalShowcaseCustomer(formData: FormData): Promise<void> {
  const { tenant, metadata } = await requirePlatformContext();
  const rawId = String(formData.get("customerId") ?? "").trim();
  const parsed = customerSchema.safeParse({
    customerId: rawId || undefined,
    name: String(formData.get("name") ?? ""),
    industry: String(formData.get("industry") ?? ""),
    quote: String(formData.get("quote") ?? ""),
    attribution: String(formData.get("attribution") ?? ""),
    enabled: formData.get("enabled") === "on",
  });
  if (!parsed.success) redirect("/app/platform/settings?error=invalid-customer#external-customers");
  const current = readPlatformMarketing(metadata);
  const existingIndex = parsed.data.customerId
    ? current.externalCustomers.findIndex((customer) => customer.id === parsed.data.customerId)
    : -1;
  if (parsed.data.customerId && existingIndex < 0) redirect("/app/platform/settings?error=customer-not-found#external-customers");
  const file = formData.get("logo");
  const hasNewLogo = file instanceof File && file.size > 0;
  if (hasNewLogo && !isValidProfileImage(file)) redirect("/app/platform/settings?error=invalid-logo#external-customers");
  if (existingIndex < 0 && !hasNewLogo) redirect("/app/platform/settings?error=logo-required#external-customers");
  const logoUrl = hasNewLogo
    ? `data:${file.type};base64,${Buffer.from(await file.arrayBuffer()).toString("base64")}`
    : current.externalCustomers[existingIndex].logoUrl;
  const customer = {
    id: parsed.data.customerId ?? crypto.randomUUID(),
    name: parsed.data.name,
    industry: parsed.data.industry,
    quote: parsed.data.quote,
    attribution: parsed.data.attribution,
    enabled: parsed.data.enabled,
    logoUrl,
  };
  const externalCustomers = [...current.externalCustomers];
  if (existingIndex >= 0) externalCustomers[existingIndex] = customer;
  else externalCustomers.push(customer);
  metadata.publicMarketing = { ...publicMarketingInput(current), externalCustomers };
  await persistMetadata(tenant.organizationId, metadata);
  await logAuditEvent({
    organizationId: tenant.organizationId,
    userId: tenant.userId,
    module: "platform",
    action: existingIndex >= 0 ? "platform.showcase_customer_updated" : "platform.showcase_customer_created",
    entityName: "ExternalShowcaseCustomer",
    entityId: customer.id,
    metadata: { name: customer.name, enabled: customer.enabled },
  });
  revalidateSettingsAndMarketing();
  redirect("/app/platform/settings?saved=customer#external-customers");
}

export async function moveExternalShowcaseCustomer(formData: FormData): Promise<void> {
  const { tenant, metadata } = await requirePlatformContext();
  const id = String(formData.get("customerId") ?? "");
  const direction = formData.get("direction") === "up" ? -1 : 1;
  const current = readPlatformMarketing(metadata);
  const index = current.externalCustomers.findIndex((customer) => customer.id === id);
  const destination = index + direction;
  if (index < 0 || destination < 0 || destination >= current.externalCustomers.length) {
    redirect("/app/platform/settings#external-customers");
  }
  const externalCustomers = [...current.externalCustomers];
  [externalCustomers[index], externalCustomers[destination]] = [externalCustomers[destination], externalCustomers[index]];
  metadata.publicMarketing = { ...publicMarketingInput(current), externalCustomers };
  await persistMetadata(tenant.organizationId, metadata);
  await logAuditEvent({
    organizationId: tenant.organizationId,
    userId: tenant.userId,
    module: "platform",
    action: "platform.showcase_customer_reordered",
    entityName: "ExternalShowcaseCustomer",
    entityId: id,
    metadata: { direction: direction < 0 ? "up" : "down" },
  });
  revalidateSettingsAndMarketing();
  redirect("/app/platform/settings?saved=order#external-customers");
}

export async function deleteExternalShowcaseCustomer(formData: FormData): Promise<void> {
  const { tenant, metadata } = await requirePlatformContext();
  const id = String(formData.get("customerId") ?? "");
  const current = readPlatformMarketing(metadata);
  const customer = current.externalCustomers.find((entry) => entry.id === id);
  if (!customer) redirect("/app/platform/settings?error=customer-not-found#external-customers");
  metadata.publicMarketing = {
    ...publicMarketingInput(current),
    externalCustomers: current.externalCustomers.filter((entry) => entry.id !== id),
  };
  await persistMetadata(tenant.organizationId, metadata);
  await logAuditEvent({
    organizationId: tenant.organizationId,
    userId: tenant.userId,
    module: "platform",
    action: "platform.showcase_customer_deleted",
    entityName: "ExternalShowcaseCustomer",
    entityId: id,
    metadata: { name: customer.name },
  });
  revalidateSettingsAndMarketing();
  redirect("/app/platform/settings?saved=deleted#external-customers");
}
