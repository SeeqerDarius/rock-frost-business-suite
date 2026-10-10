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
import { getModulePriceMap, getModuleTierPrice, getPricingBundleMap, type PricingBundleKey } from "@/lib/pricing";
import { moduleHasPublishedLadder } from "@/platform/entitlements/catalogue";
import { isPlanTier, isQuoteOnlyTier, type PlanTier } from "@/platform/entitlements/tiers";
import { createSelfServiceBundleSubscription, createSelfServiceSubscription, UnavailablePlanTierError } from "@/platform/subscriptions/service";
import { isPubliclyListedModule, type BusinessModuleKey } from "@/platform/modules/registry";
import { getCountryProfile } from "@/lib/localization";

const schema = z.object({
  fullName: z.string().trim().min(2).max(150),
  organizationName: z.string().trim().min(2).max(150),
  email: z.string().trim().email().max(320).transform((value) => value.toLowerCase()),
  phone: z.string().trim().max(40),
  productType: z.enum(["MODULE", "BUNDLE"]),
  productKey: z.string().trim().min(1).max(80),
  // Optional here because a suite has no per-module tier, and because the
  // modules whose ladders are still pending are sold at one price. The
  // service layer refuses a module that does need one, rather than this
  // schema guessing which modules those are.
  tier: z.string().trim().max(20).optional(),
  billingCycle: z.enum(["MONTHLY", "ANNUAL"]),
  country: z.string().trim().max(60).optional().default("GH"),
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
  // Self-service signup only sells publicly listed modules.
  const selectedModule = modulePriceMap.has(input.productKey as BusinessModuleKey) && isPubliclyListedModule(input.productKey);
  const selectedBundle = bundleMap.has(input.productKey as PricingBundleKey);
  if (!selectedModule && !selectedBundle) redirect("/subscribe?error=product");

  // The plan is settled before anything is written. createSelfServiceSubscription()
  // refuses an unsellable tier on its own, but by the time it runs the
  // organization, user, and membership rows already exist, so a refusal
  // there would strand a half-built workspace nobody can pay for. The same
  // rules are applied here, early, where the only cost of a refusal is a
  // message on the form.
  const requestedTier: PlanTier | undefined = input.tier && isPlanTier(input.tier) ? input.tier : undefined;
  if (input.tier && (!requestedTier || isQuoteOnlyTier(requestedTier))) redirect("/subscribe?error=tier");
  if (selectedModule && moduleHasPublishedLadder(input.productKey)) {
    if (!requestedTier) redirect("/subscribe?error=tier");
    if (!await getModuleTierPrice(input.productKey, requestedTier)) redirect("/subscribe?error=tier");
  }

  const existingUser = await db.user.findUnique({ where: { email: input.email }, select: { id: true } });
  if (existingUser && await isPlatformUser(existingUser.id)) redirect("/subscribe?error=platform-account");
  const recent = await db.organization.findFirst({ where: { billingEmail: input.email, createdAt: { gte: new Date(Date.now() - 60_000) } }, select: { id: true } });
  if (recent) redirect("/subscribe?error=too-soon");
  const ownerRole = await db.role.findFirst({ where: { organizationId: null, isSystem: true, name: "Organization Owner" }, select: { id: true } });
  if (!ownerRole) redirect("/subscribe?error=unavailable");

  const profile = getCountryProfile(input.country || "GH");
  if (!profile.currency || !profile.timezone) redirect("/subscribe?error=invalid");
  const tenantCode = await uniqueTenantCode(input.organizationName);
  const created = await db.$transaction(async (tx) => {
    const organization = await tx.organization.create({ data: { name: input.organizationName, tenantCode, status: "TRIAL", billingEmail: input.email, email: input.email, phone: input.phone || null, currency: profile.currency, timezone: profile.timezone, country: profile.countryCode, jurisdictionCode: profile.jurisdictionCode, fiscalYearStartMonth: profile.fiscalYearStartMonth, legalName: input.organizationName } });
    const user = await tx.user.upsert({ where: { email: input.email }, update: {}, create: { email: input.email, name: input.fullName, phone: input.phone || null, status: "INVITED" } });
    const membership = await tx.organizationMember.create({ data: { organizationId: organization.id, userId: user.id, roleId: ownerRole.id, status: "INVITED" } });
    return { organization, user, membership };
  });

  try {
    if (selectedBundle) {
      await createSelfServiceBundleSubscription({ organizationId: created.organization.id, bundleKey: input.productKey as PricingBundleKey, billingCycle: input.billingCycle, autoRenew: true, actorId: created.user.id });
    } else {
      await createSelfServiceSubscription({ organizationId: created.organization.id, moduleKey: input.productKey as BusinessModuleKey, tier: requestedTier, billingCycle: input.billingCycle, autoRenew: true, actorId: created.user.id });
    }
  } catch (error) {
    if (error instanceof UnavailablePlanTierError) {
      console.error("[public-subscribe] Plan unavailable for the selected product:", error.message);
      redirect("/subscribe?error=tier");
    }
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
