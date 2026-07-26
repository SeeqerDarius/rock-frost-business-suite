"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { logAuditEvent } from "@/lib/audit";
import { buildAppUrl } from "@/lib/app-url";
import { sendEmail } from "@/lib/email";
import {
  createInvitation,
  markInvitationDeliveryFailed,
  resendInvitation,
} from "@/lib/auth/invitations";
import { isPlatformOperator } from "@/lib/auth/permissions";
import { verifyCurrentPassword } from "@/lib/auth/verify-password";
import { requireCurrentTenant } from "@/lib/tenant";
import { cuid, email, escapeHtml, longText, parseWithSchema, shortText } from "@/lib/validation";
import { createModuleRequest } from "@/platform/module-requests/service";
import { isPlatformUser } from "@/lib/auth/platform-identity";

const tenantCode = z.string().trim().toLowerCase().min(3).max(50).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
const optionalText = z.union([shortText, z.literal("")]);

const organizationSchema = z.object({
  organizationId: z.union([cuid, z.literal("")]).optional(),
  name: shortText,
  tenantCode,
  industry: optionalText,
  billingEmail: z.union([email, z.literal("")]),
  email: z.union([email, z.literal("")]),
  phone: optionalText,
  website: optionalText,
  country: optionalText,
  region: optionalText,
  city: optionalText,
  address: z.union([longText, z.literal("")]),
  currency: z.string().trim().min(3).max(3).transform((value) => value.toUpperCase()),
  timezone: z.string().trim().min(1).max(100),
  defaultLanguage: z.string().trim().min(2).max(20),
});

const createSchema = organizationSchema.extend({
  tenantCode: tenantCode.optional(),
  ownerEmail: email,
  contactSubmissionId: z.union([cuid, z.literal("")]).optional(),
});
const statusSchema = z.object({
  organizationId: cuid,
  status: z.enum(["TRIAL", "ACTIVE", "SUSPENDED", "CANCELLED"]),
});
const deletionSchema = z.object({
  organizationId: cuid,
  confirmTenantCode: tenantCode,
  confirmPassword: z.string().min(1).max(200),
});

class PlatformOwnerTenantError extends Error {}

async function requireOperator() {
  const tenant = await requireCurrentTenant();
  if (!isPlatformOperator(tenant)) redirect("/app/dashboard");
  return tenant;
}

async function assertNotPlatformAnchor(organizationId: string) {
  const platformMember = await db.organizationMember.findFirst({
    where: {
      organizationId,
      status: "ACTIVE",
      role: { name: "Super Admin", isSystem: true, organizationId: null },
    },
    select: { id: true },
  });
  if (platformMember) throw new Error("platform-anchor");
}

function organizationData(data: z.infer<typeof organizationSchema>) {
  return {
    name: data.name,
    tenantCode: data.tenantCode,
    industry: data.industry || null,
    billingEmail: data.billingEmail || null,
    email: data.email || null,
    phone: data.phone || null,
    website: data.website || null,
    country: data.country || null,
    region: data.region || null,
    city: data.city || null,
    address: data.address || null,
    currency: data.currency,
    timezone: data.timezone,
    defaultLanguage: data.defaultLanguage,
  };
}

async function generateTenantCode(name: string) {
  const base = name.toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 42) || "organization";
  for (let suffix = 0; suffix < 1000; suffix += 1) {
    const candidate = suffix === 0 ? base : `${base}-${suffix + 1}`;
    if (!(await db.organization.findUnique({ where: { tenantCode: candidate }, select: { id: true } }))) return candidate;
  }
  return `${base}-${Date.now().toString(36)}`;
}

