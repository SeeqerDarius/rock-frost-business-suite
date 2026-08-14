import "server-only";

import { db } from "@/lib/db";
import { Prisma } from "@prisma/client";
import type { AccountingAccountType, AccountingInvoiceStatus, AccountingLiquidityType } from "@prisma/client";
import { createWithUniqueRetry } from "@/lib/unique-retry";
import {
  getOrganizationModuleConfiguration,
  updateOrganizationModuleConfigurationValues,
} from "@/platform/module-requests/configuration";

const DEFAULT_INVOICE_NUMBER_PREFIX = "INV";
const PREFIX_PATTERN = /^[A-Z0-9]{2,8}$/;

/** Accounting has no dedicated settings table; the invoice numbering prefix
 * lives in the generic `OrganizationModule.configuration` store. */
export async function getAccountingSettings(organizationId: string) {
  const configuration = await getOrganizationModuleConfiguration(organizationId, "accounting");
  const configured = configuration.workflow.invoiceNumberPrefix;
  return {
    invoiceNumberPrefix: configured && PREFIX_PATTERN.test(configured) ? configured : DEFAULT_INVOICE_NUMBER_PREFIX,
  };
}

export async function updateAccountingSettings(organizationId: string, data: { invoiceNumberPrefix: string }, actorId?: string | null) {
  await updateOrganizationModuleConfigurationValues(organizationId, "accounting", { workflow: { invoiceNumberPrefix: data.invoiceNumberPrefix } }, actorId);
}

/**
 * Fresh module (no reference implementation to migrate from). Every function
 * takes organizationId explicitly and filters on it, per docs/MODULE_BOUNDARIES.md.
 *
 * A minimal but real double-entry ledger: AccountingJournalEntry/Line is the
 * source of truth for account balances. Invoices and expenses are
 * higher-level records that post journal entries at the points a real
 * bookkeeper would (invoice sent -> AR/Revenue, invoice paid -> Cash/AR,
 * expense paid -> Expense/Cash) rather than at creation time.
 */

const DEFAULT_ACCOUNTS: { code: string; name: string; type: AccountingAccountType; liquidityType?: AccountingLiquidityType }[] = [
  { code: "1000", name: "Cash", type: "ASSET", liquidityType: "CASH" },
  { code: "1100", name: "Accounts Receivable", type: "ASSET" },
  { code: "2000", name: "Accounts Payable", type: "LIABILITY" },
  { code: "4000", name: "Revenue", type: "REVENUE" },
  { code: "5000", name: "General Expenses", type: "EXPENSE" },
];

export async function ensureDefaultAccounts(organizationId: string) {
  const existing = await db.accountingAccount.findMany({ where: { organizationId, isSystem: true } });
  const existingCodes = new Set(existing.map((a) => a.code));
  const missing = DEFAULT_ACCOUNTS.filter((a) => !existingCodes.has(a.code));
  if (missing.length > 0) {
    await db.accountingAccount.createMany({
      data: missing.map((a) => ({ organizationId, ...a, isSystem: true })),
    });
  }
  return db.accountingAccount.findMany({ where: { organizationId, isSystem: true } });
}

async function getDefaultAccount(organizationId: string, code: string) {
  const accounts = await ensureDefaultAccounts(organizationId);
  const account = accounts.find((a) => a.code === code);
  if (!account) throw new Error(`Default account ${code} missing.`);
  return account;
}

// --- Chart of accounts ---

export async function listAccounts(organizationId: string) {
  await ensureDefaultAccounts(organizationId);
  const accounts = await db.accountingAccount.findMany({
    where: { organizationId },
    include: { journalLines: true },
    orderBy: { code: "asc" },
  });
  return accounts.map((account) => ({
    ...account,
    balance: computeBalance(account.type, account.journalLines),
  }));
}

function computeBalance(type: AccountingAccountType, lines: { debit: Prisma.Decimal.Value; credit: Prisma.Decimal.Value }[]) {
  // Decimal summation, not JS Number — an account can accumulate thousands
  // of journal lines over its lifetime, and float rounding error compounds
  // across a sum in a way a single arithmetic op doesn't.
  const totalDebit = lines.reduce((sum, l) => sum.plus(l.debit), new Prisma.Decimal(0));
  const totalCredit = lines.reduce((sum, l) => sum.plus(l.credit), new Prisma.Decimal(0));
  const isDebitNormal = type === "ASSET" || type === "EXPENSE";
  return (isDebitNormal ? totalDebit.minus(totalCredit) : totalCredit.minus(totalDebit)).toNumber();
}

