import "server-only";

import { db } from "@/lib/db";
import { Prisma } from "@prisma/client";
import type { AccountingAccountType, AccountingInvoiceStatus, AccountingLiquidityType } from "@prisma/client";
import { createWithUniqueRetry } from "@/lib/unique-retry";
import {
  getOrganizationModuleConfiguration,
  updateOrganizationModuleConfigurationValues,
} from "@/platform/module-requests/configuration";
import { calculateTax } from "./tax-service";

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
  { code: "1200", name: "Inventory Asset", type: "ASSET" },
  { code: "1300", name: "Recoverable Input VAT", type: "ASSET" },
  { code: "1310", name: "Recoverable Input NHIL", type: "ASSET" },
  { code: "1320", name: "Recoverable Input GETFund Levy", type: "ASSET" },
  { code: "2000", name: "Accounts Payable", type: "LIABILITY" },
  { code: "2100", name: "VAT Payable", type: "LIABILITY" },
  { code: "2110", name: "NHIL Payable", type: "LIABILITY" },
  { code: "2120", name: "GETFund Levy Payable", type: "LIABILITY" },
  { code: "4000", name: "Revenue", type: "REVENUE" },
  { code: "5000", name: "General Expenses", type: "EXPENSE" },
];

export async function ensureDefaultAccounts(organizationId: string) {
  return db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`${organizationId}:accounting-default-accounts`}))`;
    const existing = await tx.accountingAccount.findMany({ where: { organizationId, isSystem: true } });
    const existingCodes = new Set(existing.map((account) => account.code));
    const missing = DEFAULT_ACCOUNTS.filter((account) => !existingCodes.has(account.code));
    if (missing.length > 0) await tx.accountingAccount.createMany({ data: missing.map((account) => ({ organizationId, ...account, isSystem: true })), skipDuplicates: true });
    return tx.accountingAccount.findMany({ where: { organizationId, isSystem: true } });
  }, { timeout: 20_000 });
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
export class AccountingPeriodLockedError extends Error {}
export class JournalReversalError extends Error {}

async function assertEntryDateIsOpen(tx: TxClient, organizationId: string, entryDate: Date) {
  const locked = await tx.accountingPeriod.findFirst({
    where: { organizationId, status: "CLOSED", startDate: { lte: entryDate }, endDate: { gte: entryDate } },
    select: { id: true },
  });
  if (locked) throw new AccountingPeriodLockedError("The accounting period is closed.");
}

async function nextPostingNumber(tx: TxClient, organizationId: string) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`${organizationId}:accounting-posting-number`}))`;
  const count = await tx.accountingJournalEntry.count({ where: { organizationId } });
  return `JRN-${String(count + 1).padStart(8, "0")}`;
}

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
    postingPurpose?: string | null;
    createdById?: string | null;
    lines: { accountId: string; debit?: string | number; credit?: string | number }[];
  },
) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`${organizationId}:accounting-periods`}))`;
  await assertEntryDateIsOpen(tx, organizationId, input.entryDate);

  if (input.sourceType && input.sourceId && input.postingPurpose) {
    const existing = await tx.accountingJournalEntry.findFirst({
      where: { organizationId, sourceType: input.sourceType, sourceId: input.sourceId, postingPurpose: input.postingPurpose },
      include: { lines: true },
    });
    if (existing) return existing;
  }

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
      postingPurpose: input.postingPurpose,
      postingNumber: await nextPostingNumber(tx, organizationId),
      createdById: input.createdById,
      lines: {
        create: input.lines.map((l) => ({ accountId: l.accountId, debit: l.debit ?? 0, credit: l.credit ?? 0 })),
      },
    },
  });
}

export async function postSourceJournalEntry(
  organizationId: string,
  input: {
    sourceType: string;
    sourceId: string;
    postingPurpose: string;
    entryDate: Date;
    description: string;
    reference?: string | null;
    createdById?: string | null;
    lines: { accountId: string; debit?: string; credit?: string }[];
  },
) {
  if (!input.sourceType.trim() || !input.sourceId.trim() || !input.postingPurpose.trim()) {
    throw new Error("Source type, source id, and posting purpose are required.");
  }
  try {
    return await db.$transaction((tx) => postJournalEntry(tx, organizationId, input));
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const existing = await db.accountingJournalEntry.findFirst({
        where: {
          organizationId,
          sourceType: input.sourceType,
          sourceId: input.sourceId,
          postingPurpose: input.postingPurpose,
        },
        include: { lines: true },
      });
      if (existing) return existing;
    }
    throw error;
  }
}

export function listAccountingPeriods(organizationId: string) {
  return db.accountingPeriod.findMany({ where: { organizationId }, orderBy: { startDate: "desc" } });
}

export async function createAccountingPeriod(
  organizationId: string,
  data: { name: string; startDate: Date; endDate: Date },
) {
  if (data.endDate < data.startDate) throw new Error("Period end date must not be before its start date.");
  return db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`${organizationId}:accounting-periods`}))`;
    const overlap = await tx.accountingPeriod.findFirst({
      where: { organizationId, startDate: { lte: data.endDate }, endDate: { gte: data.startDate } },
      select: { id: true },
    });
    if (overlap) throw new Error("Accounting periods cannot overlap.");
    return tx.accountingPeriod.create({ data: { organizationId, ...data } });
  });
}

