import { beforeEach, describe, expect, it, vi } from "vitest";

const verifySignature = vi.fn(() => true);
const verifyTransaction = vi.fn();
const activate = vi.fn();
const renew = vi.fn();
const fail = vi.fn();
const register = vi.fn();
const updateState = vi.fn();

vi.mock("@/lib/payments", () => ({
  verifyPaystackSignature: verifySignature,
  verifyTransaction,
}));
vi.mock("@/platform/subscriptions/service", () => ({
  activateSubscriptionFromGateway: activate,
  processPaystackRenewal: renew,
  recordPaystackRenewalFailure: fail,
  registerPaystackSubscription: register,
  updatePaystackSubscriptionState: updateState,
}));
vi.mock("@/lib/audit", () => ({ logAuditEvent: vi.fn() }));

const { POST } = await import("@/app/api/payments/paystack/webhook/route");

function webhook(event: string, data: Record<string, unknown>) {
  return new Request("https://app.example.com/api/payments/paystack/webhook", {
    method: "POST",
    headers: { "x-paystack-signature": "valid" },
    body: JSON.stringify({ event, data }),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  verifySignature.mockReturnValue(true);
  verifyTransaction.mockResolvedValue({ success: true, reference: "renewal-1", amount: "699.00", currency: "GHS" });
});

describe("Paystack recurring webhook", () => {
  it("routes a recurring charge to renewal processing after initial-reference lookup misses", async () => {
    activate.mockRejectedValue(new Error("Subscription not found for this payment reference."));
    const response = await POST(webhook("charge.success", {
      reference: "renewal-1",
      paid_at: "2026-09-01T00:00:00.000Z",
      subscription: { subscription_code: "SUB_abc", next_payment_date: "2026-10-01T00:00:00.000Z" },
    }) as never);
    expect(response.status).toBe(200);
    expect(renew).toHaveBeenCalledWith(expect.objectContaining({ subscriptionCode: "SUB_abc", reference: "renewal-1", amount: "699.00" }));
  });

  it("records the Paystack subscription code from subscription.create", async () => {
    await POST(webhook("subscription.create", {
      subscription_code: "SUB_abc",
      email_token: "token",
      status: "active",
      plan: { plan_code: "PLN_abc" },
      customer: { customer_code: "CUS_abc" },
      next_payment_date: "2026-10-01T00:00:00.000Z",
    }) as never);
    expect(register).toHaveBeenCalledWith(expect.objectContaining({ planCode: "PLN_abc", subscriptionCode: "SUB_abc", customerCode: "CUS_abc" }));
  });

  it("records a failed invoice with a stable idempotency reference", async () => {
    await POST(webhook("invoice.payment_failed", {
      invoice_code: "INV_abc",
      amount: 69900,
      currency: "GHS",
      subscription: { subscription_code: "SUB_abc" },
    }) as never);
    expect(fail).toHaveBeenCalledWith(expect.objectContaining({ subscriptionCode: "SUB_abc", reference: "invoice_INV_abc", amount: "699.00" }));
  });
});