export async function createOrganization(formData: FormData): Promise<void> {
  const tenant = await requireOperator();
  const parsed = parseWithSchema(createSchema, Object.fromEntries(formData));
  if (!parsed.success) redirect("/app/platform/organizations/new?error=invalid");
  const generatedTenantCode = await generateTenantCode(parsed.data.name);
  const existingOwner = await db.user.findUnique({
    where: { email: parsed.data.ownerEmail },
    select: { id: true },
  });
  if (existingOwner && await isPlatformUser(existingOwner.id)) {
    redirect("/app/platform/organizations/new?error=platform-owner");
  }

  const contactSubmission = parsed.data.contactSubmissionId
    ? await db.contactSubmission.findFirst({
        where: { id: parsed.data.contactSubmissionId, status: "NEW" },
        include: { module: true },
      })
    : null;
  if (parsed.data.contactSubmissionId && !contactSubmission) {
    redirect("/app/platform/organizations/new?error=inquiry");
  }

  const ownerRole = await db.role.findFirst({
    where: { organizationId: null, isSystem: true, name: "Organization Owner" },
  });
  if (!ownerRole) redirect("/app/platform/organizations/new?error=owner-role");

  let result: { organizationId: string; membershipId: string; ownerUserId: string };
  try {
    result = await db.$transaction(async (tx) => {
      const organization = await tx.organization.create({
        data: { ...organizationData({ ...parsed.data, tenantCode: generatedTenantCode }), status: "TRIAL" },
      });
      const owner = await tx.user.upsert({
        where: { email: parsed.data.ownerEmail },
        update: {},
        create: { email: parsed.data.ownerEmail, status: "INVITED" },
      });
      if (await isPlatformUser(owner.id, tx)) {
        throw new PlatformOwnerTenantError();
      }
      const membership = await tx.organizationMember.create({
        data: {
          organizationId: organization.id,
          userId: owner.id,
          roleId: ownerRole.id,
          status: "INVITED",
        },
      });
      await logAuditEvent(
        {
          organizationId: organization.id,
          userId: tenant.userId,
          module: "platform",
          action: "organization.created",
          entityName: "Organization",
          entityId: organization.id,
          metadata: { name: organization.name, tenantCode: generatedTenantCode, ownerEmail: parsed.data.ownerEmail },
        },
        tx,
      );
      return { organizationId: organization.id, membershipId: membership.id, ownerUserId: owner.id };
    });
  } catch (error) {
    if (error instanceof PlatformOwnerTenantError) {
      redirect("/app/platform/organizations/new?error=platform-owner");
    }
    redirect("/app/platform/organizations/new?error=create-failed");
  }

  const token = await createInvitation({
    organizationId: result.organizationId,
    membershipId: result.membershipId,
    email: parsed.data.ownerEmail,
    createdById: tenant.userId,
  });
  const inviteUrl = buildAppUrl("/invite", { token });
  const delivery = await sendEmail({
    to: parsed.data.ownerEmail,
    subject: `You have been invited to ${parsed.data.name}`,
    html: `<p>You've been invited to join <strong>${escapeHtml(parsed.data.name)}</strong> as Organization Owner.</p><p><a href="${escapeHtml(inviteUrl)}">Accept the invitation</a></p><p>This link expires in 7 days.</p>`,
  });
  if (!delivery.ok) {
    await markInvitationDeliveryFailed(result.membershipId);
  }

  if (contactSubmission) {
    await createModuleRequest({
      organizationId: result.organizationId,
      requestedById: result.ownerUserId,
      contactSubmissionId: contactSubmission.id,
      moduleId: contactSubmission.moduleId,
      type: contactSubmission.intent === "CUSTOM_MODULE" ? "CUSTOM_MODULE" : contactSubmission.intent === "DEMO" ? "DEMO" : "ENABLE_EXISTING",
      title: `${contactSubmission.intent === "DEMO" ? "Demo" : "Module"} request — ${contactSubmission.company}`,
      businessJustification: contactSubmission.message || `${contactSubmission.name} requested ${contactSubmission.module?.name ?? "a module"}.`,
      expectedUsers: contactSubmission.expectedUsers,
    });
  }

  revalidatePath("/app/platform/organizations");
  redirect(`/app/platform/organizations/${result.organizationId}?created=1${delivery.ok ? "" : "&delivery=failed"}${contactSubmission ? "&request=linked" : ""}`);
}

export async function updateOrganizationProfile(formData: FormData): Promise<void> {
  const tenant = await requireOperator();
  const parsed = parseWithSchema(organizationSchema, Object.fromEntries(formData));
  if (!parsed.success || !parsed.data.organizationId) redirect("/app/platform/organizations?error=invalid");

  const duplicate = await db.organization.findFirst({
    where: { tenantCode: parsed.data.tenantCode, id: { not: parsed.data.organizationId } },
  });
  if (duplicate) redirect(`/app/platform/organizations/${parsed.data.organizationId}?error=tenant-code`);

  await db.$transaction(async (tx) => {
    const organization = await tx.organization.update({
      where: { id: parsed.data.organizationId },
      data: organizationData(parsed.data),
    });
    await logAuditEvent(
      {
        organizationId: organization.id,
        userId: tenant.userId,
        module: "platform",
        action: "organization.profile_updated",
        entityName: "Organization",
        entityId: organization.id,
        metadata: { name: organization.name, tenantCode: organization.tenantCode },
      },
      tx,
    );
  });
  revalidatePath("/app/platform/organizations");
  revalidatePath(`/app/platform/organizations/${parsed.data.organizationId}`);
  redirect(`/app/platform/organizations/${parsed.data.organizationId}?saved=1`);
}