export class AccountCodeTakenError extends Error {}

interface AccountInput {
  code: string;
  name: string;
  type: AccountingAccountType;
  active?: boolean;
  liquidityType?: AccountingLiquidityType;
  bankName?: string | null;
  accountNumberLast4?: string | null;
}

export async function postOpeningBalance(organizationId: string, accountId: string, amountInput: string, asOfDate: Date, createdById?: string | null) {
  const amount = new Prisma.Decimal(amountInput);
  if (!amount.isFinite() || amount.isZero()) throw new InvalidPaymentError("Opening balance cannot be zero.");
  const [account, existingEquity] = await Promise.all([
    db.accountingAccount.findFirst({ where: { id: accountId, organizationId } }),
    db.accountingAccount.findFirst({ where: { organizationId, code: "3000" } }),
  ]);
  if (!account) throw new NotFoundError("Account not found.");
  const equity = existingEquity ?? await db.accountingAccount.create({ data: { organizationId, code: "3000", name: "Opening Balance Equity", type: "EQUITY", isSystem: true } });
  if (account.openingBalancePostedAt) throw new InvoiceStateError("An opening balance was already posted for this account.");
  const absolute = amount.abs().toFixed(2);
  const positiveDebitNormal = account.type === "ASSET" || account.type === "EXPENSE";
  const debitAccount = amount.isPositive() === positiveDebitNormal ? account.id : equity.id;
  const creditAccount = debitAccount === account.id ? equity.id : account.id;
  return db.$transaction(async (tx) => {
    const claimed = await tx.accountingAccount.updateMany({ where: { id: account.id, organizationId, openingBalancePostedAt: null }, data: { openingBalancePostedAt: new Date() } });
    if (claimed.count === 0) throw new InvoiceStateError("An opening balance was already posted for this account.");
    return postJournalEntry(tx, organizationId, { entryDate: asOfDate, description: `Opening balance for ${account.name}`, sourceType: "OPENING_BALANCE", sourceId: account.id, createdById, lines: [{ accountId: debitAccount, debit: absolute }, { accountId: creditAccount, credit: absolute }] });
  });
}

export async function getCashbook(organizationId: string, accountId?: string | null) {
  const accounts = await db.accountingAccount.findMany({ where: { organizationId, liquidityType: { not: "NONE" }, ...(accountId ? { id: accountId } : {}) }, select: { id: true } });
  const ids = accounts.map((account) => account.id);
  return db.accountingJournalLine.findMany({ where: { accountId: { in: ids }, account: { organizationId } }, include: { account: true, journalEntry: true }, orderBy: { journalEntry: { entryDate: "desc" } }, take: 500 });
}

export function listReconciliations(organizationId: string) {
  return db.accountingReconciliation.findMany({ where: { organizationId }, include: { account: true }, orderBy: { periodEnd: "desc" } });
}

export async function completeReconciliation(organizationId: string, data: { accountId: string; periodStart: Date; periodEnd: Date; statementBalance: string; notes?: string | null; completedById?: string | null }) {
  const account = (await listAccounts(organizationId)).find((item) => item.id === data.accountId && item.liquidityType !== "NONE");
  if (!account) throw new NotFoundError("Cash or bank account not found.");
  const statementBalance = new Prisma.Decimal(data.statementBalance);
  const ledgerBalance = new Prisma.Decimal(account.balance);
  return db.accountingReconciliation.create({ data: { organizationId, accountId: account.id, periodStart: data.periodStart, periodEnd: data.periodEnd, statementBalance, ledgerBalance, difference: statementBalance.minus(ledgerBalance), status: "COMPLETED", notes: data.notes, completedById: data.completedById, completedAt: new Date() } });
}

export async function createAccount(organizationId: string, data: AccountInput) {
  try {
    return await db.accountingAccount.create({ data: { organizationId, ...data } });
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "P2002") {
      throw new AccountCodeTakenError(`Account code "${data.code}" is already in use.`);
    }
    throw error;
  }
}

