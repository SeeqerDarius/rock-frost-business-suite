"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { buildTenantAppUrl } from "@/lib/app-url";
import { createInvitation, markInvitationDeliveryFailed } from "@/lib/auth/invitations";
import { isPlatformUser } from "@/lib/auth/platform-identity";
import { isBotProtectionConfigured, verifyBotProtection } from "@/lib/bot-protection";
import { isContactHoneypotClear, verifyContactFormProof } from "@/lib/contact-form-protection";
import { sendEmail } from "@/lib/email";
import { invitationEmail } from "@/lib/email-templates";
import { getModulePriceMap, getPricingBundleMap, type PricingBundleKey } from "@/lib/pricing";
import { createSelfServiceBundleSubscription, createSelfServiceSubscription } from "@/platform/subscriptions/service";
import type { BusinessModuleKey } from "@/platform/modules/registry";

const schema = z.object({
  fullName: z.string().trim().min(2).max(150),
  organizationName: z.string().trim().min(2).max(150),
  email: z.string().trim().email().max(320).transform((value) => value.toLowerCase()),
  phone: z.string().trim().max(40),
  productType: z.enum(["MODULE", "BUNDLE"]),
  productKey: z.string().trim().min(1).max(80),
  billingCycle: z.enum(["MONTHLY", "ANNUAL"]),
});

function slugify(value: string) {
  return value.toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "organization";
}

async function uniqueTenantCode(name: string) {
  const base = slugify(name);
  for (let suffix = 0; suffix < 1000; suffix += 1) {
    const code = suffix ? `${base}-${suffix + 1}` : base;
    if (!await db.organization.findUnique({ where: { tenantCode: code }, select: { id: true } })) return code;
  }
  return `${base}-${crypto.randomUUID().slice(0, 8)}`;
}

export async function startPublicSubscription(formData: FormData): Promise<void> {
  const turnstileConfigured = isBotProtectionConfigured();
  const verified = turnstileConfigured
    ? await verifyBotProtection(formData.get("cf-turnstile-response"), "subscribe")
    : verifyContactFormProof(formData.get("contactProof"), process.env.NEXTAUTH_SECRET ?? "") && isContactHoneypotClear(formData.get("website"));
  if (!verified) redirect("/subscribe?error=verification");

  const parsed = schema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) redirect("/subscribe?error=invalid");
  const input = parsed.data;
  const [modulePriceMap, bundleMap] = await Promise.all([getModulePriceMap(), getPricingBundleMap()]);
  const selectedModule = modulePriceMap.has(input.productKey as BusinessModuleKey);
  const selectedBundle = bundleMap.has(input.productKey as PricingBundleKey);
  if (!selectedModule && !selectedBundle) redirect("/subscribe?error=product");

  const existingUser = await db.user.findUnique({ where: { email: input.email }, select: { id: true } });
  if (existingUser && await isPlatformUser(existingUser.id)) redirect("/subscribe?error=platform-account");
  const recent = await db.organization.findFirst({ where: { billingEmail: input.email, createdAt: { gte: new Date(Date.now() - 60_000) } }, select: { id: true } });
  if (recent) redirect("/subscribe?error=too-soon");
  const ownerRole = await db.role.findFirst({ where: { organizationId: null, isSystem: true, name: "Organization Owner" }, select: { id: true } });
  if (!ownerRole) redirect("/subscribe?error=unavailable");

  const tenantCode = await uniqueTenantCode(input.organizationName);
  const created = await db.$transaction(async (tx) => {
    const organization = await tx.organization.create({ data: { name: input.organizationName, tenantCode, status: "TRIAL", billingEmail: input.email, email: input.email, phone: input.phone || null, currency: "GHS", timezone: "Africa/Accra", country: "Ghana" } });
    const user = await tx.user.upsert({ where: { email: input.email }, update: {}, create: { email: input.email, name: input.fullName, phone: input.phone || null, status: "INVITED" } });
    const membership = await tx.organizationMember.create({ data: { organizationId: organization.id, userId: user.id, roleId: ownerRole.id, status: "INVITED" } });
    return { organization, user, membership };
  });

  try {
    if (selectedBundle) {
      await createSelfServiceBundleSubscription({ organizationId: created.organization.id, bundleKey: input.productKey as PricingBundleKey, billingCycle: input.billingCycle, autoRenew: true, actorId: created.user.id });
    } else {
      await createSelfServiceSubscription({ organizationId: created.organization.id, moduleKey: input.productKey as BusinessModuleKey, billingCycle: input.billingCycle, autoRenew: true, actorId: created.user.id });
    }
  } catch (error) {
    console.error("[public-subscribe] Failed to prepare subscription:", error);
    redirect("/subscribe?error=unavailable");
  }

  const token = await createInvitation({ organizationId: created.organization.id, membershipId: created.membership.id, email: input.email });
  const inviteUrl = buildTenantAppUrl("/invite", { token, next: "/app/organization/billing" });
  const delivery = await sendEmail({ to: input.email, ...invitationEmail({ organizationName: input.organizationName, roleName: "Organization Owner", inviteUrl }) });
  if (!delivery.ok) await markInvitationDeliveryFailed(created.membership.id);
  // Deliberately no email in this URL: it would sit in an indexable,
  // crawlable, cacheable location (browser history, analytics, a support
  // screenshot) for no real benefit. The person who just typed their own
  // email into the form a moment ago does not need it echoed back.
  redirect(`/subscribe/thank-you${delivery.ok ? "" : "?delivery=failed"}`);
}