export async function updateOrganizationStatus(formData: FormData): Promise<void> {
  const tenant = await requireOperator();
  const parsed = parseWithSchema(statusSchema, Object.fromEntries(formData));
  if (!parsed.success) redirect("/app/platform/organizations?error=invalid");
  try {
    if (parsed.data.status !== "ACTIVE" && parsed.data.status !== "TRIAL") {
      await assertNotPlatformAnchor(parsed.data.organizationId);
    }
  } catch {
    redirect(`/app/platform/organizations/${parsed.data.organizationId}?error=platform-anchor`);
  }

  await db.$transaction(async (tx) => {
    const current = await tx.organization.findUnique({ where: { id: parsed.data.organizationId } });
    if (!current) throw new Error("Organization not found.");
    await tx.organization.update({
      where: { id: current.id },
      data: { status: parsed.data.status },
    });
    await logAuditEvent(
      {
        organizationId: current.id,
        userId: tenant.userId,
        module: "platform",
        action: "organization.status_changed",
        entityName: "Organization",
        entityId: current.id,
        metadata: { from: current.status, to: parsed.data.status },
      },
      tx,
    );
  });
  revalidatePath("/app/platform/organizations");
  revalidatePath(`/app/platform/organizations/${parsed.data.organizationId}`);
  redirect(`/app/platform/organizations/${parsed.data.organizationId}?status=updated`);
}

export async function resendOrganizationInvitation(formData: FormData): Promise<void> {
  const tenant = await requireOperator();
  const parsed = z.object({ organizationId: cuid, membershipId: cuid }).safeParse({
    organizationId: String(formData.get("organizationId") ?? "").trim(),
    membershipId: String(formData.get("membershipId") ?? "").trim(),
  });
  if (!parsed.success) return;
  const member = await db.organizationMember.findFirst({
    where: {
      id: parsed.data.membershipId,
      organizationId: parsed.data.organizationId,
      status: "INVITED",
    },
    include: { user: true, role: true, organization: true, invitation: true },
  });
  if (!member?.invitation) {
    redirect(`/app/platform/organizations/${parsed.data.organizationId}?error=invitation`);
  }
  let token: string;
  try {
    token = await resendInvitation(parsed.data.organizationId, member.id);
  } catch {
    redirect(`/app/platform/organizations/${parsed.data.organizationId}?error=invitation`);
  }
  const inviteUrl = buildAppUrl("/invite", { token });
  const delivery = await sendEmail({
    to: member.user.email,
    subject: `Reminder: invitation to ${member.organization.name}`,
    html: `<p>You've been invited to join <strong>${escapeHtml(member.organization.name)}</strong> as ${escapeHtml(member.role?.name ?? "a member")}.</p><p><a href="${escapeHtml(inviteUrl)}">Accept the invitation</a></p><p>This link expires in 7 days.</p>`,
  });
  if (!delivery.ok) {
    await markInvitationDeliveryFailed(member.id);
    redirect(`/app/platform/organizations/${member.organizationId}?error=delivery`);
  }
  await logAuditEvent({
    organizationId: member.organizationId,
    userId: tenant.userId,
    membershipId: member.id,
    module: "platform",
    action: "organization.invitation_resent",
    entityName: "OrganizationMember",
    entityId: member.id,
  });
  revalidatePath(`/app/platform/organizations/${member.organizationId}`);
  redirect(`/app/platform/organizations/${member.organizationId}?invitation=resent`);
}

