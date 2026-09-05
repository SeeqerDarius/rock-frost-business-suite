import { beforeEach, describe, expect, it, vi } from "vitest";
import { Prisma } from "@prisma/client";

const tx = {
  subscription: { findFirst: vi.fn(), findUnique: vi.fn(), findUniqueOrThrow: vi.fn(), update: vi.fn(), findMany: vi.fn(() => []) },
  subscriptionPayment: { findUnique: vi.fn(), upsert: vi.fn() },
  module: { findMany: vi.fn(() => []) },
  organization: { update: vi.fn() },
  // organizationModule.findFirst defaults to null so ensureRevenueAccountsForOrg's
  // own isModuleActiveForOrg("accounting") check no-ops immediately — these
  // tests aren't about the accounting integration, just that
  // finalizeActivation still calls it safely.
  organizationModule: { upsert: vi.fn(), updateMany: vi.fn(), findFirst: vi.fn(() => null) },
  moduleRequest: { update: vi.fn() },
  organizationMember: { findMany: vi.fn() },
  notification: { createMany: vi.fn() },
  $executeRaw: vi.fn(),
};
const mockDb = {
  subscription: { findFirst: vi.fn(), findUnique: vi.fn(), updateMany: vi.fn(), delete: vi.fn() },
  user: { findUnique: vi.fn() },
  $transaction: vi.fn(async (callback: (client: typeof tx) => unknown) => callback(tx)),
};
const mockLogAuditEvent = vi.fn();
const mockInitializeTransaction = vi.fn();
const mockDisablePaystackSubscription = vi.fn();

vi.mock("@/lib/db", () => ({ db: mockDb }));
vi.mock("@/lib/audit", () => ({ logAuditEvent: mockLogAuditEvent }));
vi.mock("@/lib/payments", () => ({ initializeTransaction: mockInitializeTransaction }));
vi.mock("@/lib/payments/paystack", () => ({
  createPlan: vi.fn(),
  disableSubscription: mockDisablePaystackSubscription,
  getSubscriptionManagementLink: vi.fn(),
}));

const { initiateGatewayPayment, activateSubscriptionFromGateway, resetAbandonedCheckout, cancelSubscription, PaystackRenewalNotRegisteredError } = await import("@/platform/subscriptions/service");

function baseSubscription(overrides: Record<string, unknown> = {}) {
  return {
    id: "subscription-1",
    organizationId: "org-1",
    moduleId: "module-1",
    moduleRequestId: null,
    mode: "PLATFORM_MANAGED",
    status: "PENDING_PAYMENT",
    durationMonths: 12,
    amount: new Prisma.Decimal("1200.00"),
    currency: "GHS",
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockDb.user.findUnique.mockResolvedValue({ email: "owner@example.com" });
  tx.organizationMember.findMany.mockResolvedValue([{ userId: "owner-1" }]);
  tx.subscriptionPayment.findUnique.mockResolvedValue(null);
  tx.subscription.findUniqueOrThrow.mockImplementation(async () => tx.subscription.findFirst());
});