export async function closeAccountingPeriod(organizationId: string, periodId: string, actorId: string | null) {
  return db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`${organizationId}:accounting-periods`}))`;
    const result = await tx.accountingPeriod.updateMany({
      where: { id: periodId, organizationId, status: "OPEN" },
      data: { status: "CLOSED", closedById: actorId, closedAt: new Date(), reopenedById: null, reopenedAt: null },
    });
    if (result.count === 0) throw new NotFoundError("Open accounting period not found.");
    return tx.accountingPeriod.findFirstOrThrow({ where: { id: periodId, organizationId } });
  });
}

export async function reopenAccountingPeriod(organizationId: string, periodId: string, actorId: string | null) {
  return db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`${organizationId}:accounting-periods`}))`;
    const result = await tx.accountingPeriod.updateMany({
      where: { id: periodId, organizationId, status: "CLOSED" },
      data: { status: "OPEN", reopenedById: actorId, reopenedAt: new Date() },
    });
    if (result.count === 0) throw new NotFoundError("Closed accounting period not found.");
    return tx.accountingPeriod.findFirstOrThrow({ where: { id: periodId, organizationId } });
  });
}

async function reverseJournalEntryInternal(
  organizationId: string,
  journalEntryId: string,
  data: {
    entryDate: Date;
    reason: string;
    actorId?: string | null;
    expectedSource?: { sourceType: string; sourceId: string; postingPurpose: string };
  },
) {
  return db.$transaction(async (tx) => {
    const original = await tx.accountingJournalEntry.findFirst({
      where: { id: journalEntryId, organizationId },
      include: { lines: true, reversal: { select: { id: true } } },
    });
    if (!original) throw new NotFoundError("Journal entry not found.");
    if (original.status !== "POSTED" || original.reversalOfId || original.reversal) {
      throw new JournalReversalError("This journal entry cannot be reversed.");
    }
    if (data.expectedSource) {
      if (
        original.sourceType !== data.expectedSource.sourceType ||
        original.sourceId !== data.expectedSource.sourceId ||
        original.postingPurpose !== data.expectedSource.postingPurpose
      ) {
        throw new JournalReversalError("The source-managed journal identity does not match.");
      }
    } else if (original.sourceType !== "MANUAL") {
      throw new JournalReversalError("Source-managed journal entries must be corrected from their originating module.");
    }
    const reversal = await postJournalEntry(tx, organizationId, {
      entryDate: data.entryDate,
      description: `Reversal of ${original.postingNumber}: ${data.reason}`,
      reference: original.reference,
      sourceType: "JOURNAL_REVERSAL",
      sourceId: original.id,
      postingPurpose: "FULL_REVERSAL",
      createdById: data.actorId,
      lines: original.lines.map((line) => ({
        accountId: line.accountId,
        debit: line.credit.toFixed(2),
        credit: line.debit.toFixed(2),
      })),
    });
    const claimed = await tx.accountingJournalEntry.updateMany({
      where: { id: original.id, organizationId, status: "POSTED" },
      data: { status: "REVERSED" },
    });
    if (claimed.count === 0) throw new JournalReversalError("This journal entry was already reversed.");
    return tx.accountingJournalEntry.update({ where: { id: reversal.id }, data: { reversalOfId: original.id } });
  });
}

/** User-facing reversal boundary. Only a genuinely manual journal can be reversed here. */
export function reverseJournalEntry(
  organizationId: string,
  journalEntryId: string,
  data: { entryDate: Date; reason: string; actorId?: string | null },
) {
  return reverseJournalEntryInternal(organizationId, journalEntryId, data);
}

