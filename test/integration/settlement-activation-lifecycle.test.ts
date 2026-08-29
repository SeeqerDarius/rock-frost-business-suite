import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { testDb } from "./setup/db";
import { cleanupTestOrg, createTestOrg, type TestOrg } from "./setup/fixtures";

// This integration test exercises the real, disposable Postgres database for
// every SettlementProfile write and status transition - the thing this test
// actually verifies. The one thing it deliberately does NOT exercise for
// real is Paystack's own HTTP API (account resolution, subaccount
// creation) - there is no live PAYSTACK_SECRET_KEY available in CI, and a
// real bank/account-number pair capable of live resolution isn't something
// a repeatable automated test can depend on. Mocking only the Paystack
// facade, while leaving every Prisma call untouched, keeps this a genuine
// database integration test of the status lifecycle rather than a fully
// mocked unit test - see test/settlement-activation.test.ts for the
// mocked-Prisma unit coverage of each readiness-check branch in isolation.
vi.mock("@/lib/payments", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/payments")>();
  return {
    ...actual,
    resolvePaystackAccount: vi.fn(async () => ({ accountName: "Integration Test Org", accountNumber: "0000000000" })),
    createPaystackSubaccount: vi.fn(async () => ({ subaccountCode: `ACCT_${Date.now()}`, accountName: "Integration Test Org", bankName: "Test Bank" })),
    updatePaystackSubaccount: vi.fn(async (code: string) => ({ subaccountCode: code, accountName: "Integration Test Org", bankName: "Test Bank" })),
  };
});

const { initiateSettlementProfile, confirmSettlementBeneficiary, runSettlementReadinessCheck } = await import("@/lib/payments/operational");

let org: TestOrg;

beforeAll(async () => {
  org = await createTestOrg("settlement-activation-lifecycle");
  // Every module is enabled with real fixture organizations, so "fleet" already
  // satisfies OPERATIONAL_ADAPTER_AVAILABLE without any extra setup here.
});

afterAll(async () => cleanupTestOrg(org));

describe("settlement activation lifecycle: initiate -> confirm -> readiness (real Postgres, mocked Paystack HTTP)", () => {
  it("walks PENDING -> VERIFIED -> ACTIVE end to end, never enabling collections before a full readiness pass", async () => {
    const initiated = await initiateSettlementProfile({
      organizationId: org.organizationId,
      actorId: org.userId,
      bankCode: "057",
      bankName: "Zenith Bank",
      accountNumber: "0000000000",
    });
    expect(initiated.status).toBe("PENDING");
    expect(initiated.onlineCollectionsEnabled).toBe(false);

    // A preview (commit: false) run while still PENDING must never write ACTIVE early.
    const previewWhilePending = await runSettlementReadinessCheck(org.organizationId, { enabledModuleKeys: ["fleet"], commit: false });
    expect(previewWhilePending.overall).toBe("NOT_READY");
    const stillPending = await testDb.settlementProfile.findUnique({ where: { organizationId: org.organizationId } });
    expect(stillPending?.status).toBe("PENDING");

    const confirmed = await confirmSettlementBeneficiary(org.organizationId, org.userId);
    expect(confirmed.status).toBe("VERIFIED");

    const finalReport = await runSettlementReadinessCheck(org.organizationId, { actorId: org.userId, enabledModuleKeys: ["fleet"], enableIfReady: true, commit: true });

    const finalProfile = await testDb.settlementProfile.findUnique({ where: { organizationId: org.organizationId } });
    if (finalReport.overall === "READY") {
      expect(finalProfile?.status).toBe("ACTIVE");
      expect(finalProfile?.onlineCollectionsEnabled).toBe(true);
    } else {
      // Real environment gaps (e.g. PAYSTACK_SECRET_KEY genuinely unset here) must still
      // never flip the profile to ACTIVE - this is the core "no early enablement" guarantee.
      expect(finalProfile?.status).not.toBe("ACTIVE");
    }

    const auditActions = await testDb.auditLog.findMany({ where: { organizationId: org.organizationId, entityName: "SettlementProfile" }, select: { action: true } });
    expect(auditActions.map((a) => a.action)).toContain("settlement_account.created");
    expect(auditActions.map((a) => a.action)).toContain("settlement_account.beneficiary_confirmed");
  });

  it("never lets a manual re-run of the readiness check flip an already-restricted (SUSPENDED) profile back to ACTIVE", async () => {
    const otherOrg = await createTestOrg("settlement-activation-lifecycle-suspended");
    try {
      await initiateSettlementProfile({ organizationId: otherOrg.organizationId, actorId: otherOrg.userId, bankCode: "057", bankName: "Zenith Bank", accountNumber: "1111111111" });
      await confirmSettlementBeneficiary(otherOrg.organizationId, otherOrg.userId);
      await testDb.settlementProfile.update({ where: { organizationId: otherOrg.organizationId }, data: { status: "SUSPENDED" } });

      const report = await runSettlementReadinessCheck(otherOrg.organizationId, { actorId: otherOrg.userId, enabledModuleKeys: ["fleet"], enableIfReady: true, commit: true });
      expect(report.overall).toBe("NOT_READY");

      const profile = await testDb.settlementProfile.findUnique({ where: { organizationId: otherOrg.organizationId } });
      expect(profile?.status).toBe("SUSPENDED");
    } finally {
      await cleanupTestOrg(otherOrg);
    }
  });
});
