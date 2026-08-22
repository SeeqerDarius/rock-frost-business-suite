import { describe, it, expect, beforeAll, afterAll } from "vitest";
import * as installment from "@/modules/installment/service";
import { testDb } from "../setup/db";
import { createTestOrg, cleanupTestOrg, type TestOrg } from "../setup/fixtures";

const ORGANIZATION_SCOPE = { kind: "organization" } as const;

/**
 * Real-Postgres concurrency coverage for src/modules/installment/service.ts
 * (Hardening Pass 4, Milestone B — this service was JUST hardened in this
 * exact milestone). These tests fire truly concurrent requests via
 * Promise.allSettled/Promise.all into the same account/credit and verify
 * the final committed state in Postgres:
 *  - recordPayment() updates totalPaid/balance with one atomic multi-field
 *    increment/decrement UPDATE, so two concurrent payments never lose
 *    one's contribution, and overpayment is computed from the true,
 *    atomically-decremented balance.
 *  - applyCreditToAccount() locks both the credit row and the target
 *    account row with SELECT ... FOR UPDATE before reading/computing
 *    anything, so a second concurrent call on the same credit finds it no
 *    longer OPEN (or fully consumed) and throws.
 */

let org: TestOrg;
let product: Awaited<ReturnType<typeof installment.createProduct>>;
let staff: Awaited<ReturnType<typeof installment.createStaff>>;
let customer: Awaited<ReturnType<typeof installment.createCustomer>>;

// dailyAmount (5.00) * duration (20) = price 100.00, and with the default
// 0% administrationFeePercent, targetAmount/balance at account opening is
// also exactly 100.00 — the balance figure this whole suite is built on.
const PRODUCT_INPUT = {
  category: "General",
  costPrice: "50.00",
  transportCost: "5.00",
  dailyAmount: "5.00",
  duration: 20,
};

async function openAccount() {
  const { account } = await installment.createAccount(org.organizationId, ORGANIZATION_SCOPE, {
    customerId: customer.id,
    productId: product.id,
    inventoryStaffId: staff.id,
    startDate: new Date("2026-01-01"),
  });
  return account;
}

beforeAll(async () => {
  org = await createTestOrg("concurrency-installment");
  product = await installment.createProduct(org.organizationId, { name: "Concurrency Product", ...PRODUCT_INPUT });
  staff = await installment.createStaff(org.organizationId, { fullName: "Concurrency Staff", monthlySalary: "500.00", userId: null });
  customer = await installment.createCustomer(org.organizationId, ORGANIZATION_SCOPE, { fullName: "Concurrency Customer", staffId: staff.id });
});

afterAll(async () => {
  await cleanupTestOrg(org);
});

