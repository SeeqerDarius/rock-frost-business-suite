import "server-only";

import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { logAuditEvent } from "@/lib/audit";
import { buildTenantAppUrl } from "@/lib/app-url";
import { initializeTransaction, createPaystackSubaccount, updatePaystackSubaccount, resolvePaystackAccount } from "@/lib/payments";
import { submitFleetDriverPayment, reviewFleetDriverPaymentSubmission } from "@/modules/fleet/service";
import { postModuleRevenue } from "@/lib/accounting-integration";

export class SettlementUnavailableError extends Error {}
export class OperationalPaymentError extends Error {}

const reference = () => `op_${crypto.randomUUID().replaceAll("-", "")}`;
const receiptNumber = (id: string) => `RF-${new Date().getUTCFullYear()}-${id.slice(-10).toUpperCase()}`;

export async function getSettlementProfile(organizationId: string) {
  return db.settlementProfile.findUnique({ where: { organizationId } });
}

export async function saveSettlementProfile(input: { organizationId: string; actorId: string; bankCode: string; bankName: string; accountNumber: string; enabled: boolean }) {
  const organization = await db.organization.findUnique({ where: { id: input.organizationId }, select: { name: true, currency: true } });
  if (!organization) throw new OperationalPaymentError("Organization not found.");
  const cleanAccount = input.accountNumber.replace(/\s+/g, "");
  if (!/^\d{6,20}$/.test(cleanAccount)) throw new OperationalPaymentError("Enter a valid bank account number.");
  const resolved = await resolvePaystackAccount(cleanAccount, input.bankCode);
  const current = await db.settlementProfile.findUnique({ where: { organizationId: input.organizationId } });
  const provider = current
    ? await updatePaystackSubaccount(current.providerSubaccountCode, { businessName: organization.name, bankCode: input.bankCode, accountNumber: cleanAccount })
    : await createPaystackSubaccount({ businessName: organization.name, bankCode: input.bankCode, accountNumber: cleanAccount });
  const profile = await db.settlementProfile.upsert({
    where: { organizationId: input.organizationId },
    create: { organizationId: input.organizationId, providerSubaccountCode: provider.subaccountCode, settlementBankCode: input.bankCode, settlementBankName: input.bankName, accountLast4: cleanAccount.slice(-4), accountName: resolved.accountName, currency: organization.currency, status: "ACTIVE", onlineCollectionsEnabled: input.enabled },
    update: { providerSubaccountCode: provider.subaccountCode, settlementBankCode: input.bankCode, settlementBankName: input.bankName, accountLast4: cleanAccount.slice(-4), accountName: resolved.accountName, status: "ACTIVE", onlineCollectionsEnabled: input.enabled },
  });
  await logAuditEvent({ organizationId: input.organizationId, userId: input.actorId, module: "payments", action: current ? "settlement_account.updated" : "settlement_account.created", entityName: "SettlementProfile", entityId: profile.id, metadata: { bankName: input.bankName, accountLast4: profile.accountLast4, enabled: input.enabled } });
  return profile;
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
    const currentSubmission = await db.fleetDriverPaymentSubmission.findFirst({ where: { id: payment.sourceId, organizationId: payment.organizationId }, select: { status: true, fleetPaymentId: true } });
    if (!currentSubmission) throw new OperationalPaymentError("Fleet payment obligation no longer exists.");
    const submission = currentSubmission.status === "PENDING"
      ? await reviewFleetDriverPaymentSubmission(payment.organizationId, payment.sourceId, payment.payerId ?? "system", true)
      : currentSubmission.status === "APPROVED" && currentSubmission.fleetPaymentId
        ? currentSubmission
        : null;
    if (!submission) throw new OperationalPaymentError("Fleet payment obligation is not reconcilable.");
    const accounting = submission.fleetPaymentId ? await postModuleRevenue(payment.organizationId, { sourceModule: "fleet", sourceType: "FLEET_PAYMENT", sourceId: submission.fleetPaymentId, postingPurpose: "COLLECTED", amount: payment.amount.toFixed(2), entryDate: input.paidAt ?? new Date(), description: `Confirmed online Fleet collection ${input.reference}`, createdById: payment.payerId }) : { posted: false as const, reason: "error" as const };
    const complete = await db.operationalPayment.update({ where: { id: payment.id }, data: { reconciliationStatus: accounting.posted || accounting.reason === "accounting-not-enabled" ? "COMPLETE" : "NEEDS_RETRY", accountingEntryId: accounting.posted ? accounting.journalEntryId : null } });
    await logAuditEvent({ organizationId: payment.organizationId, userId: payment.payerId, module: "payments", action: "payment.confirmed", entityName: "OperationalPayment", entityId: payment.id, metadata: { purpose: payment.purpose, amount: payment.amount.toFixed(2), receiptNumber: complete.receiptNumber } });
    return { handled: true as const, payment: complete };
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
