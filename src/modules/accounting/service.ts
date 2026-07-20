import "server-only";

import { db } from "@/lib/db";
import type { AccountingAccountType, AccountingInvoiceStatus } from "@prisma/client";

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

const DEFAULT_ACCOUNTS: { code: string; name: string; type: AccountingAccountType }[] = [
  { code: "1000", name: "Cash", type: "ASSET" },
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

function computeBalance(type: AccountingAccountType, lines: { debit: unknown; credit: unknown }[]) {
  const totalDebit = lines.reduce((sum, l) => sum + Number(l.debit), 0);
  const totalCredit = lines.reduce((sum, l) => sum + Number(l.credit), 0);
  const isDebitNormal = type === "ASSET" || type === "EXPENSE";
  return isDebitNormal ? totalDebit - totalCredit : totalCredit - totalDebit;
}

export class AccountCodeTakenError extends Error {}

interface AccountInput {
  code: string;
  name: string;
  type: AccountingAccountType;
  active?: boolean;
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
  const totalDebit = input.lines.reduce((sum, l) => sum + Number(l.debit ?? 0), 0);
  const totalCredit = input.lines.reduce((sum, l) => sum + Number(l.credit ?? 0), 0);
  if (Math.abs(totalDebit - totalCredit) > 0.005) {
    throw new JournalNotBalancedError("Journal entry debits and credits must be equal.");
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
  const count = await db.accountingInvoice.count({ where: { organizationId } });
  return `INV-${String(count + 1).padStart(4, "0")}`;
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
  const invoiceNumber = await generateInvoiceNumber(organizationId);
  return db.accountingInvoice.create({ data: { organizationId, invoiceNumber, createdById, ...data } });
}

export class InvoiceStateError extends Error {}

export async function markInvoiceSent(organizationId: string, id: string) {
  const invoice = await db.accountingInvoice.findFirst({ where: { id, organizationId } });
  if (!invoice) throw new Error("Invoice not found.");
  if (invoice.status !== "DRAFT") throw new InvoiceStateError("Only draft invoices can be sent.");

  const [ar, revenue] = await Promise.all([
    getDefaultAccount(organizationId, "1100"),
    getDefaultAccount(organizationId, "4000"),
  ]);

  return db.$transaction(async (tx) => {
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
    return tx.accountingInvoice.update({ where: { id }, data: { status: "SENT" } });
  });
}

export async function recordInvoicePayment(organizationId: string, id: string, amount: string, paymentDate: Date) {
  const invoice = await db.accountingInvoice.findFirst({ where: { id, organizationId } });
  if (!invoice) throw new Error("Invoice not found.");
  if (invoice.status !== "SENT" && invoice.status !== "OVERDUE") {
    throw new InvoiceStateError("Only sent or overdue invoices can receive a payment.");
  }

  const [cash, ar] = await Promise.all([
    getDefaultAccount(organizationId, "1000"),
    getDefaultAccount(organizationId, "1100"),
  ]);

  const newAmountPaid = Number(invoice.amountPaid) + Number(amount);
  const isFullyPaid = newAmountPaid >= Number(invoice.amount) - 0.005;

  return db.$transaction(async (tx) => {
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
    return tx.accountingInvoice.update({
      where: { id },
      data: {
        amountPaid: newAmountPaid,
        status: isFullyPaid ? "PAID" : "SENT",
        paidAt: isFullyPaid ? paymentDate : null,
      },
    });
  });
}

export async function voidInvoice(organizationId: string, id: string) {
  const invoice = await db.accountingInvoice.findFirst({ where: { id, organizationId } });
  if (!invoice) throw new Error("Invoice not found.");
  if (Number(invoice.amountPaid) > 0) throw new InvoiceStateError("Cannot void an invoice that has received payment.");
  return db.accountingInvoice.update({ where: { id }, data: { status: "VOID" } });
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
  const expenseNumber = await generateExpenseNumber(organizationId);
  return db.accountingExpense.create({ data: { organizationId, expenseNumber, createdById, ...data } });
}

export class ExpenseStateError extends Error {}

export async function approveExpense(organizationId: string, id: string) {
  const expense = await db.accountingExpense.findFirst({ where: { id, organizationId } });
  if (!expense) throw new Error("Expense not found.");
  if (expense.status !== "PENDING") throw new ExpenseStateError("Only pending expenses can be approved.");
  return db.accountingExpense.update({ where: { id }, data: { status: "APPROVED" } });
}

export async function rejectExpense(organizationId: string, id: string) {
  const expense = await db.accountingExpense.findFirst({ where: { id, organizationId } });
  if (!expense) throw new Error("Expense not found.");
  if (expense.status !== "PENDING") throw new ExpenseStateError("Only pending expenses can be rejected.");
  return db.accountingExpense.update({ where: { id }, data: { status: "REJECTED" } });
}

export async function payExpense(organizationId: string, id: string, paymentDate: Date) {
  const expense = await db.accountingExpense.findFirst({ where: { id, organizationId }, include: { category: true } });
  if (!expense) throw new Error("Expense not found.");
  if (expense.status !== "APPROVED") throw new ExpenseStateError("Only approved expenses can be paid.");

  const [cash, defaultExpense] = await Promise.all([
    getDefaultAccount(organizationId, "1000"),
    getDefaultAccount(organizationId, "5000"),
  ]);
  const expenseAccountId = expense.category?.expenseAccountId ?? defaultExpense.id;

  return db.$transaction(async (tx) => {
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
    return tx.accountingExpense.update({ where: { id }, data: { status: "PAID", paidAt: paymentDate } });
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