/**
 * Source-module compensation boundary. The caller must present the complete,
 * server-resolved posting identity so it cannot reverse an unrelated entry.
 */
export function reverseSourceJournalEntry(
  organizationId: string,
  journalEntryId: string,
  data: {
    entryDate: Date;
    reason: string;
    actorId?: string | null;
    sourceType: string;
    sourceId: string;
    postingPurpose: string;
  },
) {
  const { sourceType, sourceId, postingPurpose, ...reversal } = data;
  return reverseJournalEntryInternal(organizationId, journalEntryId, {
    ...reversal,
    expectedSource: { sourceType, sourceId, postingPurpose },
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
  return db.accountingInvoice.findMany({ where: { organizationId }, include: { taxCode: true, payments: { include: { account: true, createdBy: true }, orderBy: [{ paymentDate: "desc" }, { createdAt: "desc" }] } }, orderBy: { createdAt: "desc" } });
}

export async function getReceivablesSummary(organizationId: string) {
  await sweepOverdueInvoices(organizationId);
  const invoices = await db.accountingInvoice.findMany({ where: { organizationId, status: { in: ["SENT", "OVERDUE", "PAID"] } }, include: { payments: { include: { account: true }, orderBy: { paymentDate: "asc" } } }, orderBy: [{ customerName: "asc" }, { issueDate: "asc" }] });
  const customers = new Map<string, { key: string; customerName: string; customerEmail: string | null; invoiced: Prisma.Decimal; paid: Prisma.Decimal; outstanding: Prisma.Decimal; overdue: Prisma.Decimal; invoices: typeof invoices }>();
  for (const invoice of invoices) {
    const key = invoice.customerEmail?.trim().toLowerCase() || `name:${invoice.customerName.trim().toLowerCase()}`;
    const current = customers.get(key) ?? { key, customerName: invoice.customerName, customerEmail: invoice.customerEmail, invoiced: new Prisma.Decimal(0), paid: new Prisma.Decimal(0), outstanding: new Prisma.Decimal(0), overdue: new Prisma.Decimal(0), invoices: [] };
    const outstanding = invoice.status === "VOID" ? new Prisma.Decimal(0) : invoice.amount.minus(invoice.amountPaid);
    current.invoiced = current.invoiced.plus(invoice.amount);
    current.paid = current.paid.plus(invoice.amountPaid);
    current.outstanding = current.outstanding.plus(outstanding);
    if (invoice.status === "OVERDUE") current.overdue = current.overdue.plus(outstanding);
    current.invoices.push(invoice);
    customers.set(key, current);
  }
  return [...customers.values()];
}

interface InvoiceInput {
  customerName: string;
  customerEmail?: string | null;
  description?: string | null;
  amount: string;
  issueDate: Date;
  dueDate: Date;
  taxCodeId?: string | null;
}

export async function createInvoice(organizationId: string, data: InvoiceInput, createdById?: string | null) {
  const tax = await calculateTax(organizationId, data.amount, data.taxCodeId, data.issueDate);
  return createWithUniqueRetry(async () => {
    const invoiceNumber = await generateInvoiceNumber(organizationId);
    return db.accountingInvoice.create({ data: { organizationId, invoiceNumber, createdById, customerName: data.customerName, customerEmail: data.customerEmail, description: data.description, issueDate: data.issueDate, dueDate: data.dueDate, taxCodeId: tax.taxCode?.id, taxableAmount: tax.taxableAmount, vatAmount: tax.vatAmount, nhilAmount: tax.nhilAmount, getfundAmount: tax.getfundAmount, amount: tax.grossAmount } });
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

  const accounts = await ensureDefaultAccounts(organizationId);
  const findAccount = (code: string) => { const account = accounts.find((candidate) => candidate.code === code); if (!account) throw new Error(`Default account ${code} missing.`); return account; };
  const [ar, revenue, vatPayable, nhilPayable, getfundPayable] = [findAccount("1100"), findAccount("4000"), findAccount("2100"), findAccount("2110"), findAccount("2120")];

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
        { accountId: revenue.id, credit: invoice.taxableAmount.toString() },
        ...(invoice.vatAmount.isPositive() ? [{ accountId: vatPayable.id, credit: invoice.vatAmount.toString() }] : []),
        ...(invoice.nhilAmount.isPositive() ? [{ accountId: nhilPayable.id, credit: invoice.nhilAmount.toString() }] : []),
        ...(invoice.getfundAmount.isPositive() ? [{ accountId: getfundPayable.id, credit: invoice.getfundAmount.toString() }] : []),
      ],
    });
    await tx.accountingTaxTransaction.create({ data: { organizationId, taxCodeId: invoice.taxCodeId, direction: "OUTPUT", transactionDate: invoice.issueDate, sourceType: "ACCOUNTING_INVOICE", sourceId: invoice.id, documentNumber: invoice.invoiceNumber, counterparty: invoice.customerName, taxableAmount: invoice.taxableAmount, vatAmount: invoice.vatAmount, nhilAmount: invoice.nhilAmount, getfundAmount: invoice.getfundAmount } });
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
export async function recordInvoicePayment(organizationId: string, id: string, inputOrAmount: { amount: string; paymentDate: Date; accountId: string; paymentMethod: string; reference?: string | null; notes?: string | null; createdById?: string | null } | string, legacyPaymentDate?: Date) {
  const legacy = typeof inputOrAmount === "string";
  const amount = legacy ? inputOrAmount : inputOrAmount.amount;
  // Prisma.Decimal throughout — this is a comparison against a database
  // Decimal column and a value that gets atomically incremented into it, so
  // exact arithmetic matters; JS Number comparison previously needed a 0.005
  // epsilon fudge-factor to work around float rounding, which Decimal makes
  // unnecessary.
  const paymentAmount = new Prisma.Decimal(amount);
  if (!paymentAmount.isFinite() || paymentAmount.lessThanOrEqualTo(0)) {
    throw new InvalidPaymentError("Payment amount must be a positive number.");
  }
  const input = legacy ? { amount, paymentDate: legacyPaymentDate ?? new Date(), accountId: "", paymentMethod: "CASH" } : inputOrAmount;

  const invoice = await db.accountingInvoice.findFirst({ where: { id, organizationId } });
  if (!invoice) throw new NotFoundError("Invoice not found.");
  if (paymentAmount.greaterThan(new Prisma.Decimal(invoice.amount).minus(invoice.amountPaid))) throw new InvalidPaymentError("Payment exceeds the current outstanding balance.");
  const [ar, legacyCash] = await Promise.all([getDefaultAccount(organizationId, "1100"), legacy ? getDefaultAccount(organizationId, "1000") : Promise.resolve(null)]);

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
    const receivingAccount = legacy ? legacyCash : await tx.accountingAccount.findFirst({ where: { id: input.accountId, organizationId, active: true, liquidityType: { in: ["CASH", "BANK", "MOBILE_MONEY"] } } });
    if (!receivingAccount) throw new InvalidPaymentError("Select an active cash, bank, or mobile-money account owned by this organization.");
    if (!input.paymentMethod.trim()) throw new InvalidPaymentError("Payment method is required.");

    const payment = legacy ? null : await tx.accountingReceivablePayment.create({ data: { organizationId, invoiceId: invoice.id, accountId: receivingAccount.id, paymentMethod: input.paymentMethod.trim(), amount: paymentAmount, paymentDate: input.paymentDate, reference: input.reference?.trim() || null, notes: input.notes?.trim() || null, createdById: input.createdById } });

    await postJournalEntry(tx, organizationId, {
      entryDate: input.paymentDate,
      description: `Payment received for invoice ${invoice.invoiceNumber}`,
      sourceType: payment ? "ACCOUNTING_RECEIVABLE_PAYMENT" : "INVOICE",
      sourceId: payment?.id ?? invoice.id,
      postingPurpose: payment ? "RECEIVED" : undefined,
      lines: [
        { accountId: receivingAccount.id, debit: input.amount },
        { accountId: ar.id, credit: input.amount },
      ],
    });

    const updated = await tx.accountingInvoice.update({
      where: { id },
      data: { amountPaid: { increment: paymentAmount } },
    });

    const isFullyPaid = new Prisma.Decimal(updated.amountPaid).greaterThanOrEqualTo(updated.amount);
    const finalInvoice = isFullyPaid ? await tx.accountingInvoice.update({ where: { id }, data: { status: "PAID", paidAt: input.paymentDate } }) : updated;
    return { invoice: finalInvoice, payment };
  }, { timeout: 20_000 });
}