describe("Installment service — concurrency against real Postgres", () => {
  it("two simultaneous overpaying recordPayment() calls clamp balance to zero and create exactly one correctly-sized credit", async () => {
    const account = await openAccount();
    expect(account.balance.toFixed(2)).toBe("100.00");

    const results = await Promise.allSettled([
      installment.recordPayment(org.organizationId, ORGANIZATION_SCOPE, {
        accountId: account.id,
        amount: "70.00",
        paymentDate: new Date("2026-01-05"),
        method: "Cash",
      }),
      installment.recordPayment(org.organizationId, ORGANIZATION_SCOPE, {
        accountId: account.id,
        amount: "70.00",
        paymentDate: new Date("2026-01-05"),
        method: "Cash",
      }),
    ]);

    // Neither of these is rejected — recordPayment doesn't reject
    // overpayment, it clamps and creates a credit for the excess.
    expect(results.every((r) => r.status === "fulfilled")).toBe(true);

    const finalAccount = await testDb.hirePurchaseAccount.findUniqueOrThrow({ where: { id: account.id } });
    expect(finalAccount.balance.toFixed(2)).toBe("0.00");
    expect(finalAccount.totalPaid.toFixed(2)).toBe("140.00");
    expect(finalAccount.status).toBe("COMPLETED");

    const credits = await testDb.hirePurchaseCredit.findMany({
      where: { organizationId: org.organizationId, accountId: account.id, source: "PAYMENT_OVERPAYMENT" },
    });
    // Exactly one credit row for the combined overpayment (140 - 100 = 40),
    // not two separate half-computed 40/2-ish credits from each
    // transaction computing its own partial view of the balance.
    expect(credits).toHaveLength(1);
    expect(credits[0].amount.toFixed(2)).toBe("40.00");
    expect(credits[0].remainingAmount.toFixed(2)).toBe("40.00");
    expect(credits[0].status).toBe("OPEN");

    const payments = await testDb.hirePurchasePayment.findMany({
      where: { organizationId: org.organizationId, accountId: account.id },
    });
    expect(payments).toHaveLength(2);
    expect(new Set(payments.map((p) => p.receiptNo)).size).toBe(2);
  });

  it("two simultaneous exactly-fitting recordPayment() calls both succeed with no lost update and distinct receipt numbers", async () => {
    const account = await openAccount();
    expect(account.balance.toFixed(2)).toBe("100.00");

    const results = await Promise.allSettled([
      installment.recordPayment(org.organizationId, ORGANIZATION_SCOPE, {
        accountId: account.id,
        amount: "50.00",
        paymentDate: new Date("2026-01-05"),
        method: "Cash",
      }),
      installment.recordPayment(org.organizationId, ORGANIZATION_SCOPE, {
        accountId: account.id,
        amount: "50.00",
        paymentDate: new Date("2026-01-05"),
        method: "Cash",
      }),
    ]);

    expect(results.every((r) => r.status === "fulfilled")).toBe(true);

    const finalAccount = await testDb.hirePurchaseAccount.findUniqueOrThrow({ where: { id: account.id } });
    expect(finalAccount.totalPaid.toFixed(2)).toBe("100.00");
    expect(finalAccount.balance.toFixed(2)).toBe("0.00");
    expect(finalAccount.status).toBe("COMPLETED");

    const overpaymentCredits = await testDb.hirePurchaseCredit.findMany({
      where: { organizationId: org.organizationId, accountId: account.id, source: "PAYMENT_OVERPAYMENT" },
    });
    expect(overpaymentCredits).toHaveLength(0);

    const payments = await testDb.hirePurchasePayment.findMany({
      where: { organizationId: org.organizationId, accountId: account.id },
    });
    expect(payments).toHaveLength(2);
    expect(new Set(payments.map((p) => p.receiptNo)).size).toBe(2);
  });

  it("two concurrent applyCreditToAccount() calls on the same credit: exactly one succeeds, the credit is not double-applied", async () => {
    // Create an overpaid account purely to generate a real OPEN credit to
    // apply elsewhere.
    const sourceAccount = await openAccount();
    await installment.recordPayment(org.organizationId, ORGANIZATION_SCOPE, {
      accountId: sourceAccount.id,
      amount: "150.00", // overpays a 100.00 balance by 50.00
      paymentDate: new Date("2026-01-05"),
      method: "Cash",
    });

    const credit = await testDb.hirePurchaseCredit.findFirstOrThrow({
      where: { organizationId: org.organizationId, accountId: sourceAccount.id, source: "PAYMENT_OVERPAYMENT" },
    });
    expect(credit.remainingAmount.toFixed(2)).toBe("50.00");
    expect(credit.status).toBe("OPEN");

    const targetAccount1 = await openAccount();
    const targetAccount2 = await openAccount();

    const results = await Promise.allSettled([
      installment.applyCreditToAccount(org.organizationId, ORGANIZATION_SCOPE, credit.id, targetAccount1.id),
      installment.applyCreditToAccount(org.organizationId, ORGANIZATION_SCOPE, credit.id, targetAccount2.id),
    ]);

    const fulfilled = results.filter((r) => r.status === "fulfilled");
    const rejected = results.filter((r): r is PromiseRejectedResult => r.status === "rejected");
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect(rejected[0].reason).toBeInstanceOf(installment.CreditNotApplicableError);

    const finalCredit = await testDb.hirePurchaseCredit.findUniqueOrThrow({ where: { id: credit.id } });
    // The 50.00 credit against a 100.00-balance target account is fully
    // consumed by whichever call won — never left with remainingAmount
    // split/decremented twice.
    expect(finalCredit.remainingAmount.toFixed(2)).toBe("0.00");
    expect(finalCredit.status).toBe("APPLIED");

    const [payments1, payments2] = await Promise.all([
      testDb.hirePurchasePayment.findMany({
        where: { organizationId: org.organizationId, accountId: targetAccount1.id, method: "Credit applied" },
      }),
      testDb.hirePurchasePayment.findMany({
        where: { organizationId: org.organizationId, accountId: targetAccount2.id, method: "Credit applied" },
      }),
    ]);
    // Exactly one of the two target accounts actually received the
    // credit-applied payment — not both, not neither.
    const appliedCounts = [payments1.length, payments2.length];
    expect(appliedCounts.filter((c) => c === 1)).toHaveLength(1);
    expect(appliedCounts.filter((c) => c === 0)).toHaveLength(1);
  });
});