export async function updateAccount(organizationId: string, id: string, data: AccountInput) {
  try {
    return await db.accountingAccount.update({ where: { id, organizationId }, data });
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "P2002") {
      throw new AccountCodeTakenError(`Account code "${data.code}" is already in use.`);
    }
    throw error;
  }
}

// --- Expense categories ---

export function listExpenseCategories(organizationId: string) {
  return db.accountingExpenseCategory.findMany({ where: { organizationId }, include: { expenseAccount: true }, orderBy: { name: "asc" } });
}

export function createExpenseCategory(organizationId: string, data: { name: string; expenseAccountId?: string | null }) {
  return db.accountingExpenseCategory.create({ data: { organizationId, ...data } });
}

// --- Journal ---

type TxClient = Parameters<Parameters<typeof db.$transaction>[0]>[0];

export class JournalNotBalancedError extends Error {}
export class NotFoundError extends Error {}

/**
 * The single choke point every journal-posting call site (invoice send,
 * invoice payment, expense payment, manual entries) goes through — so the
 * account-ownership check here closes the "manual journal lines accept
 * arbitrary account ids" gap for every caller at once, not just
 * createManualJournalEntry(). Callers that fetch their accounts via
 * getDefaultAccount() are already guaranteed org-scoped; this re-checks
 * them too, which is redundant but harmless defense-in-depth for a function
 * this central.
 */
async function postJournalEntry(
  tx: TxClient,
  organizationId: string,
  input: {
    entryDate: Date;
    description: string;
    reference?: string | null;
    sourceType?: string | null;
    sourceId?: string | null;
    createdById?: string | null;
    lines: { accountId: string; debit?: string | number; credit?: string | number }[];
  },
) {
  // Decimal equality, not a JS Number epsilon fudge-factor — this is the
  // core double-entry invariant for the whole ledger, so exact arithmetic
  // matters more here than almost anywhere else in the codebase.
  const totalDebit = input.lines.reduce((sum, l) => sum.plus(l.debit ?? 0), new Prisma.Decimal(0));
  const totalCredit = input.lines.reduce((sum, l) => sum.plus(l.credit ?? 0), new Prisma.Decimal(0));
  if (!totalDebit.equals(totalCredit)) {
    throw new JournalNotBalancedError("Journal entry debits and credits must be equal.");
  }

  const accountIds = [...new Set(input.lines.map((l) => l.accountId))];
  const ownedCount = await tx.accountingAccount.count({ where: { id: { in: accountIds }, organizationId } });
  if (ownedCount !== accountIds.length) {
    throw new NotFoundError("One or more accounts could not be found.");
  }

  return tx.accountingJournalEntry.create({
    data: {
      organizationId,
      entryDate: input.entryDate,
      description: input.description,
      reference: input.reference,
      sourceType: input.sourceType,
      sourceId: input.sourceId,
      createdById: input.createdById,
      lines: {
        create: input.lines.map((l) => ({ accountId: l.accountId, debit: l.debit ?? 0, credit: l.credit ?? 0 })),
      },
    },
  });
}

export function listJournalEntries(organizationId: string) {
  return db.accountingJournalEntry.findMany({
    where: { organizationId },
    include: { lines: { include: { account: true } }, createdBy: true },
    orderBy: { entryDate: "desc" },
    take: 200,
  });
}

export async function createManualJournalEntry(
  organizationId: string,
  data: {
    entryDate: Date;
    description: string;
    reference?: string | null;
    createdById?: string | null;
    lines: { accountId: string; debit?: string; credit?: string }[];
  },
) {
  return db.$transaction((tx) =>
    postJournalEntry(tx, organizationId, { ...data, sourceType: "MANUAL", sourceId: null }),
  );
}

// --- Invoices ---

async function sweepOverdueInvoices(organizationId: string) {
  await db.accountingInvoice.updateMany({
    where: { organizationId, status: "SENT", dueDate: { lt: new Date() } },
    data: { status: "OVERDUE" },
  });
}

async function generateInvoiceNumber(organizationId: string) {
  const [{ invoiceNumberPrefix }, count] = await Promise.all([
    getAccountingSettings(organizationId),
    db.accountingInvoice.count({ where: { organizationId } }),
  ]);
  return `${invoiceNumberPrefix}-${String(count + 1).padStart(4, "0")}`;
}

export async function listInvoices(organizationId: string) {
  await sweepOverdueInvoices(organizationId);
  return db.accountingInvoice.findMany({ where: { organizationId }, orderBy: { createdAt: "desc" } });
}

