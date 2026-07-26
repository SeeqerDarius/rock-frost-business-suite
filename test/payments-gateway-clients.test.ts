import { createHmac } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as paystack from "@/lib/payments/paystack";
import * as flutterwave from "@/lib/payments/flutterwave";
import { isGatewayConfigured, configuredGatewayProviders } from "@/lib/payments/config";

const fetchMock = vi.fn();

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockReset();
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("Paystack client", () => {
  it("converts the major-unit amount to subunits when initializing a transaction", async () => {
    vi.stubEnv("PAYSTACK_SECRET_KEY", "sk_test_123");
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ status: true, data: { authorization_url: "https://checkout.paystack.com/abc", reference: "ref-1" } }),
    });

    const result = await paystack.initializeTransaction({
      reference: "ref-1",
      amount: "1200.50",
      currency: "GHS",
      customerEmail: "owner@example.com",
      callbackUrl: "https://app.example.com/callback",
    });

    expect(result).toEqual({ checkoutUrl: "https://checkout.paystack.com/abc", reference: "ref-1" });
    const [, options] = fetchMock.mock.calls[0];
    const body = JSON.parse(options.body);
    expect(body.amount).toBe(120050);
    expect(options.headers.Authorization).toBe("Bearer sk_test_123");
  });

  it("converts subunits back to a 2-decimal major-unit string when verifying", async () => {
    vi.stubEnv("PAYSTACK_SECRET_KEY", "sk_test_123");
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ status: true, data: { status: "success", reference: "ref-1", amount: 120050, currency: "ghs" } }),
    });

    const result = await paystack.verifyTransaction("ref-1");

    expect(result).toEqual({ success: true, reference: "ref-1", amount: "1200.50", currency: "GHS" });
  });

  it("throws when the secret key is unset", async () => {
    vi.stubEnv("PAYSTACK_SECRET_KEY", "");
    await expect(paystack.verifyTransaction("ref-1")).rejects.toThrow(/not configured/);
  });

  it("accepts a correctly signed webhook body", () => {
    vi.stubEnv("PAYSTACK_SECRET_KEY", "sk_test_123");
    const rawBody = JSON.stringify({ event: "charge.success", data: { reference: "ref-1" } });
    const signature = createHmac("sha512", "sk_test_123").update(rawBody).digest("hex");

    expect(paystack.verifySignature(rawBody, signature)).toBe(true);
  });

  it("rejects a webhook body with a mismatched or missing signature", () => {
    vi.stubEnv("PAYSTACK_SECRET_KEY", "sk_test_123");
    const rawBody = JSON.stringify({ event: "charge.success", data: { reference: "ref-1" } });

    expect(paystack.verifySignature(rawBody, "not-a-real-signature")).toBe(false);
    expect(paystack.verifySignature(rawBody, null)).toBe(false);
  });
});

describe("Flutterwave client", () => {
  it("passes the amount through in major units when initializing a transaction", async () => {
    vi.stubEnv("FLUTTERWAVE_SECRET_KEY", "FLWSECK_test_123");
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ status: "success", data: { link: "https://checkout.flutterwave.com/abc" } }),
    });

    const result = await flutterwave.initializeTransaction({
      reference: "ref-1",
      amount: "1200.50",
      currency: "GHS",
      customerEmail: "owner@example.com",
      callbackUrl: "https://app.example.com/callback",
    });

    expect(result).toEqual({ checkoutUrl: "https://checkout.flutterwave.com/abc", reference: "ref-1" });
    const [, options] = fetchMock.mock.calls[0];
    const body = JSON.parse(options.body);
    expect(body.amount).toBe("1200.50");
  });

  it("formats the verified amount to 2 decimal places", async () => {
    vi.stubEnv("FLUTTERWAVE_SECRET_KEY", "FLWSECK_test_123");
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ status: "success", data: { status: "successful", tx_ref: "ref-1", amount: 1200.5, currency: "ghs" } }),
    });

    const result = await flutterwave.verifyTransaction("ref-1");

    expect(result).toEqual({ success: true, reference: "ref-1", amount: "1200.50", currency: "GHS" });
  });

  it("accepts a webhook whose verif-hash matches the configured secret", () => {
    vi.stubEnv("FLUTTERWAVE_WEBHOOK_HASH", "shared-secret");
    expect(flutterwave.verifyWebhookHash("shared-secret")).toBe(true);
  });

  it("rejects a webhook with a mismatched, missing, or unconfigured hash", () => {
    vi.stubEnv("FLUTTERWAVE_WEBHOOK_HASH", "shared-secret");
    expect(flutterwave.verifyWebhookHash("wrong-secret")).toBe(false);
    expect(flutterwave.verifyWebhookHash(null)).toBe(false);

    vi.stubEnv("FLUTTERWAVE_WEBHOOK_HASH", "");
    expect(flutterwave.verifyWebhookHash("shared-secret")).toBe(false);
  });
});

describe("gateway configuration", () => {
  it("reports a gateway as configured only once its secret key is set", () => {
    vi.stubEnv("PAYSTACK_SECRET_KEY", "");
    vi.stubEnv("FLUTTERWAVE_SECRET_KEY", "");
    expect(isGatewayConfigured("PAYSTACK")).toBe(false);
    expect(isGatewayConfigured("FLUTTERWAVE")).toBe(false);
    expect(configuredGatewayProviders()).toEqual([]);

    vi.stubEnv("PAYSTACK_SECRET_KEY", "sk_test_123");
    expect(isGatewayConfigured("PAYSTACK")).toBe(true);
    expect(configuredGatewayProviders()).toEqual(["PAYSTACK"]);
  });
});
