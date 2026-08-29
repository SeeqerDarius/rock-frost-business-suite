import "server-only";

import { Prisma } from "@prisma/client";
import type { OperationalPayment, SettlementProfileStatus } from "@prisma/client";
import { db } from "@/lib/db";
import { logAuditEvent } from "@/lib/audit";
import { buildTenantAppUrl, getAppOrigin } from "@/lib/app-url";
import { initializeTransaction, createPaystackSubaccount, updatePaystackSubaccount, resolvePaystackAccount, isGatewayConfigured } from "@/lib/payments";
import { isCurrencySupported } from "@/lib/payments/currencies";
import { submitFleetDriverPayment, reviewFleetDriverPaymentSubmission } from "@/modules/fleet/service";
import { postModuleRevenue } from "@/lib/accounting-integration";
import { ACTIVE_ORGANIZATION_STATUSES } from "@/lib/tenant";
import type { BusinessModuleKey } from "@/platform/modules/registry";

export class SettlementUnavailableError extends Error {}
export class OperationalPaymentError extends Error {}

const reference = () => `op_${crypto.randomUUID().replaceAll("-", "")}`;
const receiptNumber = (id: string) => `RF-${new Date().getUTCFullYear()}-${id.slice(-10).toUpperCase()}`;

/** Business modules with a real OperationalPayment call site today. Update this as more modules integrate - never imply broader support than what's actually wired. */
export const MODULES_WITH_OPERATIONAL_PAYMENT_SUPPORT: BusinessModuleKey[] = ["fleet"];

export async function getSettlementProfile(organizationId: string) {
  return db.settlementProfile.findUnique({ where: { organizationId } });
}

/** User-facing label for a settlement's activation state - "Not started" covers the case where no SettlementProfile row exists yet at all. */
export type SettlementActivationLabel = "Not started" | "Verification required" | "Under review" | "Active" | "Restricted" | "Failed";

export function settlementStatusLabel(status: SettlementProfileStatus | null): SettlementActivationLabel {
  switch (status) {
    case null: return "Not started";
    case "PENDING": return "Verification required";
    case "VERIFIED": return "Under review";
    case "ACTIVE": return "Active";
    case "SUSPENDED": return "Restricted";
    case "FAILED": return "Failed";
  }
}

async function upsertSettlementProfile(input: { organizationId: string; actorId: string; bankCode: string; bankName: string; accountNumber: string }) {
  const organization = await db.organization.findUnique({ where: { id: input.organizationId }, select: { name: true, currency: true } });
  if (!organization) throw new OperationalPaymentError("Organization not found.");
  const cleanAccount = input.accountNumber.replace(/\s+/g, "");
  if (!/^\d{6,20}$/.test(cleanAccount)) throw new OperationalPaymentError("Enter a valid bank account number.");
  const resolved = await resolvePaystackAccount(cleanAccount, input.bankCode);
  const current = await db.settlementProfile.findUnique({ where: { organizationId: input.organizationId } });
  const provider = current
    ? await updatePaystackSubaccount(current.providerSubaccountCode, { businessName: organization.name, bankCode: input.bankCode, accountNumber: cleanAccount })
    : await createPaystackSubaccount({ businessName: organization.name, bankCode: input.bankCode, accountNumber: cleanAccount });
  // Re-verification is required after any bank-detail change, even for an already-ACTIVE
  // profile - status resets to PENDING and collections pause until confirmSettlementBeneficiary
  // + runSettlementReadinessCheck are run again. A profile is never left silently ACTIVE
  // against bank details Rock Frost hasn't re-verified.
  const profile = await db.settlementProfile.upsert({
    where: { organizationId: input.organizationId },
    create: { organizationId: input.organizationId, providerSubaccountCode: provider.subaccountCode, settlementBankCode: input.bankCode, settlementBankName: input.bankName, accountLast4: cleanAccount.slice(-4), accountName: resolved.accountName, currency: organization.currency, status: "PENDING", onlineCollectionsEnabled: false },
    update: { providerSubaccountCode: provider.subaccountCode, settlementBankCode: input.bankCode, settlementBankName: input.bankName, accountLast4: cleanAccount.slice(-4), accountName: resolved.accountName, status: "PENDING", onlineCollectionsEnabled: false },
  });
  await logAuditEvent({ organizationId: input.organizationId, userId: input.actorId, module: "payments", action: current ? "settlement_account.updated" : "settlement_account.created", entityName: "SettlementProfile", entityId: profile.id, metadata: { bankName: input.bankName, accountLast4: profile.accountLast4 } });
  return profile;
}