interface InvoiceInput {
  customerName: string;
  customerEmail?: string | null;
  description?: string | null;
  amount: string;
  issueDate: Date;
  dueDate: Date;
}

export async function createInvoice(organizationId: string, data: InvoiceInput, createdById?: string | null) {
  return createWithUniqueRetry(async () => {
    const invoiceNumber = await generateInvoiceNumber(organizationId);
    return db.accountingInvoice.create({ data: { organizationId, invoiceNumber, createdById, ...data } });
  });
}

export class InvoiceStateError extends Error {}
export class InvalidPaymentError extends Error {}

/**
 * Claims the invoice (DRAFT -> SENT) with a guarded updateMany before
 * posting anything, inside the same transaction — two concurrent "send"
 * requests can no longer both pass a stale status check and both post an
 * AR/Revenue entry, since the second's updateMany matches zero rows once
 * the first commits.
 */
export async function markInvoiceSent(organizationId: string, id: string) {
  const invoice = await db.accountingInvoice.findFirst({ where: { id, organizationId } });
  if (!invoice) throw new NotFoundError("Invoice not found.");

  const [ar, revenue] = await Promise.all([
    getDefaultAccount(organizationId, "1100"),
    getDefaultAccount(organizationId, "4000"),
  ]);

  return db.$transaction(async (tx) => {
    const claimed = await tx.accountingInvoice.updateMany({
      where: { id, status: "DRAFT" },
      data: { status: "SENT" },
    });
    if (claimed.count === 0) throw new InvoiceStateError("Only draft invoices can be sent.");

    await postJournalEntry(tx, organizationId, {
      entryDate: invoice.issueDate,
      description: `Invoice ${invoice.invoiceNumber} sent to ${invoice.customerName}`,
      sourceType: "INVOICE",
      sourceId: invoice.id,
      lines: [
        { accountId: ar.id, debit: invoice.amount.toString() },
        { accountId: revenue.id, credit: invoice.amount.toString() },
      ],
    });
    return tx.accountingInvoice.findUniqueOrThrow({ where: { id } });
  });
}

type LockedInvoiceRow = { id: string; amount: Prisma.Decimal | string; amountPaid: Prisma.Decimal | string; status: string };

/**
 * amountPaid is updated with an atomic increment, not a JS-computed
 * absolute value — two concurrent payments can never lose one's
 * contribution to the running total.
 *
 * The remaining-balance guard now runs inside the transaction against a
 * row locked with `SELECT ... FOR UPDATE`, not a pre-transaction snapshot
 * — this closes the previously-documented residual race where two
 * simultaneous payments could each individually pass a stale
 * remaining-balance check and together overpay. A second concurrent call
 * on the same invoice now blocks on the row lock until the first
 * transaction commits (or rolls back), then re-reads the true committed
 * amountPaid before deciding whether it still fits — see
 * docs/HARDENING_PLAN.md's Pass 4 section.
 */
