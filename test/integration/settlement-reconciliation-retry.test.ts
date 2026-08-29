import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as fleet from "@/modules/fleet/service";
import { retryOperationalPaymentReconciliation } from "@/lib/payments/operational";
import { testDb } from "./setup/db";
import { cleanupTestOrg, createTestOrg, type TestOrg } from "./setup/fixtures";

let org: TestOrg;
let driverUserId: string;
let vehicleId: string;

beforeAll(async () => {
  org = await createTestOrg("settlement-reconciliation-retry");
  const driverUser = await testDb.user.create({ data: { name: "Retry Driver", email: `retry-driver-${org.organizationId}@example.invalid`, status: "ACTIVE" } });
  driverUserId = driverUser.id;
  const driver = await fleet.createFleetDriver(org.organizationId, { name: "Retry Driver", userId: driverUserId });
  const vehicle = await fleet.createFleetVehicle(org.organizationId, {
    assetTag: "RETRY-1",
    plateNumber: "RETRY-1001",
    assignedDriverId: driver.id,
    status: "ASSIGNED",
    salesTargetPeriod: "DAILY",
    salesTargetAmount: "150.00",
  }, org.userId);
  vehicleId = vehicle.id;
});

afterAll(async () => {
  await cleanupTestOrg(org);
  await testDb.user.deleteMany({ where: { id: driverUserId } });
});

describe("retryOperationalPaymentReconciliation (real Postgres)", () => {
  it("completes reconciliation for a payment stuck at NEEDS_RETRY, using the exact same logic the webhook path already runs", async () => {
    const periodStart = new Date("2026-08-24T00:00:00.000Z");
    const submission = await fleet.submitFleetDriverPayment(org.organizationId, driverUserId, {
      vehicleId,
      submissionType: "DAILY_SALES",
      periodStart,
      amount: "150.00",
      paymentDate: periodStart,
      paymentMethod: "CARD",
      reference: "op_retry_test_1",
    });
    const approved = await fleet.reviewFleetDriverPaymentSubmission(org.organizationId, submission.id, org.userId, true);
    expect(approved.status).toBe("APPROVED");
    expect(approved.fleetPaymentId).toBeTruthy();

    // Simulate a payment that already succeeded with Paystack but whose downstream
    // reconciliation failed the first time (e.g. a transient Accounting outage) -
    // exactly the state confirmOperationalPayment leaves a payment in when its own
    // try/catch around reconcileOperationalPayment() catches an error.
    const stuckPayment = await testDb.operationalPayment.create({
      data: {
        organizationId: org.organizationId,
        provider: "PAYSTACK",
        providerReference: `op_retry_${submission.id}`,
        purpose: "FLEET_REMITTANCE",
        sourceModule: "fleet",
        sourceType: "FleetDriverPaymentSubmission",
        sourceId: submission.id,
        payerId: driverUserId,
        beneficiaryReference: "ACCT_test_subaccount",
        amount: "150.00",
        currency: "USD",
        status: "SUCCESS",
        reconciliationStatus: "NEEDS_RETRY",
        paidAt: periodStart,
      },
    });

    const reconciled = await retryOperationalPaymentReconciliation(org.organizationId, stuckPayment.id, org.userId);

    expect(reconciled.reconciliationStatus).toBe("COMPLETE");
    expect(reconciled.accountingEntryId).toBeTruthy();

    const auditEvent = await testDb.auditLog.findFirst({ where: { organizationId: org.organizationId, action: "payment.reconciliation_retried", entityId: stuckPayment.id } });
    expect(auditEvent).not.toBeNull();
  });

  it("is idempotent - retrying an already-COMPLETE payment is a no-op, never a duplicate accounting entry", async () => {
    const periodStart = new Date("2026-08-25T00:00:00.000Z");
    const submission = await fleet.submitFleetDriverPayment(org.organizationId, driverUserId, {
      vehicleId,
      submissionType: "DAILY_SALES",
      periodStart,
      amount: "150.00",
      paymentDate: periodStart,
      paymentMethod: "CARD",
      reference: "op_retry_test_2",
    });
    const approved = await fleet.reviewFleetDriverPaymentSubmission(org.organizationId, submission.id, org.userId, true);

    const payment = await testDb.operationalPayment.create({
      data: {
        organizationId: org.organizationId,
        provider: "PAYSTACK",
        providerReference: `op_retry_idempotent_${submission.id}`,
        purpose: "FLEET_REMITTANCE",
        sourceModule: "fleet",
        sourceType: "FleetDriverPaymentSubmission",
        sourceId: submission.id,
        payerId: driverUserId,
        beneficiaryReference: "ACCT_test_subaccount",
        amount: "150.00",
        currency: "USD",
        status: "SUCCESS",
        reconciliationStatus: "NEEDS_RETRY",
        paidAt: periodStart,
      },
    });

    const first = await retryOperationalPaymentReconciliation(org.organizationId, payment.id, org.userId);
    expect(first.reconciliationStatus).toBe("COMPLETE");

    const second = await retryOperationalPaymentReconciliation(org.organizationId, payment.id, org.userId);
    expect(second.accountingEntryId).toBe(first.accountingEntryId);

    void approved;
  });

  it("refuses to reconcile a payment that never reached SUCCESS", async () => {
    const payment = await testDb.operationalPayment.create({
      data: {
        organizationId: org.organizationId,
        provider: "PAYSTACK",
        providerReference: `op_retry_unconfirmed_${Date.now()}`,
        purpose: "FLEET_REMITTANCE",
        sourceModule: "fleet",
        sourceType: "FleetDriverPaymentSubmission",
        sourceId: "does-not-matter",
        payerId: driverUserId,
        beneficiaryReference: "ACCT_test_subaccount",
        amount: "150.00",
        currency: "USD",
        status: "INITIALIZED",
        reconciliationStatus: "PENDING",
      },
    });

    await expect(retryOperationalPaymentReconciliation(org.organizationId, payment.id, org.userId)).rejects.toThrow();
  });

  it("scopes strictly to the given organization - a payment id from another org is never found or reconciled", async () => {
    const otherOrg = await createTestOrg("settlement-reconciliation-retry-other");
    try {
      const payment = await testDb.operationalPayment.create({
        data: {
          organizationId: otherOrg.organizationId,
          provider: "PAYSTACK",
          providerReference: `op_retry_cross_org_${Date.now()}`,
          purpose: "FLEET_REMITTANCE",
          sourceModule: "fleet",
          sourceType: "FleetDriverPaymentSubmission",
          sourceId: "does-not-matter",
          payerId: otherOrg.userId,
          beneficiaryReference: "ACCT_other",
          amount: "50.00",
          currency: "USD",
          status: "SUCCESS",
          reconciliationStatus: "NEEDS_RETRY",
        },
      });

      await expect(retryOperationalPaymentReconciliation(org.organizationId, payment.id, org.userId)).rejects.toThrow();
    } finally {
      await cleanupTestOrg(otherOrg);
    }
  });
});