export async function postProcurementTaxAccrual(organizationId: string, input: { invoiceId: string; invoiceNumber: string; vendorName: string; invoiceDate: Date; taxCodeId?: string | null; taxableAmount: Prisma.Decimal.Value; vatAmount: Prisma.Decimal.Value; nhilAmount: Prisma.Decimal.Value; getfundAmount: Prisma.Decimal.Value; totalAmount: Prisma.Decimal.Value; actorId?: string | null }) {
  const accounts = await ensureDefaultAccounts(organizationId);
  const findAccount = (code: string) => { const account = accounts.find((candidate) => candidate.code === code); if (!account) throw new Error(`Default account ${code} missing.`); return account; };
  const [inventory, inputVat, inputNhil, inputGetfund, payable] = [findAccount("1200"), findAccount("1300"), findAccount("1310"), findAccount("1320"), findAccount("2000")];
  const vatAmount = new Prisma.Decimal(input.vatAmount);
  const nhilAmount = new Prisma.Decimal(input.nhilAmount);
  const getfundAmount = new Prisma.Decimal(input.getfundAmount);
  return db.$transaction(async (tx) => {
    const entry = await postJournalEntry(tx, organizationId, { sourceType: "PROCUREMENT_SUPPLIER_INVOICE", sourceId: input.invoiceId, postingPurpose: "APPROVED", entryDate: input.invoiceDate, description: `Supplier invoice ${input.invoiceNumber}`, createdById: input.actorId, lines: [{ accountId: inventory.id, debit: new Prisma.Decimal(input.taxableAmount).toString() }, ...(vatAmount.isPositive() ? [{ accountId: inputVat.id, debit: vatAmount.toString() }] : []), ...(nhilAmount.isPositive() ? [{ accountId: inputNhil.id, debit: nhilAmount.toString() }] : []), ...(getfundAmount.isPositive() ? [{ accountId: inputGetfund.id, debit: getfundAmount.toString() }] : []), { accountId: payable.id, credit: new Prisma.Decimal(input.totalAmount).toString() }] });
    await tx.accountingTaxTransaction.create({ data: { organizationId, taxCodeId: input.taxCodeId, direction: "INPUT", transactionDate: input.invoiceDate, sourceType: "PROCUREMENT_SUPPLIER_INVOICE", sourceId: input.invoiceId, documentNumber: input.invoiceNumber, counterparty: input.vendorName, taxableAmount: input.taxableAmount, vatAmount: input.vatAmount, nhilAmount: input.nhilAmount, getfundAmount: input.getfundAmount } });
    return entry;
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
  const accounts = needsReversal ? await ensureDefaultAccounts(organizationId) : null;

  return db.$transaction(async (tx) => {
    const claimed = await tx.accountingInvoice.updateMany({
      where: { id, status: { in: ["DRAFT", "SENT", "OVERDUE"] } },
      data: { status: "VOID" },
    });
    if (claimed.count === 0) throw new InvoiceStateError("This invoice can no longer be voided.");

    if (accounts) {
      const findAccount = (code: string) => { const account = accounts.find((candidate) => candidate.code === code); if (!account) throw new Error(`Default account ${code} missing.`); return account; };
      const [ar, revenue, vatPayable, nhilPayable, getfundPayable] = [findAccount("1100"), findAccount("4000"), findAccount("2100"), findAccount("2110"), findAccount("2120")];
      await postJournalEntry(tx, organizationId, {
        entryDate: new Date(),
        description: `Void of invoice ${invoice.invoiceNumber} (reversal)`,
        sourceType: "INVOICE_VOID",
        sourceId: invoice.id,
        lines: [
          { accountId: revenue.id, debit: invoice.taxableAmount.toString() },
          ...(invoice.vatAmount.isPositive() ? [{ accountId: vatPayable.id, debit: invoice.vatAmount.toString() }] : []),
          ...(invoice.nhilAmount.isPositive() ? [{ accountId: nhilPayable.id, debit: invoice.nhilAmount.toString() }] : []),
          ...(invoice.getfundAmount.isPositive() ? [{ accountId: getfundPayable.id, debit: invoice.getfundAmount.toString() }] : []),
          { accountId: ar.id, credit: invoice.amount.toString() },
        ],
      });
      await tx.accountingTaxTransaction.create({ data: { organizationId, taxCodeId: invoice.taxCodeId, direction: "ADJUSTMENT", transactionDate: new Date(), sourceType: "ACCOUNTING_INVOICE_VOID", sourceId: invoice.id, documentNumber: invoice.invoiceNumber, counterparty: invoice.customerName, taxableAmount: invoice.taxableAmount.negated(), vatAmount: invoice.vatAmount.negated(), nhilAmount: invoice.nhilAmount.negated(), getfundAmount: invoice.getfundAmount.negated(), notes: "Invoice voided" } });
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

// --- Petty cash ---

export class PettyCashStateError extends Error {}

async function generatePettyCashAccountCode(organizationId: string) {
  // 13xx is an unused block in DEFAULT_ACCOUNTS (1000/1100/2000/4000/5000),
  // so a running count-based suffix here can never collide with a default
  // account code. createPettyCashFund still goes through
  // createWithUniqueRetry for the case two funds are created concurrently
  // and both read the same count.
  const count = await db.accountingPettyCashFund.count({ where: { organizationId } });
  return `13${String(count + 1).padStart(2, "0")}`;
}

interface PettyCashFundInput {
  name: string;
  custodianName: string;
  floatAmount: string;
}

/**
 * Sets up an imprest petty cash fund: a dedicated ASSET/CASH account backs
 * the fund so its balance is always derived from the same journal-line
 * ledger as every other account, then posts the initial float as a
 * transfer out of the main Cash account (Debit new fund account, Credit
 * 1000) rather than creating money from nothing.
 */
export async function createPettyCashFund(organizationId: string, data: PettyCashFundInput, createdById?: string | null) {
  const floatAmount = new Prisma.Decimal(data.floatAmount);
  if (!floatAmount.isFinite() || floatAmount.lessThanOrEqualTo(0)) {
    throw new InvalidPaymentError("Float amount must be a positive number.");
  }
  const cashSource = await getDefaultAccount(organizationId, "1000");

  return createWithUniqueRetry(async () => {
    const code = await generatePettyCashAccountCode(organizationId);
    return db.$transaction(async (tx) => {
      const account = await tx.accountingAccount.create({
        data: { organizationId, code, name: `Petty Cash (${data.name})`, type: "ASSET", liquidityType: "CASH" },
      });
      const fund = await tx.accountingPettyCashFund.create({
        data: { organizationId, accountId: account.id, name: data.name, custodianName: data.custodianName, floatAmount, createdById },
      });
      const entry = await postJournalEntry(tx, organizationId, {
        entryDate: new Date(),
        description: `Petty cash float issued to ${data.custodianName} (${data.name})`,
        sourceType: "PETTY_CASH_FUNDING",
        sourceId: fund.id,
        createdById,
        lines: [
          { accountId: account.id, debit: floatAmount.toFixed(2) },
          { accountId: cashSource.id, credit: floatAmount.toFixed(2) },
        ],
      });
      await tx.accountingPettyCashTransaction.create({
        data: { organizationId, fundId: fund.id, type: "FUNDING", amount: floatAmount, description: "Initial float", journalEntryId: entry.id, createdById },
      });
      return fund;
    });
  });
}

export async function listPettyCashFunds(organizationId: string) {
  const funds = await db.accountingPettyCashFund.findMany({
    where: { organizationId },
    include: {
      account: { include: { journalLines: true } },
      transactions: { orderBy: { createdAt: "desc" }, take: 20, include: { expenseCategory: true } },
    },
    orderBy: { createdAt: "desc" },
  });
  return funds.map((fund) => ({ ...fund, balance: computeBalance(fund.account.type, fund.account.journalLines) }));
}

export async function getPettyCashFund(organizationId: string, id: string) {
  const fund = await db.accountingPettyCashFund.findFirst({
    where: { id, organizationId },
    include: {
      account: { include: { journalLines: true } },
      transactions: { orderBy: { createdAt: "desc" }, take: 100, include: { expenseCategory: true } },
    },
  });
  if (!fund) throw new NotFoundError("Petty cash fund not found.");
  return { ...fund, balance: computeBalance(fund.account.type, fund.account.journalLines) };
}

/**
 * Row-locks the fund before re-reading its ledger balance inside the
 * transaction, the same SELECT ... FOR UPDATE pattern recordInvoicePayment
 * uses for its overpayment race - two concurrent expenses against a fund
 * with only enough float for one can no longer both pass the balance check
 * against a stale snapshot.
 */
export async function recordPettyCashExpense(
  organizationId: string,
  fundId: string,
  data: { amount: string; description: string; expenseCategoryId?: string | null; expenseDate?: Date },
  createdById?: string | null,
) {
  const amount = new Prisma.Decimal(data.amount);
  if (!amount.isFinite() || amount.lessThanOrEqualTo(0)) {
    throw new InvalidPaymentError("Expense amount must be a positive number.");
  }

  const fund = await db.accountingPettyCashFund.findFirst({ where: { id: fundId, organizationId } });
  if (!fund) throw new NotFoundError("Petty cash fund not found.");

  const [category, defaultExpense] = await Promise.all([
    data.expenseCategoryId ? db.accountingExpenseCategory.findFirst({ where: { id: data.expenseCategoryId, organizationId } }) : Promise.resolve(null),
    getDefaultAccount(organizationId, "5000"),
  ]);
  const expenseAccountId = category?.expenseAccountId ?? defaultExpense.id;

  return db.$transaction(async (tx) => {
    const [locked] = await tx.$queryRaw<{ id: string; status: string }[]>`
      SELECT id, status FROM "AccountingPettyCashFund" WHERE id = ${fundId} AND "organizationId" = ${organizationId} FOR UPDATE
    `;
    if (!locked) throw new NotFoundError("Petty cash fund not found.");
    if (locked.status !== "ACTIVE") throw new PettyCashStateError("This petty cash fund is closed.");

    const lines = await tx.accountingJournalLine.findMany({ where: { accountId: fund.accountId } });
    const balance = new Prisma.Decimal(computeBalance("ASSET", lines));
    if (amount.greaterThan(balance)) {
      throw new InvalidPaymentError(`Expense of ${amount.toFixed(2)} exceeds the fund's available balance of ${balance.toFixed(2)}.`);
    }

    const entry = await postJournalEntry(tx, organizationId, {
      entryDate: data.expenseDate ?? new Date(),
      description: `Petty cash expense: ${data.description}`,
      sourceType: "PETTY_CASH_EXPENSE",
      sourceId: fund.id,
      createdById,
      lines: [
        { accountId: expenseAccountId, debit: amount.toFixed(2) },
        { accountId: fund.accountId, credit: amount.toFixed(2) },
      ],
    });

    return tx.accountingPettyCashTransaction.create({
      data: { organizationId, fundId: fund.id, type: "EXPENSE", amount, description: data.description, expenseCategoryId: category?.id ?? null, journalEntryId: entry.id, createdById },
    });
  });
}

/**
 * Tops the fund back up to its float amount by default (the standard
 * imprest replenishment), or a caller-supplied amount for a partial
 * top-up. Sourced from the main Cash account, same direction as the
 * initial funding entry.
 */
export async function replenishPettyCashFund(
  organizationId: string,
  fundId: string,
  data: { amount?: string; description?: string | null },
  createdById?: string | null,
) {
  const fund = await db.accountingPettyCashFund.findFirst({ where: { id: fundId, organizationId } });
  if (!fund) throw new NotFoundError("Petty cash fund not found.");
  const cashSource = await getDefaultAccount(organizationId, "1000");

  return db.$transaction(async (tx) => {
    const [locked] = await tx.$queryRaw<{ id: string; status: string }[]>`
      SELECT id, status FROM "AccountingPettyCashFund" WHERE id = ${fundId} AND "organizationId" = ${organizationId} FOR UPDATE
    `;
    if (!locked) throw new NotFoundError("Petty cash fund not found.");
    if (locked.status !== "ACTIVE") throw new PettyCashStateError("This petty cash fund is closed.");

    const lines = await tx.accountingJournalLine.findMany({ where: { accountId: fund.accountId } });
    const balance = new Prisma.Decimal(computeBalance("ASSET", lines));
    const shortfall = new Prisma.Decimal(fund.floatAmount).minus(balance);
    const amount = data.amount ? new Prisma.Decimal(data.amount) : shortfall;
    if (!amount.isFinite() || amount.lessThanOrEqualTo(0)) {
      throw new InvalidPaymentError("There is no shortfall to replenish, or the replenishment amount must be a positive number.");
    }

    const entry = await postJournalEntry(tx, organizationId, {
      entryDate: new Date(),
      description: `Petty cash replenishment for ${fund.name}`,
      sourceType: "PETTY_CASH_REPLENISHMENT",
      sourceId: fund.id,
      createdById,
      lines: [
        { accountId: fund.accountId, debit: amount.toFixed(2) },
        { accountId: cashSource.id, credit: amount.toFixed(2) },
      ],
    });

    return tx.accountingPettyCashTransaction.create({
      data: { organizationId, fundId: fund.id, type: "REPLENISHMENT", amount, description: data.description ?? "Float replenishment", journalEntryId: entry.id, createdById },
    });
  });
}

/**
 * Closes the fund (claimed atomically, same guarded-updateMany pattern as
 * markInvoiceSent) and, if any float remains, posts a reversing entry
 * returning it to the main Cash account so the fund's account doesn't sit
 * on an orphaned balance after closure.
 */
export async function closePettyCashFund(organizationId: string, fundId: string, createdById?: string | null) {
  const fund = await db.accountingPettyCashFund.findFirst({ where: { id: fundId, organizationId } });
  if (!fund) throw new NotFoundError("Petty cash fund not found.");
  const cashDestination = await getDefaultAccount(organizationId, "1000");

  return db.$transaction(async (tx) => {
    const claimed = await tx.accountingPettyCashFund.updateMany({
      where: { id: fundId, organizationId, status: "ACTIVE" },
      data: { status: "CLOSED", closedAt: new Date() },
    });
    if (claimed.count === 0) throw new PettyCashStateError("This petty cash fund is already closed.");

    const lines = await tx.accountingJournalLine.findMany({ where: { accountId: fund.accountId } });
    const balance = new Prisma.Decimal(computeBalance("ASSET", lines));
    if (balance.greaterThan(0)) {
      await postJournalEntry(tx, organizationId, {
        entryDate: new Date(),
        description: `Petty cash fund closed, remaining float returned (${fund.name})`,
        sourceType: "PETTY_CASH_CLOSE",
        sourceId: fund.id,
        createdById,
        lines: [
          { accountId: cashDestination.id, debit: balance.toFixed(2) },
          { accountId: fund.accountId, credit: balance.toFixed(2) },
        ],
      });
    }
    return tx.accountingPettyCashFund.findUniqueOrThrow({ where: { id: fundId } });
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

  const [invoices, expenses, activePettyCashFunds] = await Promise.all([
    db.accountingInvoice.findMany({ where: { organizationId } }),
    db.accountingExpense.findMany({ where: { organizationId } }),
    listPettyCashFunds(organizationId).then((funds) => funds.filter((f) => f.status === "ACTIVE")),
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
    pettyCashFundCount: activePettyCashFunds.length,
    pettyCashBalance: activePettyCashFunds.reduce((sum, f) => sum + f.balance, 0),
  };
}

/**
 * Assets = Liabilities + Equity is the fundamental accounting identity.
 * Revenue and Expense accounts have no balance-sheet home of their own, so
 * the current period's net income (not yet closed into a named equity
 * account by a period-end close, which this system doesn't require) is
 * folded into totalEquity as "Retained earnings (current period)" the same
 * way a real close-out journal entry would - otherwise the statement would
 * only balance immediately after a manual close.
 */
export async function getStatementOfFinancialPosition(organizationId: string) {
  const accounts = await listAccounts(organizationId);

  const assets = accounts.filter((a) => a.type === "ASSET");
  const liabilities = accounts.filter((a) => a.type === "LIABILITY");
  const equityAccounts = accounts.filter((a) => a.type === "EQUITY");
  const revenueAccounts = accounts.filter((a) => a.type === "REVENUE");
  const expenseAccounts = accounts.filter((a) => a.type === "EXPENSE");

  const line = (a: (typeof accounts)[number]) => ({ id: a.id, code: a.code, name: a.name, balance: a.balance });

  const totalAssets = assets.reduce((sum, a) => sum + a.balance, 0);
  const totalLiabilities = liabilities.reduce((sum, a) => sum + a.balance, 0);
  const statedEquity = equityAccounts.reduce((sum, a) => sum + a.balance, 0);
  const netIncome = revenueAccounts.reduce((sum, a) => sum + a.balance, 0) - expenseAccounts.reduce((sum, a) => sum + a.balance, 0);
  const totalEquity = statedEquity + netIncome;
  const difference = totalAssets - (totalLiabilities + totalEquity);

  return {
    asOf: new Date(),
    assets: assets.map(line),
    liabilities: liabilities.map(line),
    equity: equityAccounts.map(line),
    totalAssets,
    totalLiabilities,
    statedEquity,
    netIncome,
    totalEquity,
    isBalanced: Math.abs(difference) < 0.01,
    difference,
  };
}

export type { AccountingInvoiceStatus };