export async function recordInvoicePayment(organizationId: string, id: string, amount: string, paymentDate: Date) {
  // Prisma.Decimal throughout — this is a comparison against a database
  // Decimal column and a value that gets atomically incremented into it, so
  // exact arithmetic matters; JS Number comparison previously needed a 0.005
  // epsilon fudge-factor to work around float rounding, which Decimal makes
  // unnecessary.
  const paymentAmount = new Prisma.Decimal(amount);
  if (!paymentAmount.isFinite() || paymentAmount.lessThanOrEqualTo(0)) {
    throw new InvalidPaymentError("Payment amount must be a positive number.");
  }

  const invoice = await db.accountingInvoice.findFirst({ where: { id, organizationId } });
  if (!invoice) throw new NotFoundError("Invoice not found.");

  return db.$transaction(async (tx) => {
    const [locked] = await tx.$queryRaw<LockedInvoiceRow[]>`
      SELECT id, amount, "amountPaid", status
      FROM "AccountingInvoice"
      WHERE id = ${id} AND "organizationId" = ${organizationId}
      FOR UPDATE
    `;
    if (!locked) throw new NotFoundError("Invoice not found.");
    if (locked.status !== "SENT" && locked.status !== "OVERDUE") {
      throw new InvoiceStateError("Only sent or overdue invoices can receive a payment.");
    }

    const remaining = new Prisma.Decimal(locked.amount).minus(locked.amountPaid);
    if (paymentAmount.greaterThan(remaining)) {
      throw new InvalidPaymentError(`Payment of ${paymentAmount.toFixed(2)} exceeds the remaining balance of ${remaining.toFixed(2)}.`);
    }

    // Only fetched once the payment is actually valid — no point creating
    // the default chart-of-accounts rows for a payment that's about to be
    // rejected.
    const [cash, ar] = await Promise.all([
      getDefaultAccount(organizationId, "1000"),
      getDefaultAccount(organizationId, "1100"),
    ]);

    await postJournalEntry(tx, organizationId, {
      entryDate: paymentDate,
      description: `Payment received for invoice ${invoice.invoiceNumber}`,
      sourceType: "INVOICE",
      sourceId: invoice.id,
      lines: [
        { accountId: cash.id, debit: amount },
        { accountId: ar.id, credit: amount },
      ],
    });

    const updated = await tx.accountingInvoice.update({
      where: { id },
      data: { amountPaid: { increment: paymentAmount } },
    });

    const isFullyPaid = new Prisma.Decimal(updated.amountPaid).greaterThanOrEqualTo(updated.amount);
    if (!isFullyPaid) return updated;

    return tx.accountingInvoice.update({
      where: { id },
      data: { status: "PAID", paidAt: paymentDate },
    });
  });
}

/**
 * Voiding a SENT/OVERDUE invoice now posts a reversing journal entry
 * (Debit Revenue / Credit AR — the exact opposite of the entry
 * markInvoiceSent() posted) instead of only flipping the status, so the
 * ledger no longer permanently overstates revenue/AR for an invoice that
 * was voided before any payment came in. A DRAFT invoice never had
 * anything posted, so voiding it needs no reversal.
 */
export async function voidInvoice(organizationId: string, id: string) {
  const invoice = await db.accountingInvoice.findFirst({ where: { id, organizationId } });
  if (!invoice) throw new NotFoundError("Invoice not found.");
  if (Number(invoice.amountPaid) > 0) throw new InvoiceStateError("Cannot void an invoice that has received payment.");

  const needsReversal = invoice.status === "SENT" || invoice.status === "OVERDUE";
  const accounts = needsReversal
    ? await Promise.all([getDefaultAccount(organizationId, "1100"), getDefaultAccount(organizationId, "4000")])
    : null;

  return db.$transaction(async (tx) => {
    const claimed = await tx.accountingInvoice.updateMany({
      where: { id, status: { in: ["DRAFT", "SENT", "OVERDUE"] } },
      data: { status: "VOID" },
    });
    if (claimed.count === 0) throw new InvoiceStateError("This invoice can no longer be voided.");

    if (accounts) {
      const [ar, revenue] = accounts;
      await postJournalEntry(tx, organizationId, {
        entryDate: new Date(),
        description: `Void of invoice ${invoice.invoiceNumber} (reversal)`,
        sourceType: "INVOICE_VOID",
        sourceId: invoice.id,
        lines: [
          { accountId: revenue.id, debit: invoice.amount.toString() },
          { accountId: ar.id, credit: invoice.amount.toString() },
        ],
      });
    }

    return tx.accountingInvoice.findUniqueOrThrow({ where: { id } });
  });
}

// --- Expenses ---

async function generateExpenseNumber(organizationId: string) {
  const count = await db.accountingExpense.count({ where: { organizationId } });
  return `EXP-${String(count + 1).padStart(4, "0")}`;
}

export function listExpenses(organizationId: string) {
  return db.accountingExpense.findMany({
    where: { organizationId },
    include: { category: true },
    orderBy: { createdAt: "desc" },
  });
}

interface ExpenseInput {
  vendorName: string;
  categoryId?: string | null;
  amount: string;
  expenseDate: Date;
  notes?: string | null;
}

export async function createExpense(organizationId: string, data: ExpenseInput, createdById?: string | null) {
  return createWithUniqueRetry(async () => {
    const expenseNumber = await generateExpenseNumber(organizationId);
    return db.accountingExpense.create({ data: { organizationId, expenseNumber, createdById, ...data } });
  });
}

export class ExpenseStateError extends Error {}