/** Step 1 of the guided activation flow: collect + verify the settlement account. Always leaves the profile at PENDING, awaiting confirmSettlementBeneficiary. */
export async function initiateSettlementProfile(input: { organizationId: string; actorId: string; bankCode: string; bankName: string; accountNumber: string }) {
  return upsertSettlementProfile(input);
}

/** Step 2: the administrator accepts settlement terms and confirms the account belongs to the organization or an authorized beneficiary. PENDING -> VERIFIED; idempotent past that point. */
export async function confirmSettlementBeneficiary(organizationId: string, actorId: string) {
  const profile = await db.settlementProfile.findUnique({ where: { organizationId } });
  if (!profile) throw new SettlementUnavailableError("No settlement account has been started for this organization.");
  if (profile.status !== "PENDING") return profile;
  const updated = await db.settlementProfile.update({ where: { organizationId }, data: { status: "VERIFIED" } });
  await logAuditEvent({ organizationId, userId: actorId, module: "payments", action: "settlement_account.beneficiary_confirmed", entityName: "SettlementProfile", entityId: updated.id });
  return updated;
}

export type SettlementReadinessCheckKey =
  | "PAYSTACK_CONFIGURED"
  | "WEBHOOK_CONFIGURED"
  | "CURRENCY_SUPPORTED"
  | "ACCOUNT_VERIFIED"
  | "SPLIT_PAYMENT_READY"
  | "ORGANIZATION_ELIGIBLE"
  | "OPERATIONAL_ADAPTER_AVAILABLE";

export interface SettlementReadinessCheckResult {
  key: SettlementReadinessCheckKey;
  label: string;
  passed: boolean;
  detail: string;
}

export interface SettlementReadinessReport {
  overall: "READY" | "NOT_READY";
  checks: SettlementReadinessCheckResult[];
}

function isWebhookCallbackResolvable(): boolean {
  try {
    getAppOrigin();
    return true;
  } catch {
    return false;
  }
}

/**
 * Step 4 of the guided activation flow. Read-heavy - only on a full pass does
 * this have a side effect, and only from VERIFIED: it promotes the profile to
 * ACTIVE and applies the requested onlineCollectionsEnabled value. A
 * SUSPENDED or FAILED profile is never silently reactivated by this
 * function, no matter what the seven checks report - lifting an
 * administrative restriction is a separate, deliberate action, not an
 * automatic side effect of re-running a readiness check.
 */
