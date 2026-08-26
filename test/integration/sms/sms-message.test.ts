import { describe, it, expect, vi, beforeAll, afterAll, beforeEach, afterEach } from "vitest";
import { testDb } from "../setup/db";
import { createTestOrg, cleanupTestOrg, type TestOrg } from "../setup/fixtures";

/**
 * Real-Postgres proof that sendSms() actually persists a correctly-scoped
 * SmsMessage row - the mocked suite (test/sms.test.ts) only proves the
 * branching logic against a mocked db, not that the real Prisma query is
 * well-formed against the real schema. Only the network call to mNotify is
 * mocked here; the SmsMessage write goes through the real disposable
 * database via TEST_DATABASE_URL (see test/integration/setup/environment.ts).
 */

let orgA: TestOrg;
let orgB: TestOrg;

beforeAll(async () => {
  orgA = await createTestOrg("orgA-sms");
  orgB = await createTestOrg("orgB-sms");
});

afterAll(async () => {
  await cleanupTestOrg(orgA);
  await cleanupTestOrg(orgB);
});

beforeEach(() => {
  process.env.MNOTIFY_API_KEY = "test-key";
  process.env.MNOTIFY_SENDER_ID = "RockFrost";
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("SmsMessage (real Postgres)", () => {
  it("persists a SENT row scoped to the sending organization, queryable back by purpose/relatedType/relatedId", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ status: "success", summary: { _id: "campaign-1" } }) }),
    );
    const { sendSms } = await import("@/lib/sms");

    const result = await sendSms({
      to: "0241234567",
      body: "Your prescription is ready for pickup.",
      purpose: "PHARMACY_PICKUP_READY",
      organizationId: orgA.organizationId,
      relatedType: "PharmacyDispensing",
      relatedId: "disp-123",
    });
    expect(result).toEqual({ ok: true });

    const rows = await testDb.smsMessage.findMany({ where: { organizationId: orgA.organizationId, purpose: "PHARMACY_PICKUP_READY" } });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ to: "0241234567", status: "SENT", relatedType: "PharmacyDispensing", relatedId: "disp-123" });

    // Org B never sees Org A's SmsMessage rows - proves the tenant scoping actually holds against real Postgres.
    const crossTenantRows = await testDb.smsMessage.findMany({ where: { organizationId: orgB.organizationId, purpose: "PHARMACY_PICKUP_READY" } });
    expect(crossTenantRows).toHaveLength(0);
  });

  it("persists a FAILED row with the provider's error message when mNotify rejects the send", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ status: "error", message: "Insufficient credit" }) }));
    const { sendSms } = await import("@/lib/sms");

    const result = await sendSms({ to: "0201234567", body: "test", purpose: "TEST_INTEGRATION", organizationId: orgA.organizationId });
    expect(result).toEqual({ ok: false, error: "Insufficient credit" });

    const row = await testDb.smsMessage.findFirst({ where: { organizationId: orgA.organizationId, purpose: "TEST_INTEGRATION" } });
    expect(row).toMatchObject({ status: "FAILED", error: "Insufficient credit" });
  });

  it("cascades on organization deletion, same as every other org-owned table", async () => {
    const throwaway = await createTestOrg("orgC-sms-cascade");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ status: "success" }) }));
    const { sendSms } = await import("@/lib/sms");
    await sendSms({ to: "0241234567", body: "test", purpose: "TEST_CASCADE", organizationId: throwaway.organizationId });

    expect(await testDb.smsMessage.count({ where: { organizationId: throwaway.organizationId } })).toBe(1);
    await cleanupTestOrg(throwaway);
    expect(await testDb.smsMessage.count({ where: { organizationId: throwaway.organizationId } })).toBe(0);
  });
});
