import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { cleanupTestOrg, createTestOrg, type TestOrg } from "../setup/fixtures";
import { testDb } from "../setup/db";
import { processPaystackRenewal, recordPaystackRenewalFailure } from "@/platform/subscriptions/service";

let org: TestOrg;
let moduleId: string;

beforeAll(async () => {
  org = await createTestOrg("paystack-recurring");
  moduleId = (await testDb.module.findUniqueOrThrow({ where: { code: "fleet" } })).id;
});

afterAll(async () => cleanupTestOrg(org));

async function createRecurringSubscription(suffix: string) {
  return testDb.subscription.create({
    data: {
      organizationId: org.organizationId,
      moduleId,
      mode: "PLATFORM_MANAGED",
      status: "ACTIVE",
      durationMonths: 1,
      amount: "699.00",
      currency: "GHS",
      startsAt: new Date("2026-08-01T00:00:00.000Z"),
      endsAt: new Date("2026-09-01T00:00:00.000Z"),
      autoRenew: true,
      gatewayProvider: "PAYSTACK",
      paystackPlanCode: `PLN_${suffix}`,
      paystackSubscriptionCode: `SUB_${suffix}`,
      createdById: org.userId,
    },
  });
}

describe("Paystack recurring subscriptions (real PostgreSQL)", () => {
  it("extends access exactly once when the same successful renewal is replayed", async () => {
    const subscription = await createRecurringSubscription("success");
    const input = {
      subscriptionCode: "SUB_success",
      reference: "renewal-success-1",
      amount: "699.00",
      currency: "GHS",
      paidAt: new Date("2026-09-01T00:00:00.000Z"),
      nextPaymentAt: new Date("2026-10-01T00:00:00.000Z"),
    };
    await processPaystackRenewal(input);
    await processPaystackRenewal(input);
    const updated = await testDb.subscription.findUniqueOrThrow({ where: { id: subscription.id } });
    expect(updated.endsAt?.toISOString()).toBe("2026-10-01T00:00:00.000Z");
    expect(await testDb.subscriptionPayment.count({ where: { subscriptionId: subscription.id } })).toBe(1);
  });

  it("rejects a renewal whose verified amount does not match the agreement", async () => {
    const subscription = await createRecurringSubscription("mismatch");
    await expect(processPaystackRenewal({
      subscriptionCode: "SUB_mismatch",
      reference: "renewal-mismatch-1",
      amount: "1.00",
      currency: "GHS",
    })).rejects.toThrow(/does not match/);
    expect(await testDb.subscriptionPayment.count({ where: { subscriptionId: subscription.id } })).toBe(0);
  });

  it("records a failed renewal once and pauses the affected module", async () => {
    const subscription = await createRecurringSubscription("failed");
    const input = {
      subscriptionCode: "SUB_failed",
      reference: "invoice_INV_failed",
      invoiceCode: "INV_failed",
      amount: "699.00",
      currency: "GHS",
      reason: "Card declined",
    };
    await recordPaystackRenewalFailure(input);
    await recordPaystackRenewalFailure(input);
    const updated = await testDb.subscription.findUniqueOrThrow({ where: { id: subscription.id } });
    const moduleAccess = await testDb.organizationModule.findUniqueOrThrow({
      where: { organizationId_moduleId: { organizationId: org.organizationId, moduleId } },
    });
    expect(updated.status).toBe("PAST_DUE");
    expect(updated.renewalFailureCount).toBe(1);
    expect(moduleAccess.enabled).toBe(false);
    expect(await testDb.subscriptionPayment.count({ where: { subscriptionId: subscription.id } })).toBe(1);
  });
});
