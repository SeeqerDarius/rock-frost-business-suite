import { beforeEach, describe, expect, it, vi } from "vitest";
import { Prisma } from "@prisma/client";

const tx = {
  subscription: { findFirst: vi.fn(), update: vi.fn() },
  organization: { update: vi.fn() },
  organizationModule: { upsert: vi.fn(), updateMany: vi.fn() },
  moduleRequest: { update: vi.fn() },
  organizationMember: { findMany: vi.fn() },
  notification: { createMany: vi.fn() },
};
const mockDb = {
  subscription: { findFirst: vi.fn(), updateMany: vi.fn() },
  user: { findUnique: vi.fn() },
  $transaction: vi.fn(async (callback: (client: typeof tx) => unknown) => callback(tx)),
};
const mockLogAuditEvent = vi.fn();
const mockInitializeTransaction = vi.fn();

vi.mock("@/lib/db", () => ({ db: mockDb }));
vi.mock("@/lib/audit", () => ({ logAuditEvent: mockLogAuditEvent }));
vi.mock("@/lib/payments", () => ({ initializeTransaction: mockInitializeTransaction }));

const { initiateGatewayPayment, activateSubscriptionFromGateway } = await import("@/platform/subscriptions/service");

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
      data: { paymentReference: "sub_subscription-1_xyz", gatewayProvider: "PAYSTACK" },
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