export async function runSettlementReadinessCheck(
  organizationId: string,
  options: { actorId?: string; enabledModuleKeys?: string[]; enableIfReady?: boolean } = {},
): Promise<SettlementReadinessReport> {
  const [organization, profile, enabledModuleKeys] = await Promise.all([
    db.organization.findUnique({ where: { id: organizationId }, select: { status: true, currency: true } }),
    db.settlementProfile.findUnique({ where: { organizationId } }),
    options.enabledModuleKeys ??
      db.organizationModule.findMany({ where: { organizationId, enabled: true }, select: { module: { select: { code: true } } } })
        .then((rows) => rows.map((row) => row.module.code)),
  ]);
  const membershipActive = options.actorId
    ? await db.organizationMember.findFirst({ where: { organizationId, userId: options.actorId, status: "ACTIVE" }, select: { id: true } })
    : null;

  const accountVerified = profile !== null && (profile.status === "VERIFIED" || profile.status === "ACTIVE" || profile.status === "SUSPENDED");
  const organizationEligible = Boolean(organization && ACTIVE_ORGANIZATION_STATUSES.has(organization.status) && (!options.actorId || membershipActive));
  const adapterAvailable = enabledModuleKeys.some((key) => MODULES_WITH_OPERATIONAL_PAYMENT_SUPPORT.includes(key as BusinessModuleKey));

  const checks: SettlementReadinessCheckResult[] = [
    { key: "PAYSTACK_CONFIGURED", label: "Paystack is configured", passed: isGatewayConfigured("PAYSTACK"), detail: isGatewayConfigured("PAYSTACK") ? "Live Paystack credentials are set for this environment." : "PAYSTACK_SECRET_KEY is not configured." },
    { key: "WEBHOOK_CONFIGURED", label: "Webhook callback URL is resolvable", passed: isWebhookCallbackResolvable(), detail: isWebhookCallbackResolvable() ? "The application's public origin is configured, so Paystack can reach the webhook route." : "The application's public origin is not configured (NEXTAUTH_URL or equivalent)." },
    { key: "CURRENCY_SUPPORTED", label: "Organization currency is supported", passed: Boolean(organization && isCurrencySupported("PAYSTACK", organization.currency)), detail: organization ? (isCurrencySupported("PAYSTACK", organization.currency) ? `${organization.currency} is a supported settlement currency.` : `${organization.currency} is not a currency Paystack can settle for this account.`) : "Organization not found." },
    { key: "ACCOUNT_VERIFIED", label: "Settlement account verified", passed: accountVerified, detail: accountVerified ? "The settlement account's identity has been verified." : "The settlement account still needs verification - complete the account setup step first." },
    { key: "SPLIT_PAYMENT_READY", label: "Split-payment subaccount created", passed: Boolean(profile?.providerSubaccountCode), detail: profile?.providerSubaccountCode ? "A Paystack subaccount is ready to receive split payments." : "No Paystack subaccount exists yet for this organization." },
    { key: "ORGANIZATION_ELIGIBLE", label: "Organization is eligible", passed: organizationEligible, detail: organizationEligible ? "The organization and requesting membership are both active." : "The organization or the requesting membership is not currently active." },
    { key: "OPERATIONAL_ADAPTER_AVAILABLE", label: "At least one enabled module supports online collections", passed: adapterAvailable, detail: adapterAvailable ? "An enabled module can create operational payments." : "None of this organization's enabled modules support online collections yet." },
  ];

  // A SUSPENDED profile still reports ACCOUNT_VERIFIED true (the underlying identity check once
  // passed), so the seven checks alone could mechanically all pass while the account is under an
  // administrative restriction. "overall" must never claim READY in that case - lifting a
  // restriction is a deliberate action, not something a readiness re-check should paper over.
  const mechanicallyPassing = checks.every((check) => check.passed);
  const overall: "READY" | "NOT_READY" = mechanicallyPassing && profile?.status !== "SUSPENDED" ? "READY" : "NOT_READY";

  if (overall === "READY" && profile?.status === "VERIFIED") {
    const updated = await db.settlementProfile.update({ where: { organizationId }, data: { status: "ACTIVE", onlineCollectionsEnabled: options.enableIfReady ?? profile.onlineCollectionsEnabled } });
    await logAuditEvent({ organizationId, userId: options.actorId ?? null, module: "payments", action: "settlement_account.activated", entityName: "SettlementProfile", entityId: updated.id, metadata: { onlineCollectionsEnabled: updated.onlineCollectionsEnabled } });
  }

  return { overall, checks };
}