export async function scheduleOrganizationDeletion(formData: FormData): Promise<void> {
  const tenant = await requireOperator();
  const parsed = parseWithSchema(deletionSchema, Object.fromEntries(formData));
  if (!parsed.success) redirect("/app/platform/organizations?error=invalid");
  const organization = await db.organization.findUnique({ where: { id: parsed.data.organizationId } });
  if (!organization || organization.tenantCode !== parsed.data.confirmTenantCode) {
    redirect(`/app/platform/organizations/${parsed.data.organizationId}?error=confirmation`);
  }
  if (!(await verifyCurrentPassword(tenant.userId, parsed.data.confirmPassword))) {
    redirect(`/app/platform/organizations/${parsed.data.organizationId}?error=wrong-password`);
  }
  try {
    await assertNotPlatformAnchor(organization.id);
  } catch {
    redirect(`/app/platform/organizations/${organization.id}?error=platform-anchor`);
  }

  const requestedAt = new Date();
  const platformOrganization = await db.organization.findUnique({
    where: { id: tenant.organizationId },
    select: { metadata: true },
  });
  const platformMetadata = platformOrganization?.metadata && typeof platformOrganization.metadata === "object" && !Array.isArray(platformOrganization.metadata)
    ? platformOrganization.metadata as Record<string, unknown>
    : {};
  const configuredRecoveryDays = Number(platformMetadata.organizationDeletionRecoveryDays);
  const recoveryDays = Number.isInteger(configuredRecoveryDays) && configuredRecoveryDays >= 1 && configuredRecoveryDays <= 365
    ? configuredRecoveryDays
    : 30;
  const scheduledFor = new Date(requestedAt.getTime() + recoveryDays * 24 * 60 * 60 * 1000);
  await db.$transaction(async (tx) => {
    await tx.organization.update({
      where: { id: organization.id },
      data: {
        deletionRequestedAt: requestedAt,
        deletionScheduledFor: scheduledFor,
        deletionRequestedById: tenant.userId,
        deletionPreviousStatus: organization.status,
        status: "CANCELLED",
      },
    });
    await logAuditEvent(
      {
        organizationId: organization.id,
        userId: tenant.userId,
        module: "platform",
        action: "organization.deletion_scheduled",
        entityName: "Organization",
        entityId: organization.id,
        metadata: { scheduledFor: scheduledFor.toISOString(), recoveryDays },
      },
      tx,
    );
  });
  revalidatePath("/app/platform/organizations");
  revalidatePath(`/app/platform/organizations/${organization.id}`);
  redirect(`/app/platform/organizations/${organization.id}?deletion=scheduled`);
}

export async function restoreOrganization(formData: FormData): Promise<void> {
  const tenant = await requireOperator();
  const parsed = cuid.safeParse(String(formData.get("organizationId") ?? "").trim());
  if (!parsed.success) return;
  await db.$transaction(async (tx) => {
    const organization = await tx.organization.findUnique({ where: { id: parsed.data } });
    if (!organization?.deletionScheduledFor) throw new Error("Deletion is not scheduled.");
    await tx.organization.update({
      where: { id: organization.id },
      data: {
        status: organization.deletionPreviousStatus ?? "SUSPENDED",
        deletionRequestedAt: null,
        deletionScheduledFor: null,
        deletionRequestedById: null,
        deletionPreviousStatus: null,
      },
    });
    await logAuditEvent(
      {
        organizationId: organization.id,
        userId: tenant.userId,
        module: "platform",
        action: "organization.deletion_cancelled",
        entityName: "Organization",
        entityId: organization.id,
      },
      tx,
    );
  });
  revalidatePath("/app/platform/organizations");
  revalidatePath(`/app/platform/organizations/${parsed.data}`);
  redirect(`/app/platform/organizations/${parsed.data}?deletion=cancelled`);
}

export async function permanentlyDeleteOrganization(formData: FormData): Promise<void> {
  const tenant = await requireOperator();
  const parsed = parseWithSchema(deletionSchema, Object.fromEntries(formData));
  if (!parsed.success) redirect("/app/platform/organizations?error=invalid");
  const organization = await db.organization.findUnique({ where: { id: parsed.data.organizationId } });
  if (
    !organization ||
    organization.tenantCode !== parsed.data.confirmTenantCode ||
    !organization.deletionScheduledFor ||
    organization.deletionScheduledFor > new Date()
  ) {
    redirect(`/app/platform/organizations/${parsed.data.organizationId}?error=not-ready`);
  }
  if (!(await verifyCurrentPassword(tenant.userId, parsed.data.confirmPassword))) {
    redirect(`/app/platform/organizations/${parsed.data.organizationId}?error=wrong-password`);
  }
  try {
    await assertNotPlatformAnchor(organization.id);
  } catch {
    redirect(`/app/platform/organizations/${organization.id}?error=platform-anchor`);
  }

  await db.$transaction(async (tx) => {
    const deleted = await tx.organization.deleteMany({
      where: { id: organization.id, deletionScheduledFor: { lte: new Date() } },
    });
    if (deleted.count !== 1) throw new Error("Organization is no longer eligible for deletion.");
    await logAuditEvent(
      {
        organizationId: null,
        userId: tenant.userId,
        module: "platform",
        action: "organization.permanently_deleted",
        entityName: "Organization",
        entityId: organization.id,
        metadata: { name: organization.name, tenantCode: organization.tenantCode },
      },
      tx,
    );
  });
  revalidatePath("/app/platform/organizations");
  redirect("/app/platform/organizations?deleted=1");
}