describe("initiateGatewayPayment", () => {
  it("stamps the subscription with the gateway's reference and returns a checkout URL", async () => {
    mockDb.subscription.findFirst.mockResolvedValue(baseSubscription());
    mockInitializeTransaction.mockResolvedValue({ checkoutUrl: "https://checkout.example.com/abc", reference: "sub_subscription-1_xyz" });
    mockDb.subscription.updateMany.mockResolvedValue({ count: 1 });

    const result = await initiateGatewayPayment({
      subscriptionId: "subscription-1",
      organizationId: "org-1",
      provider: "PAYSTACK",
      payerUserId: "owner-1",
      callbackUrl: "https://app.example.com/callback",
    });

    expect(result).toEqual({ checkoutUrl: "https://checkout.example.com/abc" });
    expect(mockInitializeTransaction).toHaveBeenCalledWith("PAYSTACK", expect.objectContaining({
      amount: "1200.00",
      currency: "GHS",
      customerEmail: "owner@example.com",
    }));
    expect(mockDb.subscription.updateMany).toHaveBeenCalledWith({
      where: { id: "subscription-1", status: "PENDING_PAYMENT" },
      data: { paymentReference: "sub_subscription-1_xyz", gatewayProvider: "PAYSTACK", paystackPlanCode: undefined },
    });
  });

  it("rejects a subscription that does not belong to the caller's organization", async () => {
    mockDb.subscription.findFirst.mockResolvedValue(null);

    await expect(
      initiateGatewayPayment({
        subscriptionId: "subscription-1",
        organizationId: "org-2",
        provider: "PAYSTACK",
        payerUserId: "owner-1",
        callbackUrl: "https://app.example.com/callback",
      }),
    ).rejects.toThrow(/not found/);
    expect(mockInitializeTransaction).not.toHaveBeenCalled();
  });

  it("rejects a MANUAL_OFFLINE subscription", async () => {
    mockDb.subscription.findFirst.mockResolvedValue(baseSubscription({ mode: "MANUAL_OFFLINE" }));

    await expect(
      initiateGatewayPayment({
        subscriptionId: "subscription-1",
        organizationId: "org-1",
        provider: "PAYSTACK",
        payerUserId: "owner-1",
        callbackUrl: "https://app.example.com/callback",
      }),
    ).rejects.toThrow(/platform-managed/);
    expect(mockInitializeTransaction).not.toHaveBeenCalled();
  });

  it("rejects a subscription that is not awaiting payment", async () => {
    mockDb.subscription.findFirst.mockResolvedValue(baseSubscription({ status: "ACTIVE" }));

    await expect(
      initiateGatewayPayment({
        subscriptionId: "subscription-1",
        organizationId: "org-1",
        provider: "PAYSTACK",
        payerUserId: "owner-1",
        callbackUrl: "https://app.example.com/callback",
      }),
    ).rejects.toThrow(/awaiting payment/);
    expect(mockInitializeTransaction).not.toHaveBeenCalled();
  });
});

describe("activateSubscriptionFromGateway", () => {
  it("activates a pending subscription once the verified amount/currency match", async () => {
    tx.subscription.findFirst.mockResolvedValue(baseSubscription());
    tx.subscription.findUniqueOrThrow.mockResolvedValue(baseSubscription());
    tx.subscription.update.mockResolvedValue({ id: "subscription-1", status: "ACTIVE" });

    await activateSubscriptionFromGateway({
      reference: "sub_subscription-1_xyz",
      provider: "PAYSTACK",
      verifiedAmount: "1200.00",
      verifiedCurrency: "GHS",
    });

    expect(tx.subscription.update).toHaveBeenCalledWith({
      where: { id: "subscription-1" },
      data: expect.objectContaining({
        status: "ACTIVE",
        paymentReference: "sub_subscription-1_xyz",
        paymentMethod: "PAYSTACK",
        activatedById: null,
      }),
    });
    expect(tx.organizationModule.upsert).toHaveBeenCalled();
    expect(tx.organization.update).toHaveBeenCalledWith({
      where: { id: "org-1" },
      data: { status: "ACTIVE" },
    });
    expect(tx.notification.createMany).toHaveBeenCalled();
  });

  it("is idempotent — a second call against an already-ACTIVE subscription is a no-op", async () => {
    tx.subscription.findFirst.mockResolvedValue(baseSubscription({ status: "ACTIVE" }));
    tx.subscription.findUniqueOrThrow.mockResolvedValue(baseSubscription({ status: "ACTIVE" }));

    const result = await activateSubscriptionFromGateway({
      reference: "sub_subscription-1_xyz",
      provider: "PAYSTACK",
      verifiedAmount: "1200.00",
      verifiedCurrency: "GHS",
    });

    expect(result).toMatchObject({ status: "ACTIVE" });
    expect(tx.subscription.update).not.toHaveBeenCalled();
    expect(tx.organizationModule.upsert).not.toHaveBeenCalled();
  });

  it("rejects a verified amount that does not match the subscription's stored amount", async () => {
    tx.subscription.findFirst.mockResolvedValue(baseSubscription());
    tx.subscription.findUniqueOrThrow.mockResolvedValue(baseSubscription());

    await expect(
      activateSubscriptionFromGateway({
        reference: "sub_subscription-1_xyz",
        provider: "PAYSTACK",
        verifiedAmount: "1.00",
        verifiedCurrency: "GHS",
      }),
    ).rejects.toThrow(/does not match/);
    expect(tx.subscription.update).not.toHaveBeenCalled();
  });

  it("rejects when no subscription matches the reference/provider", async () => {
    tx.subscription.findFirst.mockResolvedValue(null);

    await expect(
      activateSubscriptionFromGateway({
        reference: "unknown-ref",
        provider: "PAYSTACK",
        verifiedAmount: "1200.00",
        verifiedCurrency: "GHS",
      }),
    ).rejects.toThrow(/not found/);
  });
});