/** @deprecated Use initiateSettlementProfile + confirmSettlementBeneficiary + runSettlementReadinessCheck instead. Kept only for the existing single-step Organization Settings form until the guided activation wizard replaces it; `enabled` is no longer honored directly - real activation now requires passing the full readiness check. */
export async function saveSettlementProfile(input: { organizationId: string; actorId: string; bankCode: string; bankName: string; accountNumber: string; enabled: boolean }) {
  return upsertSettlementProfile(input);
}

export async function initializeFleetOperationalPayment(input: { organizationId: string; userId: string; vehicleId: string; contractId?: string | null; submissionType: "DAILY_SALES" | "WEEKLY_SALES" | "WORK_AND_PAY"; periodStart: Date }) {
  const profile = await db.settlementProfile.findFirst({ where: { organizationId: input.organizationId, status: "ACTIVE", onlineCollectionsEnabled: true, provider: "PAYSTACK" } });
  if (!profile) throw new SettlementUnavailableError("Online collections are not active for this organization.");
  const driver = await db.fleetDriver.findFirst({ where: { organizationId: input.organizationId, userId: input.userId, status: "ACTIVE" }, include: { user: { select: { email: true } } } });
  if (!driver?.user?.email) throw new OperationalPaymentError("An active driver login with an email address is required.");
  const vehicle = await db.fleetVehicle.findFirst({ where: { id: input.vehicleId, organizationId: input.organizationId, assignedDriverId: driver.id } });
  if (!vehicle) throw new OperationalPaymentError("Assigned vehicle not found.");
  let amount: Prisma.Decimal;
  if (input.submissionType === "WORK_AND_PAY") {
    const contract = await db.fleetWorkAndPayContract.findFirst({ where: { id: input.contractId ?? "", organizationId: input.organizationId, vehicleId: vehicle.id, driverId: driver.id, contractStatus: "ACTIVE" } });
    if (!contract) throw new OperationalPaymentError("Active Work & Pay contract not found.");
    amount = Prisma.Decimal.min(contract.scheduledPaymentAmount, contract.outstandingBalance);
  } else {
    const required = input.submissionType === "DAILY_SALES" ? "DAILY" : "WEEKLY";
    if (vehicle.salesTargetPeriod !== required || !vehicle.salesTargetAmount) throw new OperationalPaymentError("The selected remittance is not configured for this vehicle.");
    amount = vehicle.salesTargetAmount;
  }
  const providerReference = reference();
  const submission = await submitFleetDriverPayment(input.organizationId, input.userId, { vehicleId: vehicle.id, contractId: input.contractId, submissionType: input.submissionType, periodStart: input.periodStart, amount: amount.toFixed(2), paymentDate: new Date(), paymentMethod: "CARD", reference: providerReference, notes: "Online payment pending Paystack confirmation" });
  const payment = await db.operationalPayment.create({ data: { organizationId: input.organizationId, providerReference, purpose: input.submissionType === "WORK_AND_PAY" ? "FLEET_WORK_AND_PAY" : "FLEET_REMITTANCE", sourceModule: "fleet", sourceType: "FleetDriverPaymentSubmission", sourceId: submission.id, payerId: input.userId, beneficiaryReference: profile.providerSubaccountCode, amount, currency: profile.currency, status: "CREATED", metadata: { vehicleId: vehicle.id, driverId: driver.id } } });
  try {
    const initialized = await initializeTransaction("PAYSTACK", { reference: providerReference, amount: amount.toFixed(2), currency: profile.currency, customerEmail: driver.user.email, callbackUrl: buildTenantAppUrl("/app/fleet/driver-portal/payment/callback", { reference: providerReference }), subaccountCode: profile.providerSubaccountCode, bearer: "subaccount", metadata: { paymentDomain: "TENANT_OPERATIONAL", paymentId: payment.id, purpose: payment.purpose } });
    await db.operationalPayment.update({ where: { id: payment.id }, data: { status: "INITIALIZED" } });
    await logAuditEvent({ organizationId: input.organizationId, userId: input.userId, module: "payments", action: "payment.initialized", entityName: "OperationalPayment", entityId: payment.id, metadata: { purpose: payment.purpose, amount: amount.toFixed(2), currency: profile.currency } });
    return initialized;
  } catch (error) {
    await db.operationalPayment.update({ where: { id: payment.id }, data: { status: "FAILED", failureReason: error instanceof Error ? error.message : "Initialization failed" } });
    await db.fleetDriverPaymentSubmission.update({ where: { id: submission.id }, data: { status: "CANCELLED" } });
    throw error;
  }
}

