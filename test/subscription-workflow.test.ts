import { beforeEach, describe, expect, it, vi } from "vitest";

const tx = {
  subscription: { create: vi.fn(), findUnique: vi.fn(), update: vi.fn(), findFirst: vi.fn() },
  organizationModule: { upsert: vi.fn(), updateMany: vi.fn() },
  moduleRequest: { update: vi.fn() },
  organizationMember: { findMany: vi.fn() },
  notification: { createMany: vi.fn() },
};
const mockDb = {
  organization: { findUnique: vi.fn() },
  module: { findFirst: vi.fn() },
  $transaction: vi.fn(async (callback: (client: typeof tx) => unknown) => callback(tx)),
};
const mockLogAuditEvent = vi.fn();

vi.mock("@/lib/db", () => ({ db: mockDb }));
vi.mock("@/lib/audit", () => ({ logAuditEvent: mockLogAuditEvent }));

const { activateSubscription, createSubscription } = await import("@/platform/subscriptions/service");

beforeEach(() => {
  vi.clearAllMocks();
  mockDb.organization.findUnique.mockResolvedValue({ id: "org-1" });
  mockDb.module.findFirst.mockResolvedValue({ id: "module-1" });
  tx.subscription.create.mockResolvedValue({ id: "subscription-1" });
  tx.organizationMember.findMany.mockResolvedValue([{ userId: "owner-1" }]);
});

describe("subscription workflow", () => {
  it("creates a pending subscription without enabling the module before payment", async () => {
    await createSubscription({
      organizationId: "org-1",
      moduleId: "module-1",
      mode: "MANUAL_OFFLINE",
      durationMonths: 6,
      amount: "1200.00",
      currency: "GHS",
      autoRenew: false,
      actorId: "operator-1",
    });

    expect(tx.subscription.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ status: "PENDING_PAYMENT", durationMonths: 6 }),
    });
    expect(tx.organizationModule.upsert).not.toHaveBeenCalled();
  });

  it("activates paid access for the subscribed duration and completes the linked request", async () => {
    tx.subscription.findUnique.mockResolvedValue({
      id: "subscription-1",
      organizationId: "org-1",
      moduleId: "module-1",
      moduleRequestId: "request-1",
      durationMonths: 12,
      status: "PENDING_PAYMENT",
    });
    tx.subscription.update.mockResolvedValue({ id: "subscription-1", status: "ACTIVE" });

    await activateSubscription({
      subscriptionId: "subscription-1",
      actorId: "operator-1",
      paymentReference: "MOMO-123",
      paymentMethod: "Mobile money",
      startsAt: new Date("2026-08-01T00:00:00Z"),
    });

    expect(tx.subscription.update).toHaveBeenCalledWith({
      where: { id: "subscription-1" },
      data: expect.objectContaining({
        status: "ACTIVE",
        endsAt: new Date("2027-08-01T00:00:00.000Z"),
        paymentReference: "MOMO-123",
      }),
    });
    expect(tx.organizationModule.upsert).toHaveBeenCalled();
    expect(tx.moduleRequest.update).toHaveBeenCalledWith({
      where: { id: "request-1" },
      data: expect.objectContaining({ status: "COMPLETED" }),
    });
    expect(tx.notification.createMany).toHaveBeenCalled();
  });
});