describe("resetAbandonedCheckout", () => {
  it("deletes a never-activated PENDING_PAYMENT subscription and logs the abandonment", async () => {
    mockDb.subscription.findFirst.mockResolvedValue(
      baseSubscription({ activatedById: null, paidAt: null, gatewayProvider: "PAYSTACK", paymentReference: "sub_subscription-1_xyz" }),
    );

    await resetAbandonedCheckout("subscription-1", "org-1");

    expect(mockDb.subscription.delete).toHaveBeenCalledWith({ where: { id: "subscription-1" } });
    expect(mockLogAuditEvent).toHaveBeenCalledWith(expect.objectContaining({
      organizationId: "org-1",
      action: "subscription.checkout_abandoned",
      entityId: "subscription-1",
    }));
  });

  it("never deletes a PAST_DUE subscription retrying a renewal payment", async () => {
    mockDb.subscription.findFirst.mockResolvedValue(baseSubscription({ status: "PAST_DUE" }));

    await resetAbandonedCheckout("subscription-1", "org-1");

    expect(mockDb.subscription.delete).not.toHaveBeenCalled();
    expect(mockLogAuditEvent).not.toHaveBeenCalled();
  });

  it("never deletes an already-ACTIVE subscription", async () => {
    mockDb.subscription.findFirst.mockResolvedValue(baseSubscription({ status: "ACTIVE" }));

    await resetAbandonedCheckout("subscription-1", "org-1");

    expect(mockDb.subscription.delete).not.toHaveBeenCalled();
  });

  it("never deletes a PENDING_PAYMENT subscription that already has an activation or payment recorded", async () => {
    mockDb.subscription.findFirst.mockResolvedValue(baseSubscription({ activatedById: "user-1" }));
    await resetAbandonedCheckout("subscription-1", "org-1");
    expect(mockDb.subscription.delete).not.toHaveBeenCalled();

    mockDb.subscription.findFirst.mockResolvedValue(baseSubscription({ paidAt: new Date() }));
    await resetAbandonedCheckout("subscription-1", "org-1");
    expect(mockDb.subscription.delete).not.toHaveBeenCalled();
  });

  it("is a no-op when the subscription doesn't belong to the caller's organization", async () => {
    mockDb.subscription.findFirst.mockResolvedValue(null);

    await resetAbandonedCheckout("subscription-1", "org-2");

    expect(mockDb.subscription.delete).not.toHaveBeenCalled();
    expect(mockLogAuditEvent).not.toHaveBeenCalled();
  });
});

describe("cancelSubscription", () => {
  it("throws PaystackRenewalNotRegisteredError, not a generic Error, when auto-renew is on but Paystack never finished registering the subscription", async () => {
    mockDb.subscription.findUnique.mockResolvedValue(
      baseSubscription({ autoRenew: true, gatewayProvider: "PAYSTACK", paystackSubscriptionCode: null, paystackEmailToken: null }),
    );

    await expect(cancelSubscription({ subscriptionId: "subscription-1", actorId: "operator-1" })).rejects.toThrow(PaystackRenewalNotRegisteredError);
    expect(mockDisablePaystackSubscription).not.toHaveBeenCalled();
    expect(mockDb.$transaction).not.toHaveBeenCalled();
  });

  it("disables the Paystack subscription and cancels locally when auto-renew is fully registered", async () => {
    mockDb.subscription.findUnique.mockResolvedValue(
      baseSubscription({ autoRenew: true, gatewayProvider: "PAYSTACK", paystackSubscriptionCode: "SUB_1", paystackEmailToken: "token" }),
    );
    tx.subscription.findUnique.mockResolvedValueOnce(baseSubscription({ entitledModuleKeys: [] }));
    tx.subscription.findFirst.mockResolvedValueOnce(null);
    tx.subscription.update.mockResolvedValue({ id: "subscription-1", status: "CANCELLED" });

    await cancelSubscription({ subscriptionId: "subscription-1", actorId: "operator-1" });

    expect(mockDisablePaystackSubscription).toHaveBeenCalledWith("SUB_1", "token");
    expect(tx.subscription.update).toHaveBeenCalledWith({ where: { id: "subscription-1" }, data: { status: "CANCELLED", autoRenew: false } });
    expect(tx.organizationModule.updateMany).toHaveBeenCalledWith({
      where: { organizationId: "org-1", moduleId: { in: ["module-1"] } },
      data: { enabled: false },
    });
  });
});