/**
 * Reconciles an already-SUCCESS payment against its owning module's domain
 * record and posts confirmed revenue to Accounting. Shared by the
 * webhook-driven confirmation path and the manual retry path below - a
 * NEEDS_RETRY payment is reconciled with exactly the same logic whether the
 * retry is automatic (webhook) or administrator-triggered (retry button).
 */
async function reconcileOperationalPayment(payment: OperationalPayment) {
  const currentSubmission = await db.fleetDriverPaymentSubmission.findFirst({ where: { id: payment.sourceId, organizationId: payment.organizationId }, select: { status: true, fleetPaymentId: true } });
  if (!currentSubmission) throw new OperationalPaymentError("Fleet payment obligation no longer exists.");
  const submission = currentSubmission.status === "PENDING"
    ? await reviewFleetDriverPaymentSubmission(payment.organizationId, payment.sourceId, payment.payerId ?? "system", true)
    : currentSubmission.status === "APPROVED" && currentSubmission.fleetPaymentId
      ? currentSubmission
      : null;
  if (!submission) throw new OperationalPaymentError("Fleet payment obligation is not reconcilable.");
  const accounting = submission.fleetPaymentId ? await postModuleRevenue(payment.organizationId, { sourceModule: "fleet", sourceType: "FLEET_PAYMENT", sourceId: submission.fleetPaymentId, postingPurpose: "COLLECTED", amount: payment.amount.toFixed(2), entryDate: payment.paidAt ?? new Date(), description: `Confirmed online Fleet collection ${payment.providerReference}`, createdById: payment.payerId }) : { posted: false as const, reason: "error" as const };
  return db.operationalPayment.update({ where: { id: payment.id }, data: { reconciliationStatus: accounting.posted || accounting.reason === "accounting-not-enabled" ? "COMPLETE" : "NEEDS_RETRY", accountingEntryId: accounting.posted ? accounting.journalEntryId : null } });
}

