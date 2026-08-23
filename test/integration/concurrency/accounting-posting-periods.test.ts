import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as accounting from "@/modules/accounting/service";
import { testDb } from "../setup/db";
import { cleanupTestOrg, createTestOrg, type TestOrg } from "../setup/fixtures";

let idempotencyOrg: TestOrg;
let periodRaceOrg: TestOrg;

beforeAll(async () => {
  idempotencyOrg = await createTestOrg("accounting-source-idempotency");
  periodRaceOrg = await createTestOrg("accounting-period-close-race");
  await accounting.ensureDefaultAccounts(idempotencyOrg.organizationId);
  await accounting.ensureDefaultAccounts(periodRaceOrg.organizationId);
});

afterAll(async () => {
  await cleanupTestOrg(idempotencyOrg);
  await cleanupTestOrg(periodRaceOrg);
});

async function journalLines(organizationId: string) {
  const accounts = await testDb.accountingAccount.findMany({
    where: { organizationId, code: { in: ["1000", "4000"] } },
    select: { id: true, code: true },
  });
  const cash = accounts.find((account) => account.code === "1000");
  const revenue = accounts.find((account) => account.code === "4000");
  if (!cash || !revenue) throw new Error("Default test accounts were not created.");
  return [
    { accountId: cash.id, debit: "25.00", credit: "0.00" },
    { accountId: revenue.id, debit: "0.00", credit: "25.00" },
  ];
}

describe("Accounting source posting and period serialization (real Postgres)", () => {
  it("makes concurrent source postings idempotent and stores one journal entry", async () => {
    const input = {
      sourceType: "INTEGRATION_TEST",
      sourceId: "same-business-event",
      postingPurpose: "REVENUE",
      entryDate: new Date("2026-03-10T12:00:00.000Z"),
      description: "Concurrent idempotency test",
      lines: await journalLines(idempotencyOrg.organizationId),
    };

    const [first, second] = await Promise.all([
      accounting.postSourceJournalEntry(idempotencyOrg.organizationId, input),
      accounting.postSourceJournalEntry(idempotencyOrg.organizationId, input),
    ]);

    expect(first.id).toBe(second.id);
    const entries = await testDb.accountingJournalEntry.findMany({
      where: {
        organizationId: idempotencyOrg.organizationId,
        sourceType: input.sourceType,
        sourceId: input.sourceId,
        postingPurpose: input.postingPurpose,
      },
      include: { lines: true },
    });
    expect(entries).toHaveLength(1);
    expect(entries[0].lines).toHaveLength(2);
  });

  it("blocks journal-screen reversal of a source posting but allows its identity-matched source workflow", async () => {
    const input = {
      sourceType: "FLEET_PAYMENT",
      sourceId: "fleet-payment-reversal-boundary",
      postingPurpose: "COLLECTED",
      entryDate: new Date("2026-04-10T12:00:00.000Z"),
      description: "Fleet payment reversal boundary",
      lines: await journalLines(idempotencyOrg.organizationId),
    };
    const entry = await accounting.postSourceJournalEntry(idempotencyOrg.organizationId, input);

    await expect(accounting.reverseJournalEntry(idempotencyOrg.organizationId, entry.id, {
      entryDate: new Date("2026-04-11T12:00:00.000Z"),
      reason: "Attempted manual correction",
    })).rejects.toBeInstanceOf(accounting.JournalReversalError);

    const reversal = await accounting.reverseSourceJournalEntry(idempotencyOrg.organizationId, entry.id, {
      entryDate: new Date("2026-04-11T12:00:00.000Z"),
      reason: "Source payment was rejected",
      sourceType: input.sourceType,
      sourceId: input.sourceId,
      postingPurpose: input.postingPurpose,
    });
    const original = await testDb.accountingJournalEntry.findUniqueOrThrow({ where: { id: entry.id } });
    expect(original.status).toBe("REVERSED");
    expect(reversal.reversalOfId).toBe(entry.id);
  });

  it("serializes a source posting against closing its accounting period", async () => {
    const period = await accounting.createAccountingPeriod(periodRaceOrg.organizationId, {
      name: "March 2026",
      startDate: new Date("2026-03-01T00:00:00.000Z"),
      endDate: new Date("2026-03-31T23:59:59.999Z"),
    });
    const input = {
      sourceType: "INTEGRATION_TEST",
      sourceId: "period-close-race",
      postingPurpose: "REVENUE",
      entryDate: new Date("2026-03-15T12:00:00.000Z"),
      description: "Period close serialization test",
      lines: await journalLines(periodRaceOrg.organizationId),
    };

    const [posting, closing] = await Promise.allSettled([
      accounting.postSourceJournalEntry(periodRaceOrg.organizationId, input),
      accounting.closeAccountingPeriod(periodRaceOrg.organizationId, period.id, periodRaceOrg.userId),
    ]);

    expect(closing.status).toBe("fulfilled");
    const finalPeriod = await testDb.accountingPeriod.findUniqueOrThrow({ where: { id: period.id } });
    expect(finalPeriod.status).toBe("CLOSED");

    const entryCount = await testDb.accountingJournalEntry.count({
      where: {
        organizationId: periodRaceOrg.organizationId,
        sourceType: input.sourceType,
        sourceId: input.sourceId,
        postingPurpose: input.postingPurpose,
      },
    });
    if (posting.status === "fulfilled") {
      expect(entryCount).toBe(1);
    } else {
      expect(posting.reason).toBeInstanceOf(accounting.AccountingPeriodLockedError);
      expect(entryCount).toBe(0);
    }

    await expect(accounting.postSourceJournalEntry(periodRaceOrg.organizationId, {
      ...input,
      sourceId: "after-period-close",
    })).rejects.toBeInstanceOf(accounting.AccountingPeriodLockedError);
  });
});
