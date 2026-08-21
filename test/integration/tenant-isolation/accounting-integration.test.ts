import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { testDb } from "../setup/db";
import { cleanupTestOrg, createTestOrg, type TestOrg } from "../setup/fixtures";
import { createFleetPayment, updateFleetPaymentStatus } from "@/modules/fleet/service";
import { postModuleRevenue, reverseModuleRevenue, ensureRevenueAccountsForOrg } from "@/lib/accounting-integration";

/**
 * Real-Postgres coverage for the cross-module revenue posting built on top
 * of Codex's accounting-foundation branch: a source module (Fleet, as the
 * representative case — every other module wired in this tranche goes
 * through the exact same postModuleRevenue/reverseModuleRevenue helper)
 * posts into Accounting's ledger only when the organization has actually
 * activated Accounting, and its own operation never fails either way.
 */

let org: TestOrg;

beforeAll(async () => {
  org = await createTestOrg("accounting-integration");
});

afterAll(async () => {
  await cleanupTestOrg(org);
});

async function verifiedFleetPayment(organizationId: string, amount: string) {
  const created = await createFleetPayment(organizationId, {
    reference: `REF-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    date: new Date(),
    type: "WEEKLY_SALES",
    amount,
  });
  return updateFleetPaymentStatus(organizationId, created.id, "VERIFIED", true);
}

describe("Cross-module accounting posting (real Postgres)", () => {
  it("posts a balanced Cash/Fleet Revenue journal entry when a Fleet payment is verified, with Accounting enabled by default", async () => {
    const payment = await verifiedFleetPayment(org.organizationId, "150.00");

    const result = await postModuleRevenue(org.organizationId, {
      sourceModule: "fleet",
      sourceType: "FLEET_PAYMENT",
      sourceId: payment.id,
      postingPurpose: "COLLECTED",
      amount: payment.amount.toString(),
      entryDate: payment.date,
      description: "Test fleet payment",
      createdById: org.userId,
    });
    expect(result.posted).toBe(true);
    if (!result.posted) throw new Error("unreachable");

    const entry = await testDb.accountingJournalEntry.findUniqueOrThrow({ where: { id: result.journalEntryId }, include: { lines: { include: { account: true } } } });
    expect(entry.sourceType).toBe("FLEET_PAYMENT");
    expect(entry.sourceId).toBe(payment.id);
    const cashLine = entry.lines.find((line) => line.account.code === "1000");
    const revenueLine = entry.lines.find((line) => line.account.code === "4100");
    expect(cashLine?.debit.toString()).toBe("150");
    expect(revenueLine?.credit.toString()).toBe("150");
    expect(revenueLine?.account.name).toBe("Fleet Revenue");
  });

  it("retrying the same posting identity never double-counts (idempotent)", async () => {
    const payment = await verifiedFleetPayment(org.organizationId, "80.00");
    const input = { sourceModule: "fleet" as const, sourceType: "FLEET_PAYMENT", sourceId: payment.id, postingPurpose: "COLLECTED", amount: payment.amount.toString(), entryDate: payment.date, description: "Idempotency test" };

    const first = await postModuleRevenue(org.organizationId, input);
    const second = await postModuleRevenue(org.organizationId, input);
    expect(first).toEqual(second);

    const count = await testDb.accountingJournalEntry.count({ where: { organizationId: org.organizationId, sourceType: "FLEET_PAYMENT", sourceId: payment.id, postingPurpose: "COLLECTED" } });
    expect(count).toBe(1);
  });

  it("reverses a posted entry, restoring the Fleet Revenue and Cash balances to their prior values", async () => {
    const payment = await verifiedFleetPayment(org.organizationId, "60.00");
    const posted = await postModuleRevenue(org.organizationId, { sourceModule: "fleet", sourceType: "FLEET_PAYMENT", sourceId: payment.id, postingPurpose: "COLLECTED", amount: payment.amount.toString(), entryDate: payment.date, description: "To be reversed" });
    if (!posted.posted) throw new Error("setup failed");

    const before = await testDb.accountingAccount.findFirstOrThrow({ where: { organizationId: org.organizationId, code: "4100" }, include: { journalLines: true } });
    const balanceBefore = before.journalLines.reduce((sum, line) => sum + Number(line.credit) - Number(line.debit), 0);

    const reversal = await reverseModuleRevenue(org.organizationId, { sourceType: "FLEET_PAYMENT", sourceId: payment.id, postingPurpose: "COLLECTED", reason: "Payment rejected in test" });
    expect(reversal.posted).toBe(true);

    const after = await testDb.accountingAccount.findFirstOrThrow({ where: { organizationId: org.organizationId, code: "4100" }, include: { journalLines: true } });
    const balanceAfter = after.journalLines.reduce((sum, line) => sum + Number(line.credit) - Number(line.debit), 0);
    expect(balanceAfter).toBe(balanceBefore - 60);
  });

  it("does not post — and does not throw — when the organization has not activated Accounting; the source module's own record still succeeds", async () => {
    const noAccountingOrg = await createTestOrg("accounting-integration-disabled");
    try {
      await testDb.organizationModule.updateMany({ where: { organizationId: noAccountingOrg.organizationId, module: { code: "accounting" } }, data: { enabled: false } });

      const payment = await verifiedFleetPayment(noAccountingOrg.organizationId, "40.00");
      expect(payment.status).toBe("VERIFIED");

      const result = await postModuleRevenue(noAccountingOrg.organizationId, {
        sourceModule: "fleet",
        sourceType: "FLEET_PAYMENT",
        sourceId: payment.id,
        postingPurpose: "COLLECTED",
        amount: payment.amount.toString(),
        entryDate: payment.date,
        description: "Should not post",
      });
      expect(result).toEqual({ posted: false, reason: "accounting-not-enabled" });

      const entryCount = await testDb.accountingJournalEntry.count({ where: { organizationId: noAccountingOrg.organizationId, sourceType: "FLEET_PAYMENT", sourceId: payment.id } });
      expect(entryCount).toBe(0);
    } finally {
      await cleanupTestOrg(noAccountingOrg);
    }
  });

  it("never posts or reads across organizations — a second org's identical posting identity is a distinct entry", async () => {
    const orgB = await createTestOrg("accounting-integration-tenant-b");
    try {
      const paymentA = await verifiedFleetPayment(org.organizationId, "25.00");
      const paymentB = await verifiedFleetPayment(orgB.organizationId, "25.00");

      // Deliberately reuse the same sourceId across two different organizations to prove isolation is keyed on organizationId too, not sourceId alone.
      const sharedSourceId = "shared-source-id-for-tenant-isolation-test";
      const resultA = await postModuleRevenue(org.organizationId, { sourceModule: "fleet", sourceType: "FLEET_PAYMENT_TENANT_TEST", sourceId: sharedSourceId, postingPurpose: "COLLECTED", amount: paymentA.amount.toString(), entryDate: new Date(), description: "Org A" });
      const resultB = await postModuleRevenue(orgB.organizationId, { sourceModule: "fleet", sourceType: "FLEET_PAYMENT_TENANT_TEST", sourceId: sharedSourceId, postingPurpose: "COLLECTED", amount: paymentB.amount.toString(), entryDate: new Date(), description: "Org B" });

      expect(resultA.posted && resultB.posted).toBe(true);
      if (!resultA.posted || !resultB.posted) throw new Error("unreachable");
      expect(resultA.journalEntryId).not.toBe(resultB.journalEntryId);

      const entryA = await testDb.accountingJournalEntry.findFirstOrThrow({ where: { id: resultA.journalEntryId } });
      const entryB = await testDb.accountingJournalEntry.findFirstOrThrow({ where: { id: resultB.journalEntryId } });
      expect(entryA.organizationId).toBe(org.organizationId);
      expect(entryB.organizationId).toBe(orgB.organizationId);
    } finally {
      await cleanupTestOrg(orgB);
    }
  });
});

describe("Eager chart-of-accounts provisioning on module activation (real Postgres)", () => {
  it("creates every active revenue module's account with no prior transaction, before any money has ever been posted", async () => {
    const freshOrg = await createTestOrg("accounting-eager-provisioning");
    try {
      await ensureRevenueAccountsForOrg(testDb, freshOrg.organizationId);

      const fleetAccount = await testDb.accountingAccount.findFirst({ where: { organizationId: freshOrg.organizationId, code: "4100" } });
      const pharmacyAccount = await testDb.accountingAccount.findFirst({ where: { organizationId: freshOrg.organizationId, code: "4200" } });
      expect(fleetAccount?.name).toBe("Fleet Revenue");
      expect(fleetAccount?.type).toBe("REVENUE");
      expect(pharmacyAccount?.name).toBe("Pharmacy Revenue");

      // No transaction was ever posted — the account exists, at a zero balance.
      const zeroBalanceLines = await testDb.accountingJournalLine.count({ where: { accountId: fleetAccount!.id } });
      expect(zeroBalanceLines).toBe(0);
    } finally {
      await cleanupTestOrg(freshOrg);
    }
  });

  it("only creates accounts for modules the organization actually has active, and none at all when Accounting itself is inactive", async () => {
    const partialOrg = await createTestOrg("accounting-eager-provisioning-partial");
    try {
      await testDb.organizationModule.updateMany({ where: { organizationId: partialOrg.organizationId, module: { code: "pharmacy" } }, data: { enabled: false } });
      await ensureRevenueAccountsForOrg(testDb, partialOrg.organizationId);

      const fleetAccount = await testDb.accountingAccount.findFirst({ where: { organizationId: partialOrg.organizationId, code: "4100" } });
      const pharmacyAccount = await testDb.accountingAccount.findFirst({ where: { organizationId: partialOrg.organizationId, code: "4200" } });
      expect(fleetAccount).not.toBeNull();
      expect(pharmacyAccount).toBeNull();

      await testDb.organizationModule.updateMany({ where: { organizationId: partialOrg.organizationId, module: { code: "accounting" } }, data: { enabled: false } });
      await testDb.accountingAccount.deleteMany({ where: { organizationId: partialOrg.organizationId, code: "4100" } });
      await ensureRevenueAccountsForOrg(testDb, partialOrg.organizationId);
      const noAccountingAccount = await testDb.accountingAccount.findFirst({ where: { organizationId: partialOrg.organizationId, code: "4100" } });
      expect(noAccountingAccount).toBeNull();
    } finally {
      await cleanupTestOrg(partialOrg);
    }
  });

  it("is idempotent — calling it twice never creates a duplicate account", async () => {
    const idempotentOrg = await createTestOrg("accounting-eager-provisioning-idempotent");
    try {
      await ensureRevenueAccountsForOrg(testDb, idempotentOrg.organizationId);
      await ensureRevenueAccountsForOrg(testDb, idempotentOrg.organizationId);

      const count = await testDb.accountingAccount.count({ where: { organizationId: idempotentOrg.organizationId, code: "4100" } });
      expect(count).toBe(1);
    } finally {
      await cleanupTestOrg(idempotentOrg);
    }
  });
});