export async function confirmOperationalPayment(input: { reference: string; amount: string; currency: string; paidAt?: Date | null; channel?: string | null; subaccountCode?: string | null }) {
  const payment = await db.operationalPayment.findUnique({ where: { provider_providerReference: { provider: "PAYSTACK", providerReference: input.reference } } });
  if (!payment) return { handled: false as const };
  if (payment.status === "SUCCESS" && payment.reconciliationStatus === "COMPLETE") return { handled: true as const, payment };
  if (!new Prisma.Decimal(input.amount).equals(payment.amount) || input.currency !== payment.currency) throw new OperationalPaymentError("Verified payment amount or currency does not match the obligation.");
  if (input.subaccountCode && input.subaccountCode !== payment.beneficiaryReference) throw new OperationalPaymentError("Verified settlement destination does not match.");
  await db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`operational-payment:${payment.id}`}))`;
    await tx.operationalPayment.update({ where: { id: payment.id }, data: { status: "SUCCESS", paidAt: input.paidAt ?? new Date(), receiptNumber: payment.receiptNumber ?? receiptNumber(payment.id), reconciliationStatus: "NEEDS_RETRY", metadata: { ...(payment.metadata as object ?? {}), channel: input.channel ?? null } } });
  });
  try {
    const complete = await reconcileOperationalPayment({ ...payment, paidAt: input.paidAt ?? new Date() });
    await logAuditEvent({ organizationId: payment.organizationId, userId: payment.payerId, module: "payments", action: "payment.confirmed", entityName: "OperationalPayment", entityId: payment.id, metadata: { purpose: payment.purpose, amount: payment.amount.toFixed(2), receiptNumber: complete.receiptNumber } });
    return { handled: true as const, payment: complete };
  } catch (error) {
    await db.operationalPayment.update({ where: { id: payment.id }, data: { reconciliationStatus: "NEEDS_RETRY", failureReason: error instanceof Error ? error.message : "Downstream reconciliation failed" } });
    throw error;
  }
}

/** Administrator-triggered retry for a payment stuck at reconciliationStatus NEEDS_RETRY - the same reconciliation logic the webhook path already runs, exposed as an explicit action rather than only an automatic background retry. */
export async function retryOperationalPaymentReconciliation(organizationId: string, paymentId: string, actorId: string) {
  const payment = await db.operationalPayment.findFirst({ where: { id: paymentId, organizationId } });
  if (!payment) throw new OperationalPaymentError("Payment not found.");
  if (payment.status !== "SUCCESS") throw new OperationalPaymentError("Only a confirmed payment can be reconciled.");
  if (payment.reconciliationStatus === "COMPLETE") return payment;
  try {
    const complete = await reconcileOperationalPayment(payment);
    await logAuditEvent({ organizationId, userId: actorId, module: "payments", action: "payment.reconciliation_retried", entityName: "OperationalPayment", entityId: payment.id, metadata: { purpose: payment.purpose, reconciliationStatus: complete.reconciliationStatus } });
    return complete;
  } catch (error) {
    await db.operationalPayment.update({ where: { id: payment.id }, data: { reconciliationStatus: "NEEDS_RETRY", failureReason: error instanceof Error ? error.message : "Downstream reconciliation failed" } });
    throw error;
  }
}

export async function getOperationalPaymentForTenant(organizationId: string, referenceValue: string) {
  return db.operationalPayment.findFirst({ where: { organizationId, providerReference: referenceValue } });
}

export async function listOperationalPayments(organizationId: string) {
  return db.operationalPayment.findMany({ where: { organizationId }, orderBy: { createdAt: "desc" }, take: 100 });
}

/**
 * A driver's own online payments still awaiting Paystack confirmation, keyed
 * by the vehicle/contract they're for - used to show "do not pay again"
 * guidance and disable only the matching pay-online control while that
 * specific checkout is in flight, rather than blocking every obligation
 * because one of them has a payment pending.
 */
export async function listPendingOperationalPaymentsForPayer(organizationId: string, payerId: string) {
  const pending = await db.operationalPayment.findMany({
    where: { organizationId, payerId, status: { in: ["CREATED", "INITIALIZED"] } },
    select: { id: true, sourceId: true, providerReference: true, amount: true, createdAt: true },
    orderBy: { createdAt: "desc" },
  });
  if (pending.length === 0) return [];
  const submissions = await db.fleetDriverPaymentSubmission.findMany({
    where: { id: { in: pending.map((p) => p.sourceId) } },
    select: { id: true, vehicleId: true, contractId: true },
  });
  const byId = new Map(submissions.map((s) => [s.id, s]));
  return pending.map((payment) => ({ ...payment, vehicleId: byId.get(payment.sourceId)?.vehicleId ?? null, contractId: byId.get(payment.sourceId)?.contractId ?? null }));
}

/** A driver's own confirmed online payments, for the Activity/receipts view. */
export async function listConfirmedOperationalPaymentsForPayer(organizationId: string, payerId: string) {
  return db.operationalPayment.findMany({
    where: { organizationId, payerId, status: "SUCCESS" },
    orderBy: { paidAt: "desc" },
    take: 20,
  });
}