export async function approveExpense(organizationId: string, id: string) {
  const expense = await db.accountingExpense.findFirst({ where: { id, organizationId } });
  if (!expense) throw new NotFoundError("Expense not found.");
  const claimed = await db.accountingExpense.updateMany({ where: { id, status: "PENDING" }, data: { status: "APPROVED" } });
  if (claimed.count === 0) throw new ExpenseStateError("Only pending expenses can be approved.");
  return db.accountingExpense.findUniqueOrThrow({ where: { id } });
}

export async function rejectExpense(organizationId: string, id: string) {
  const expense = await db.accountingExpense.findFirst({ where: { id, organizationId } });
  if (!expense) throw new NotFoundError("Expense not found.");
  const claimed = await db.accountingExpense.updateMany({ where: { id, status: "PENDING" }, data: { status: "REJECTED" } });
  if (claimed.count === 0) throw new ExpenseStateError("Only pending expenses can be rejected.");
  return db.accountingExpense.findUniqueOrThrow({ where: { id } });
}

/** Claims the expense (APPROVED -> PAID) atomically before posting, same reasoning as markInvoiceSent(). */
export async function payExpense(organizationId: string, id: string, paymentDate: Date) {
  const expense = await db.accountingExpense.findFirst({ where: { id, organizationId }, include: { category: true } });
  if (!expense) throw new NotFoundError("Expense not found.");

  const [cash, defaultExpense] = await Promise.all([
    getDefaultAccount(organizationId, "1000"),
    getDefaultAccount(organizationId, "5000"),
  ]);
  const expenseAccountId = expense.category?.expenseAccountId ?? defaultExpense.id;

  return db.$transaction(async (tx) => {
    const claimed = await tx.accountingExpense.updateMany({
      where: { id, status: "APPROVED" },
      data: { status: "PAID", paidAt: paymentDate },
    });
    if (claimed.count === 0) throw new ExpenseStateError("Only approved expenses can be paid.");

    await postJournalEntry(tx, organizationId, {
      entryDate: paymentDate,
      description: `Expense ${expense.expenseNumber} paid to ${expense.vendorName}`,
      sourceType: "EXPENSE",
      sourceId: expense.id,
      lines: [
        { accountId: expenseAccountId, debit: expense.amount.toString() },
        { accountId: cash.id, credit: expense.amount.toString() },
      ],
    });
    return tx.accountingExpense.findUniqueOrThrow({ where: { id } });
  });
}

// --- Reports ---

export async function getAccountingSummary(organizationId: string) {
  await sweepOverdueInvoices(organizationId);
  const accounts = await listAccounts(organizationId);

  const cash = accounts.find((a) => a.code === "1000");
  const ar = accounts.find((a) => a.code === "1100");
  const revenueAccounts = accounts.filter((a) => a.type === "REVENUE");
  const expenseAccounts = accounts.filter((a) => a.type === "EXPENSE");

  const totalRevenue = revenueAccounts.reduce((sum, a) => sum + a.balance, 0);
  const totalExpenses = expenseAccounts.reduce((sum, a) => sum + a.balance, 0);

  const [invoices, expenses] = await Promise.all([
    db.accountingInvoice.findMany({ where: { organizationId } }),
    db.accountingExpense.findMany({ where: { organizationId } }),
  ]);

  const outstandingInvoices = invoices.filter((i) => i.status === "SENT" || i.status === "OVERDUE");
  const overdueInvoices = invoices.filter((i) => i.status === "OVERDUE");
  const pendingExpenses = expenses.filter((e) => e.status === "PENDING" || e.status === "APPROVED");

  return {
    cashBalance: cash?.balance ?? 0,
    accountsReceivableBalance: ar?.balance ?? 0,
    totalRevenue,
    totalExpenses,
    netIncome: totalRevenue - totalExpenses,
    outstandingInvoiceCount: outstandingInvoices.length,
    outstandingInvoiceTotal: outstandingInvoices.reduce((sum, i) => sum + (Number(i.amount) - Number(i.amountPaid)), 0),
    overdueInvoiceCount: overdueInvoices.length,
    pendingExpenseCount: pendingExpenses.length,
    pendingExpenseTotal: pendingExpenses.reduce((sum, e) => sum + Number(e.amount), 0),
    invoiceCount: invoices.length,
    expenseCount: expenses.length,
  };
}

export type { AccountingInvoiceStatus };
