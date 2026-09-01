import "server-only";

import { db } from "@/lib/db";
import { Prisma } from "@prisma/client";
import type { AccountingAccountType, AccountingAttachmentEntityType, AccountingInvoiceStatus, AccountingJournalStatus, AccountingLiquidityType, AccountingRecurringFrequency } from "@prisma/client";
import { createWithUniqueRetry } from "@/lib/unique-retry";
import { formatMoney } from "@/lib/currency";
import { buildTrendBuckets, widestTrendLookback, type TrendGranularity } from "@/lib/trend-buckets";
import {
  getOrganizationModuleConfiguration,
  updateOrganizationModuleConfigurationValues,
} from "@/platform/module-requests/configuration";
import { calculateTax } from "./tax-service";
import { listSupplierInvoices } from "@/modules/procurement/service";

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
    include: { journalLines: { where: { journalEntry: { status: { notIn: NON_POSTED_JOURNAL_STATUSES } } } } },
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
    return postJournalEntry(tx, organizationId, { entryDate: asOfDate, description: `Opening balance for ${account.name}`, sourceModule: "accounting", sourceType: "OPENING_BALANCE", sourceId: account.id, createdById, lines: [{ accountId: debitAccount, debit: absolute }, { accountId: creditAccount, credit: absolute }] });
  });
}

export async function getCashbook(organizationId: string, accountId?: string | null) {
  const accounts = await db.accountingAccount.findMany({ where: { organizationId, liquidityType: { not: "NONE" }, ...(accountId ? { id: accountId } : {}) }, select: { id: true } });
  const ids = accounts.map((account) => account.id);
  return db.accountingJournalLine.findMany({ where: { accountId: { in: ids }, account: { organizationId }, journalEntry: { status: { notIn: NON_POSTED_JOURNAL_STATUSES } } }, include: { account: true, journalEntry: true }, orderBy: { journalEntry: { entryDate: "desc" } }, take: 500 });
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

export class ReconciliationStateError extends Error {}

const RECONCILIATION_MATCH_DATE_WINDOW_DAYS = 3;
const RECONCILIATION_MATCH_AMOUNT_TOLERANCE = new Prisma.Decimal("0.01");

/** The draft-and-import half of reconciliation: creates (or returns the existing)
 * DRAFT reconciliation for this account/period, ready to receive an imported bank
 * statement before completeDraftReconciliation() closes it out. completeReconciliation()
 * above is untouched and still does the instant, no-import path in one step. */
export async function createDraftReconciliation(organizationId: string, data: { accountId: string; periodStart: Date; periodEnd: Date }, actorId?: string | null) {
  const account = (await listAccounts(organizationId)).find((item) => item.id === data.accountId && item.liquidityType !== "NONE");
  if (!account) throw new NotFoundError("Cash or bank account not found.");
  const existing = await db.accountingReconciliation.findFirst({
    where: { organizationId, accountId: account.id, periodStart: data.periodStart, periodEnd: data.periodEnd, status: "DRAFT" },
  });
  if (existing) return existing;
  try {
    return await db.accountingReconciliation.create({
      data: { organizationId, accountId: account.id, periodStart: data.periodStart, periodEnd: data.periodEnd, statementBalance: 0, ledgerBalance: 0, difference: 0, status: "DRAFT", completedById: actorId ?? null },
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw new ReconciliationStateError("This account and period already has a completed reconciliation.");
    }
    throw error;
  }
}

async function requireDraftReconciliation(organizationId: string, reconciliationId: string) {
  const reconciliation = await db.accountingReconciliation.findFirst({ where: { id: reconciliationId, organizationId } });
  if (!reconciliation) throw new NotFoundError("Reconciliation not found.");
  if (reconciliation.status !== "DRAFT") throw new ReconciliationStateError("This reconciliation is no longer a draft.");
  return reconciliation;
}

export function getReconciliation(organizationId: string, reconciliationId: string) {
  return db.accountingReconciliation.findFirst({ where: { id: reconciliationId, organizationId }, include: { account: true } });
}

export function listBankStatementLines(organizationId: string, reconciliationId: string) {
  return db.accountingBankStatementLine.findMany({
    where: { organizationId, reconciliationId },
    include: { matchedJournalLine: { include: { journalEntry: true } } },
    orderBy: [{ date: "asc" }, { sequenceInFile: "asc" }],
  });
}

/** Inserts one AccountingBankStatementLine per row, keyed by its 0-indexed position in
 * the source file - skipDuplicates makes re-importing the exact same file a no-op,
 * since the same rows land on the same (reconciliationId, sequenceInFile) identities. */
export async function importBankStatementLines(organizationId: string, reconciliationId: string, rows: { date: Date; description: string; amount: string }[]) {
  await requireDraftReconciliation(organizationId, reconciliationId);
  if (rows.length === 0) throw new Error("No statement rows to import.");
  const result = await db.accountingBankStatementLine.createMany({
    data: rows.map((row, index) => ({ organizationId, reconciliationId, sequenceInFile: index, date: row.date, description: row.description, amount: row.amount })),
    skipDuplicates: true,
  });
  return { importedCount: result.count, skippedCount: rows.length - result.count };
}

export interface ReconciliationMatchSuggestion {
  statementLineId: string;
  journalLineId: string;
  journalEntryDescription: string;
  journalEntryDate: Date;
  postingNumber: string;
}

/** For each UNMATCHED statement line, suggests the best unclaimed, POSTED journal line
 * on the same account whose net debit-minus-credit exactly equals the statement line's
 * signed amount (positive = money in, matching an asset account's debit-normal balance)
 * within a small date window - computed fresh on every call rather than persisted, so a
 * suggestion can never go stale against later matches or corrections. */
export async function suggestReconciliationMatches(organizationId: string, reconciliationId: string): Promise<ReconciliationMatchSuggestion[]> {
  const reconciliation = await db.accountingReconciliation.findFirst({ where: { id: reconciliationId, organizationId } });
  if (!reconciliation) throw new NotFoundError("Reconciliation not found.");

  const [statementLines, candidateLines] = await Promise.all([
    db.accountingBankStatementLine.findMany({ where: { organizationId, reconciliationId, status: "UNMATCHED" } }),
    db.accountingJournalLine.findMany({
      where: {
        accountId: reconciliation.accountId,
        bankStatementMatch: null,
        journalEntry: {
          status: "POSTED",
          entryDate: {
            gte: new Date(reconciliation.periodStart.getTime() - RECONCILIATION_MATCH_DATE_WINDOW_DAYS * 86_400_000),
            lte: new Date(reconciliation.periodEnd.getTime() + RECONCILIATION_MATCH_DATE_WINDOW_DAYS * 86_400_000),
          },
        },
      },
      include: { journalEntry: true },
    }),
  ]);

  const suggestions: ReconciliationMatchSuggestion[] = [];
  const claimed = new Set<string>();
  for (const statementLine of statementLines) {
    const net = new Prisma.Decimal(statementLine.amount);
    let best: (typeof candidateLines)[number] | null = null;
    let bestTier = Infinity;
    let bestDateDiff = Infinity;
    for (const candidate of candidateLines) {
      if (claimed.has(candidate.id)) continue;
      const candidateNet = new Prisma.Decimal(candidate.debit).minus(candidate.credit);
      const difference = candidateNet.minus(net).abs();
      // Tier 0: exact amount match, preferred whenever one exists. Tier 1: within a
      // small tolerance (e.g. a bank fee shaving a few pesewas off the posted amount)
      // - only considered when no exact match exists for this statement line.
      const tier = difference.isZero() ? 0 : difference.lte(RECONCILIATION_MATCH_AMOUNT_TOLERANCE) ? 1 : null;
      if (tier === null) continue;
      const dateDiff = Math.abs(candidate.journalEntry.entryDate.getTime() - statementLine.date.getTime());
      if (tier < bestTier || (tier === bestTier && dateDiff < bestDateDiff)) {
        best = candidate;
        bestTier = tier;
        bestDateDiff = dateDiff;
      }
    }
    if (best) {
      claimed.add(best.id);
      suggestions.push({
        statementLineId: statementLine.id,
        journalLineId: best.id,
        journalEntryDescription: best.journalEntry.description,
        journalEntryDate: best.journalEntry.entryDate,
        postingNumber: best.journalEntry.postingNumber,
      });
    }
  }
  return suggestions;
}

export async function confirmReconciliationMatch(organizationId: string, reconciliationId: string, statementLineId: string, journalLineId: string) {
  const reconciliation = await requireDraftReconciliation(organizationId, reconciliationId);
  const [statementLine, journalLine] = await Promise.all([
    db.accountingBankStatementLine.findFirst({ where: { id: statementLineId, organizationId, reconciliationId } }),
    db.accountingJournalLine.findFirst({ where: { id: journalLineId, accountId: reconciliation.accountId } }),
  ]);
  if (!statementLine || !journalLine) throw new NotFoundError("Statement line or journal line not found.");
  if (statementLine.status !== "UNMATCHED") throw new ReconciliationStateError("This statement line has already been decided.");
  try {
    return await db.accountingBankStatementLine.update({
      where: { id: statementLineId },
      data: { status: "MATCHED", matchedJournalLineId: journalLineId },
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw new ReconciliationStateError("That journal line is already matched to another statement line.");
    }
    throw error;
  }
}

export async function ignoreReconciliationLine(organizationId: string, reconciliationId: string, statementLineId: string) {
  await requireDraftReconciliation(organizationId, reconciliationId);
  const result = await db.accountingBankStatementLine.updateMany({
    where: { id: statementLineId, organizationId, reconciliationId, status: "UNMATCHED" },
    data: { status: "IGNORED" },
  });
  if (result.count === 0) throw new ReconciliationStateError("This statement line has already been decided.");
}

/** Closes a draft reconciliation with the same ledgerBalance/difference math
 * completeReconciliation() already uses - unmatched statement lines are never posted
 * anywhere, so they simply remain visible as open items and correctly keep the
 * difference non-zero until a human resolves them (post the missing entry, or ignore
 * a bank-only line like an unbooked fee). */
export async function completeDraftReconciliation(organizationId: string, reconciliationId: string, data: { statementBalance: string; notes?: string | null }, actorId?: string | null) {
  const reconciliation = await requireDraftReconciliation(organizationId, reconciliationId);
  const account = (await listAccounts(organizationId)).find((item) => item.id === reconciliation.accountId);
  if (!account) throw new NotFoundError("Cash or bank account not found.");
  const statementBalance = new Prisma.Decimal(data.statementBalance);
  const ledgerBalance = new Prisma.Decimal(account.balance);
  const claimed = await db.accountingReconciliation.updateMany({
    where: { id: reconciliationId, organizationId, status: "DRAFT" },
    data: { statementBalance, ledgerBalance, difference: statementBalance.minus(ledgerBalance), status: "COMPLETED", notes: data.notes, completedById: actorId ?? null, completedAt: new Date() },
  });
  if (claimed.count === 0) throw new ReconciliationStateError("This reconciliation is no longer a draft.");
  return db.accountingReconciliation.findUniqueOrThrow({ where: { id: reconciliationId } });
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
export class JournalApprovalError extends Error {}

/**
 * A journal entry in either of these statuses has no real ledger effect yet
 * (never posted, or posted then withdrawn) - every balance-affecting read
 * (account balances, trial balance, general ledger, cashbook, cash-flow)
 * must exclude them so a manual entry awaiting approval cannot move a
 * reported balance before anyone has approved it. POSTED and REVERSED are
 * both included: a reversal leaves the original entry's lines in place and
 * adds a new POSTED entry with the opposite signs, so the two together net
 * to zero only if both remain in the sum.
 */
const NON_POSTED_JOURNAL_STATUSES: AccountingJournalStatus[] = ["PENDING_APPROVAL", "REJECTED"];

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
    sourceModule?: string | null;
    sourceType?: string | null;
    sourceId?: string | null;
    postingPurpose?: string | null;
    branchId?: string | null;
    createdById?: string | null;
    status?: "POSTED" | "PENDING_APPROVAL";
    submittedById?: string | null;
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

  const sourceModule = input.sourceModule?.trim().toLowerCase() || null;
  if (sourceModule && !/^[a-z][a-z0-9_-]{0,63}$/.test(sourceModule)) {
    throw new Error("Source module must be a canonical module key.");
  }
  if (input.branchId) {
    const ownedBranch = await tx.branch.count({ where: { id: input.branchId, organizationId } });
    if (ownedBranch !== 1) throw new NotFoundError("The journal branch could not be found in this organization.");
  }

  return tx.accountingJournalEntry.create({
    data: {
      organizationId,
      entryDate: input.entryDate,
      description: input.description,
      reference: input.reference,
      sourceModule,
      sourceType: input.sourceType,
      sourceId: input.sourceId,
      postingPurpose: input.postingPurpose,
      branchId: input.branchId,
      postingNumber: await nextPostingNumber(tx, organizationId),
      createdById: input.createdById,
      status: input.status ?? "POSTED",
      submittedById: input.status === "PENDING_APPROVAL" ? input.submittedById : null,
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
    sourceModule?: string | null;
    createdById?: string | null;
    branchId?: string | null;
    lines: { accountId: string; debit?: string; credit?: string }[];
  },
) {
  if (!input.sourceType.trim() || !input.sourceId.trim() || !input.postingPurpose.trim()) {
    throw new Error("Source type, source id, and posting purpose are required.");
  }
  try {
    return await db.$transaction((tx) => postJournalEntry(tx, organizationId, input), { timeout: 30_000 });
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
      sourceModule: original.sourceModule,
      sourceType: "JOURNAL_REVERSAL",
      sourceId: original.id,
      postingPurpose: "FULL_REVERSAL",
      branchId: original.branchId,
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
  }, { timeout: 20_000 });
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
    /** Set by the caller from the actor's own ACCOUNTING_JOURNAL_APPROVE permission - the
     * service layer has no permission context of its own. When true, the entry is created
     * PENDING_APPROVAL instead of posting immediately, with no effect on account balances
     * until approveJournalEntry() flips it to POSTED. */
    requiresApproval?: boolean;
  },
) {
  const { requiresApproval, ...rest } = data;
  return db.$transaction((tx) =>
    postJournalEntry(tx, organizationId, {
      ...rest,
      sourceModule: "accounting",
      sourceType: "MANUAL",
      sourceId: null,
      status: requiresApproval ? "PENDING_APPROVAL" : "POSTED",
      submittedById: requiresApproval ? data.createdById : null,
    }),
  );
}

/** Submitter-cannot-approve-own-entry guard mirrors the Planning module's proven approval pattern. */
export async function approveJournalEntry(organizationId: string, journalEntryId: string, actorId: string) {
  return db.$transaction(async (tx) => {
    const entry = await tx.accountingJournalEntry.findFirst({ where: { id: journalEntryId, organizationId } });
    if (!entry) throw new NotFoundError("Journal entry not found.");
    if (entry.status !== "PENDING_APPROVAL") throw new JournalApprovalError("This journal entry is not awaiting approval.");
    if (entry.submittedById && entry.submittedById === actorId) {
      throw new JournalApprovalError("The submitter cannot approve their own journal entry.");
    }
    const claimed = await tx.accountingJournalEntry.updateMany({
      where: { id: journalEntryId, organizationId, status: "PENDING_APPROVAL" },
      data: { status: "POSTED", approvedById: actorId, approvedAt: new Date() },
    });
    if (claimed.count === 0) throw new JournalApprovalError("This journal entry is not awaiting approval.");
    return tx.accountingJournalEntry.findUniqueOrThrow({ where: { id: journalEntryId } });
  });
}

export async function rejectJournalEntry(organizationId: string, journalEntryId: string, actorId: string, reason: string) {
  if (!reason.trim()) throw new JournalApprovalError("A rejection reason is required.");
  return db.$transaction(async (tx) => {
    const entry = await tx.accountingJournalEntry.findFirst({ where: { id: journalEntryId, organizationId } });
    if (!entry) throw new NotFoundError("Journal entry not found.");
    if (entry.status !== "PENDING_APPROVAL") throw new JournalApprovalError("This journal entry is not awaiting approval.");
    const claimed = await tx.accountingJournalEntry.updateMany({
      where: { id: journalEntryId, organizationId, status: "PENDING_APPROVAL" },
      data: { status: "REJECTED", approvedById: actorId, approvedAt: new Date(), rejectedReason: reason.trim() },
    });
    if (claimed.count === 0) throw new JournalApprovalError("This journal entry is not awaiting approval.");
    return tx.accountingJournalEntry.findUniqueOrThrow({ where: { id: journalEntryId } });
  });
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
  return db.accountingInvoice.findMany({ where: { organizationId }, include: { taxCode: true, lines: { orderBy: { sortOrder: "asc" } }, payments: { include: { account: true, createdBy: true }, orderBy: [{ paymentDate: "desc" }, { createdAt: "desc" }] } }, orderBy: { createdAt: "desc" } });
}

export async function getReceivablesSummary(organizationId: string) {
  await sweepOverdueInvoices(organizationId);
  const invoices = await db.accountingInvoice.findMany({ where: { organizationId, status: { in: ["SENT", "OVERDUE", "PAID"] } }, include: { payments: { include: { account: true }, orderBy: { paymentDate: "asc" } } }, orderBy: [{ customerName: "asc" }, { issueDate: "asc" }] });
  const customers = new Map<string, { key: string; customerName: string; customerEmail: string | null; invoiced: Prisma.Decimal; paid: Prisma.Decimal; outstanding: Prisma.Decimal; overdue: Prisma.Decimal; invoices: typeof invoices }>();
  for (const invoice of invoices) {
    const key = invoice.customerEmail?.trim().toLowerCase() || `name:${invoice.customerName.trim().toLowerCase()}`;
    const current = customers.get(key) ?? { key, customerName: invoice.customerName, customerEmail: invoice.customerEmail, invoiced: new Prisma.Decimal(0), paid: new Prisma.Decimal(0), outstanding: new Prisma.Decimal(0), overdue: new Prisma.Decimal(0), invoices: [] };
    const outstanding = invoice.status === "VOID" ? new Prisma.Decimal(0) : invoice.amount.minus(invoice.amountPaid).minus(invoice.amountCredited);
    current.invoiced = current.invoiced.plus(invoice.amount);
    current.paid = current.paid.plus(invoice.amountPaid);
    current.outstanding = current.outstanding.plus(outstanding);
    if (invoice.status === "OVERDUE") current.overdue = current.overdue.plus(outstanding);
    current.invoices.push(invoice);
    customers.set(key, current);
  }
  return [...customers.values()];
}

export class InvalidLineItemsError extends Error {}

export interface LineItemInput {
  description: string;
  quantity: string;
  unitPrice: string;
}

interface ComputedLine {
  description: string;
  quantity: Prisma.Decimal;
  unitPrice: Prisma.Decimal;
  lineTotal: Prisma.Decimal;
  sortOrder: number;
}

/**
 * Shared by Invoices, Bills, and Credit Notes - every document type built
 * from freeform line items funnels through this one computation so a
 * quantity/unit-price validation rule (or the rounding rule itself) only
 * ever needs to change in one place. Returns the per-line breakdown plus
 * the taxable total (sum of every line's lineTotal), which the caller then
 * feeds to calculateTax() exactly as a document's single header amount
 * used to be fed to it directly.
 */
export function computeLineItems(lines: LineItemInput[]): { lines: ComputedLine[]; taxableAmount: Prisma.Decimal } {
  if (lines.length === 0) throw new InvalidLineItemsError("At least one line item is required.");
  const computed = lines.map((line, index) => {
    const description = line.description.trim();
    if (!description) throw new InvalidLineItemsError(`Line ${index + 1}: description is required.`);
    const quantity = new Prisma.Decimal(line.quantity || "0");
    if (!quantity.isFinite() || quantity.lessThanOrEqualTo(0)) throw new InvalidLineItemsError(`Line ${index + 1}: quantity must be greater than zero.`);
    const unitPrice = new Prisma.Decimal(line.unitPrice || "0");
    if (!unitPrice.isFinite() || unitPrice.isNegative()) throw new InvalidLineItemsError(`Line ${index + 1}: unit price cannot be negative.`);
    const lineTotal = quantity.times(unitPrice).toDecimalPlaces(2);
    return { description, quantity, unitPrice, lineTotal, sortOrder: index };
  });
  const taxableAmount = computed.reduce((sum, line) => sum.plus(line.lineTotal), new Prisma.Decimal(0));
  return { lines: computed, taxableAmount };
}

interface InvoiceInput {
  contactId?: string | null;
  customerName: string;
  customerEmail?: string | null;
  description?: string | null;
  lines: LineItemInput[];
  issueDate: Date;
  dueDate: Date;
  taxCodeId?: string | null;
}

export async function createInvoice(organizationId: string, data: InvoiceInput, createdById?: string | null) {
  const { lines, taxableAmount } = computeLineItems(data.lines);
  const tax = await calculateTax(organizationId, taxableAmount, data.taxCodeId, data.issueDate);
  return createWithUniqueRetry(async () => {
    const invoiceNumber = await generateInvoiceNumber(organizationId);
    return db.accountingInvoice.create({
      data: {
        organizationId,
        invoiceNumber,
        createdById,
        contactId: data.contactId,
        customerName: data.customerName,
        customerEmail: data.customerEmail,
        description: data.description,
        issueDate: data.issueDate,
        dueDate: data.dueDate,
        taxCodeId: tax.taxCode?.id,
        taxableAmount: tax.taxableAmount,
        vatAmount: tax.vatAmount,
        nhilAmount: tax.nhilAmount,
        getfundAmount: tax.getfundAmount,
        amount: tax.grossAmount,
        lines: { create: lines.map((line) => ({ description: line.description, quantity: line.quantity, unitPrice: line.unitPrice, lineTotal: line.lineTotal, sortOrder: line.sortOrder })) },
      },
      include: { lines: true },
    });
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
      sourceModule: "accounting",
      sourceType: "INVOICE",
      sourceId: invoice.id,
      branchId: invoice.branchId,
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

type LockedInvoiceRow = { id: string; amount: Prisma.Decimal | string; amountPaid: Prisma.Decimal | string; amountCredited: Prisma.Decimal | string; status: string };

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
  if (paymentAmount.greaterThan(new Prisma.Decimal(invoice.amount).minus(invoice.amountPaid).minus(invoice.amountCredited))) throw new InvalidPaymentError("Payment exceeds the current outstanding balance.");
  const [ar, legacyCash] = await Promise.all([getDefaultAccount(organizationId, "1100"), legacy ? getDefaultAccount(organizationId, "1000") : Promise.resolve(null)]);

  return db.$transaction(async (tx) => {
    const [locked] = await tx.$queryRaw<LockedInvoiceRow[]>`
      SELECT id, amount, "amountPaid", "amountCredited", status
      FROM "AccountingInvoice"
      WHERE id = ${id} AND "organizationId" = ${organizationId}
      FOR UPDATE
    `;
    if (!locked) throw new NotFoundError("Invoice not found.");
    if (locked.status !== "SENT" && locked.status !== "OVERDUE") {
      throw new InvoiceStateError("Only sent or overdue invoices can receive a payment.");
    }

    const remaining = new Prisma.Decimal(locked.amount).minus(locked.amountPaid).minus(locked.amountCredited);
    if (paymentAmount.greaterThan(remaining)) {
      throw new InvalidPaymentError(`Payment of ${formatMoney(paymentAmount)} exceeds the remaining balance of ${formatMoney(remaining)}.`);
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
      sourceModule: "accounting",
      sourceType: payment ? "ACCOUNTING_RECEIVABLE_PAYMENT" : "INVOICE",
      sourceId: payment?.id ?? invoice.id,
      postingPurpose: payment ? "RECEIVED" : undefined,
      branchId: invoice.branchId,
      lines: [
        { accountId: receivingAccount.id, debit: input.amount },
        { accountId: ar.id, credit: input.amount },
      ],
    });

    const updated = await tx.accountingInvoice.update({
      where: { id },
      data: { amountPaid: { increment: paymentAmount } },
    });

    const isFullyPaid = new Prisma.Decimal(updated.amountPaid).plus(updated.amountCredited).greaterThanOrEqualTo(updated.amount);
    const finalInvoice = isFullyPaid ? await tx.accountingInvoice.update({ where: { id }, data: { status: "PAID", paidAt: input.paymentDate } }) : updated;
    return { invoice: finalInvoice, payment };
  }, { timeout: 20_000 });
}

export async function postProcurementTaxAccrual(organizationId: string, input: { invoiceId: string; invoiceNumber: string; vendorName: string; invoiceDate: Date; taxCodeId?: string | null; taxableAmount: Prisma.Decimal.Value; vatAmount: Prisma.Decimal.Value; nhilAmount: Prisma.Decimal.Value; getfundAmount: Prisma.Decimal.Value; totalAmount: Prisma.Decimal.Value; actorId?: string | null; branchId?: string | null }) {
  const accounts = await ensureDefaultAccounts(organizationId);
  const findAccount = (code: string) => { const account = accounts.find((candidate) => candidate.code === code); if (!account) throw new Error(`Default account ${code} missing.`); return account; };
  const [inventory, inputVat, inputNhil, inputGetfund, payable] = [findAccount("1200"), findAccount("1300"), findAccount("1310"), findAccount("1320"), findAccount("2000")];
  const vatAmount = new Prisma.Decimal(input.vatAmount);
  const nhilAmount = new Prisma.Decimal(input.nhilAmount);
  const getfundAmount = new Prisma.Decimal(input.getfundAmount);
  return db.$transaction(async (tx) => {
    const entry = await postJournalEntry(tx, organizationId, { sourceModule: "procurement", sourceType: "PROCUREMENT_SUPPLIER_INVOICE", sourceId: input.invoiceId, postingPurpose: "APPROVED", branchId: input.branchId, entryDate: input.invoiceDate, description: `Supplier invoice ${input.invoiceNumber}`, createdById: input.actorId, lines: [{ accountId: inventory.id, debit: new Prisma.Decimal(input.taxableAmount).toString() }, ...(vatAmount.isPositive() ? [{ accountId: inputVat.id, debit: vatAmount.toString() }] : []), ...(nhilAmount.isPositive() ? [{ accountId: inputNhil.id, debit: nhilAmount.toString() }] : []), ...(getfundAmount.isPositive() ? [{ accountId: inputGetfund.id, debit: getfundAmount.toString() }] : []), { accountId: payable.id, credit: new Prisma.Decimal(input.totalAmount).toString() }] });
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
        sourceModule: "accounting",
        sourceType: "INVOICE_VOID",
        sourceId: invoice.id,
        branchId: invoice.branchId,
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

// --- Contacts ---

export function listContacts(organizationId: string) {
  return db.accountingContact.findMany({ where: { organizationId }, orderBy: { name: "asc" } });
}

interface ContactInput {
  type: "CUSTOMER" | "SUPPLIER" | "BOTH";
  name: string;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  taxIdentificationNumber?: string | null;
  fleetOwnerId?: string | null;
  procurementVendorId?: string | null;
  crmContactId?: string | null;
  branchId?: string | null;
}

export function createContact(organizationId: string, data: ContactInput, createdById?: string | null) {
  return db.accountingContact.create({ data: { organizationId, createdById, ...data } });
}

export async function updateContact(organizationId: string, id: string, data: ContactInput) {
  const existing = await db.accountingContact.findFirst({ where: { id, organizationId }, select: { id: true } });
  if (!existing) throw new NotFoundError("Contact not found.");
  return db.accountingContact.update({ where: { id }, data });
}

// --- Bills (payables) ---

export class BillStateError extends Error {}

const DEFAULT_BILL_NUMBER_PREFIX = "BILL";

async function generateBillNumber(organizationId: string) {
  const count = await db.accountingBill.count({ where: { organizationId } });
  return `${DEFAULT_BILL_NUMBER_PREFIX}-${String(count + 1).padStart(4, "0")}`;
}

export function listBills(organizationId: string) {
  return db.accountingBill.findMany({
    where: { organizationId },
    include: { taxCode: true, expenseAccount: true, lines: { orderBy: { sortOrder: "asc" } }, payments: { include: { account: true, createdBy: true }, orderBy: [{ paymentDate: "desc" }, { createdAt: "desc" }] } },
    orderBy: { createdAt: "desc" },
  });
}

interface BillInput {
  contactId?: string | null;
  supplierName: string;
  supplierEmail?: string | null;
  description?: string | null;
  expenseAccountId: string;
  lines: LineItemInput[];
  billDate: Date;
  dueDate: Date;
  taxCodeId?: string | null;
  branchId?: string | null;
}

export async function createBill(organizationId: string, data: BillInput, createdById?: string | null) {
  const { lines, taxableAmount } = computeLineItems(data.lines);
  const expenseAccount = await db.accountingAccount.findFirst({ where: { id: data.expenseAccountId, organizationId, type: "EXPENSE" } });
  if (!expenseAccount) throw new NotFoundError("Expense account not found.");
  const tax = await calculateTax(organizationId, taxableAmount, data.taxCodeId, data.billDate);
  return createWithUniqueRetry(async () => {
    const billNumber = await generateBillNumber(organizationId);
    return db.accountingBill.create({
      data: {
        organizationId,
        billNumber,
        createdById,
        branchId: data.branchId,
        contactId: data.contactId,
        supplierName: data.supplierName,
        supplierEmail: data.supplierEmail,
        description: data.description,
        expenseAccountId: expenseAccount.id,
        billDate: data.billDate,
        dueDate: data.dueDate,
        taxCodeId: tax.taxCode?.id,
        taxableAmount: tax.taxableAmount,
        vatAmount: tax.vatAmount,
        nhilAmount: tax.nhilAmount,
        getfundAmount: tax.getfundAmount,
        amount: tax.grossAmount,
        lines: { create: lines.map((line) => ({ description: line.description, quantity: line.quantity, unitPrice: line.unitPrice, lineTotal: line.lineTotal, sortOrder: line.sortOrder })) },
      },
      include: { lines: true },
    });
  });
}

/**
 * Claims the bill (DRAFT -> APPROVED) with a guarded updateMany before
 * posting anything, inside the same transaction, mirroring
 * markInvoiceSent's exact double-post-prevention shape - reversed, since a
 * bill is a payable: Debit the chosen expense account (+ recoverable input
 * tax), Credit Accounts Payable.
 */
export async function approveBill(organizationId: string, id: string, actorId?: string | null) {
  const bill = await db.accountingBill.findFirst({ where: { id, organizationId } });
  if (!bill) throw new NotFoundError("Bill not found.");

  const accounts = await ensureDefaultAccounts(organizationId);
  const findAccount = (code: string) => { const account = accounts.find((candidate) => candidate.code === code); if (!account) throw new Error(`Default account ${code} missing.`); return account; };
  const [payable, inputVat, inputNhil, inputGetfund] = [findAccount("2000"), findAccount("1300"), findAccount("1310"), findAccount("1320")];

  return db.$transaction(async (tx) => {
    const claimed = await tx.accountingBill.updateMany({ where: { id, status: "DRAFT" }, data: { status: "APPROVED" } });
    if (claimed.count === 0) throw new BillStateError("Only draft bills can be approved.");

    await postJournalEntry(tx, organizationId, {
      entryDate: bill.billDate,
      description: `Bill ${bill.billNumber} from ${bill.supplierName}`,
      sourceModule: "accounting",
      sourceType: "ACCOUNTING_BILL",
      sourceId: bill.id,
      postingPurpose: "APPROVED",
      branchId: bill.branchId,
      createdById: actorId,
      lines: [
        { accountId: bill.expenseAccountId, debit: bill.taxableAmount.toString() },
        ...(bill.vatAmount.isPositive() ? [{ accountId: inputVat.id, debit: bill.vatAmount.toString() }] : []),
        ...(bill.nhilAmount.isPositive() ? [{ accountId: inputNhil.id, debit: bill.nhilAmount.toString() }] : []),
        ...(bill.getfundAmount.isPositive() ? [{ accountId: inputGetfund.id, debit: bill.getfundAmount.toString() }] : []),
        { accountId: payable.id, credit: bill.amount.toString() },
      ],
    });
    await tx.accountingTaxTransaction.create({ data: { organizationId, taxCodeId: bill.taxCodeId, direction: "INPUT", transactionDate: bill.billDate, sourceType: "ACCOUNTING_BILL", sourceId: bill.id, documentNumber: bill.billNumber, counterparty: bill.supplierName, taxableAmount: bill.taxableAmount, vatAmount: bill.vatAmount, nhilAmount: bill.nhilAmount, getfundAmount: bill.getfundAmount } });
    return tx.accountingBill.findUniqueOrThrow({ where: { id } });
  });
}

type LockedBillRow = { id: string; amount: Prisma.Decimal | string; amountPaid: Prisma.Decimal | string; status: string };

/**
 * Payable-side counterpart to recordInvoicePayment - same SELECT ... FOR
 * UPDATE row lock and atomic amountPaid increment, reversed posting
 * direction (Debit Accounts Payable / Credit the chosen cash/bank/mobile-
 * money account).
 */
export async function recordBillPayment(organizationId: string, id: string, input: { amount: string; paymentDate: Date; accountId: string; paymentMethod: string; reference?: string | null; notes?: string | null; createdById?: string | null }) {
  const paymentAmount = new Prisma.Decimal(input.amount);
  if (!paymentAmount.isFinite() || paymentAmount.lessThanOrEqualTo(0)) {
    throw new InvalidPaymentError("Payment amount must be a positive number.");
  }

  const bill = await db.accountingBill.findFirst({ where: { id, organizationId } });
  if (!bill) throw new NotFoundError("Bill not found.");
  if (paymentAmount.greaterThan(new Prisma.Decimal(bill.amount).minus(bill.amountPaid))) throw new InvalidPaymentError("Payment exceeds the current outstanding balance.");
  const payable = await getDefaultAccount(organizationId, "2000");

  return db.$transaction(async (tx) => {
    const [locked] = await tx.$queryRaw<LockedBillRow[]>`
      SELECT id, amount, "amountPaid", status
      FROM "AccountingBill"
      WHERE id = ${id} AND "organizationId" = ${organizationId}
      FOR UPDATE
    `;
    if (!locked) throw new NotFoundError("Bill not found.");
    if (locked.status !== "APPROVED" && locked.status !== "PARTIALLY_PAID") {
      throw new BillStateError("Only an approved bill can receive a payment.");
    }

    const remaining = new Prisma.Decimal(locked.amount).minus(locked.amountPaid);
    if (paymentAmount.greaterThan(remaining)) {
      throw new InvalidPaymentError(`Payment of ${formatMoney(paymentAmount)} exceeds the remaining balance of ${formatMoney(remaining)}.`);
    }

    const payingAccount = await tx.accountingAccount.findFirst({ where: { id: input.accountId, organizationId, active: true, liquidityType: { in: ["CASH", "BANK", "MOBILE_MONEY"] } } });
    if (!payingAccount) throw new InvalidPaymentError("Select an active cash, bank, or mobile-money account owned by this organization.");
    if (!input.paymentMethod.trim()) throw new InvalidPaymentError("Payment method is required.");

    const payment = await tx.accountingPayablePayment.create({ data: { organizationId, billId: bill.id, accountId: payingAccount.id, paymentMethod: input.paymentMethod.trim(), amount: paymentAmount, paymentDate: input.paymentDate, reference: input.reference?.trim() || null, notes: input.notes?.trim() || null, createdById: input.createdById } });

    await postJournalEntry(tx, organizationId, {
      entryDate: input.paymentDate,
      description: `Payment made for bill ${bill.billNumber}`,
      sourceModule: "accounting",
      sourceType: "ACCOUNTING_PAYABLE_PAYMENT",
      sourceId: payment.id,
      postingPurpose: "PAID",
      branchId: bill.branchId,
      createdById: input.createdById,
      lines: [
        { accountId: payable.id, debit: input.amount },
        { accountId: payingAccount.id, credit: input.amount },
      ],
    });

    const updated = await tx.accountingBill.update({ where: { id }, data: { amountPaid: { increment: paymentAmount } } });
    const isFullyPaid = new Prisma.Decimal(updated.amountPaid).greaterThanOrEqualTo(updated.amount);
    const finalBill = await tx.accountingBill.update({ where: { id }, data: isFullyPaid ? { status: "PAID", paidAt: input.paymentDate } : { status: "PARTIALLY_PAID" } });
    return { bill: finalBill, payment };
  }, { timeout: 20_000 });
}

/**
 * Voiding an APPROVED bill posts a reversing journal entry (the exact
 * opposite of approveBill's own posting) instead of only flipping the
 * status, mirroring voidInvoice's rationale exactly. A DRAFT bill never had
 * anything posted, so voiding it needs no reversal.
 */
export async function voidBill(organizationId: string, id: string) {
  const bill = await db.accountingBill.findFirst({ where: { id, organizationId } });
  if (!bill) throw new NotFoundError("Bill not found.");
  if (Number(bill.amountPaid) > 0) throw new BillStateError("Cannot void a bill that has already received a payment.");

  const needsReversal = bill.status === "APPROVED";
  const accounts = needsReversal ? await ensureDefaultAccounts(organizationId) : null;

  return db.$transaction(async (tx) => {
    const claimed = await tx.accountingBill.updateMany({ where: { id, status: { in: ["DRAFT", "APPROVED"] } }, data: { status: "VOID" } });
    if (claimed.count === 0) throw new BillStateError("This bill can no longer be voided.");

    if (accounts) {
      const findAccount = (code: string) => { const account = accounts.find((candidate) => candidate.code === code); if (!account) throw new Error(`Default account ${code} missing.`); return account; };
      const [payable, inputVat, inputNhil, inputGetfund] = [findAccount("2000"), findAccount("1300"), findAccount("1310"), findAccount("1320")];
      await postJournalEntry(tx, organizationId, {
        entryDate: new Date(),
        description: `Void of bill ${bill.billNumber} (reversal)`,
        sourceModule: "accounting",
        sourceType: "ACCOUNTING_BILL_VOID",
        sourceId: bill.id,
        branchId: bill.branchId,
        lines: [
          { accountId: payable.id, debit: bill.amount.toString() },
          { accountId: bill.expenseAccountId, credit: bill.taxableAmount.toString() },
          ...(bill.vatAmount.isPositive() ? [{ accountId: inputVat.id, credit: bill.vatAmount.toString() }] : []),
          ...(bill.nhilAmount.isPositive() ? [{ accountId: inputNhil.id, credit: bill.nhilAmount.toString() }] : []),
          ...(bill.getfundAmount.isPositive() ? [{ accountId: inputGetfund.id, credit: bill.getfundAmount.toString() }] : []),
        ],
      });
      await tx.accountingTaxTransaction.create({ data: { organizationId, taxCodeId: bill.taxCodeId, direction: "ADJUSTMENT", transactionDate: new Date(), sourceType: "ACCOUNTING_BILL_VOID", sourceId: bill.id, documentNumber: bill.billNumber, counterparty: bill.supplierName, taxableAmount: bill.taxableAmount.negated(), vatAmount: bill.vatAmount.negated(), nhilAmount: bill.nhilAmount.negated(), getfundAmount: bill.getfundAmount.negated(), notes: "Bill voided" } });
    }

    return tx.accountingBill.findUniqueOrThrow({ where: { id } });
  });
}

// --- Credit notes ---

export class CreditNoteStateError extends Error {}

const DEFAULT_CREDIT_NOTE_NUMBER_PREFIX = "CN";

async function generateCreditNoteNumber(organizationId: string) {
  const count = await db.accountingCreditNote.count({ where: { organizationId } });
  return `${DEFAULT_CREDIT_NOTE_NUMBER_PREFIX}-${String(count + 1).padStart(4, "0")}`;
}

export function listCreditNotes(organizationId: string) {
  return db.accountingCreditNote.findMany({
    where: { organizationId },
    include: { taxCode: true, lines: { orderBy: { sortOrder: "asc" } }, invoice: { select: { id: true, invoiceNumber: true } } },
    orderBy: { createdAt: "desc" },
  });
}

interface CreditNoteInput {
  contactId?: string | null;
  customerName: string;
  customerEmail?: string | null;
  description?: string | null;
  lines: LineItemInput[];
  issueDate: Date;
  taxCodeId?: string | null;
  branchId?: string | null;
}

export async function createCreditNote(organizationId: string, data: CreditNoteInput, createdById?: string | null) {
  const { lines, taxableAmount } = computeLineItems(data.lines);
  const tax = await calculateTax(organizationId, taxableAmount, data.taxCodeId, data.issueDate);
  return createWithUniqueRetry(async () => {
    const creditNoteNumber = await generateCreditNoteNumber(organizationId);
    return db.accountingCreditNote.create({
      data: {
        organizationId,
        creditNoteNumber,
        createdById,
        branchId: data.branchId,
        contactId: data.contactId,
        customerName: data.customerName,
        customerEmail: data.customerEmail,
        description: data.description,
        issueDate: data.issueDate,
        taxCodeId: tax.taxCode?.id,
        taxableAmount: tax.taxableAmount,
        vatAmount: tax.vatAmount,
        nhilAmount: tax.nhilAmount,
        getfundAmount: tax.getfundAmount,
        amount: tax.grossAmount,
        lines: { create: lines.map((line) => ({ description: line.description, quantity: line.quantity, unitPrice: line.unitPrice, lineTotal: line.lineTotal, sortOrder: line.sortOrder })) },
      },
      include: { lines: true },
    });
  });
}

/**
 * Reduces one specific invoice's outstanding balance: Debit Revenue (+
 * reverse the tax payable lines) / Credit Accounts Receivable - exactly
 * voidInvoice's reversal shape, but for a partial (credit-note-sized)
 * amount rather than the whole invoice. Also increments the invoice's own
 * amountCredited so recordInvoicePayment/getReceivablesSummary see the
 * reduced balance immediately without a join back to credit notes.
 */
export async function applyCreditNoteToInvoice(organizationId: string, creditNoteId: string, invoiceId: string, actorId?: string | null) {
  const [creditNote, invoice] = await Promise.all([
    db.accountingCreditNote.findFirst({ where: { id: creditNoteId, organizationId } }),
    db.accountingInvoice.findFirst({ where: { id: invoiceId, organizationId } }),
  ]);
  if (!creditNote) throw new NotFoundError("Credit note not found.");
  if (!invoice) throw new NotFoundError("Invoice not found.");
  if (creditNote.status !== "DRAFT") throw new CreditNoteStateError("Only a draft credit note can be applied.");
  if (invoice.status !== "SENT" && invoice.status !== "OVERDUE") throw new CreditNoteStateError("Credit notes can only be applied to a sent or overdue invoice.");
  const outstanding = new Prisma.Decimal(invoice.amount).minus(invoice.amountPaid).minus(invoice.amountCredited);
  if (new Prisma.Decimal(creditNote.amount).greaterThan(outstanding)) {
    throw new CreditNoteStateError(`Credit note of ${formatMoney(creditNote.amount)} exceeds the invoice's outstanding balance of ${formatMoney(outstanding)}.`);
  }

  const accounts = await ensureDefaultAccounts(organizationId);
  const findAccount = (code: string) => { const account = accounts.find((candidate) => candidate.code === code); if (!account) throw new Error(`Default account ${code} missing.`); return account; };
  const [ar, revenue, vatPayable, nhilPayable, getfundPayable] = [findAccount("1100"), findAccount("4000"), findAccount("2100"), findAccount("2110"), findAccount("2120")];

  return db.$transaction(async (tx) => {
    const claimed = await tx.accountingCreditNote.updateMany({ where: { id: creditNoteId, status: "DRAFT" }, data: { status: "APPLIED", invoiceId, settledAt: new Date() } });
    if (claimed.count === 0) throw new CreditNoteStateError("This credit note can no longer be applied.");

    await postJournalEntry(tx, organizationId, {
      entryDate: new Date(),
      description: `Credit note ${creditNote.creditNoteNumber} applied to invoice ${invoice.invoiceNumber}`,
      sourceModule: "accounting",
      sourceType: "ACCOUNTING_CREDIT_NOTE",
      sourceId: creditNote.id,
      postingPurpose: "APPLIED",
      branchId: invoice.branchId,
      createdById: actorId,
      lines: [
        { accountId: revenue.id, debit: creditNote.taxableAmount.toString() },
        ...(creditNote.vatAmount.isPositive() ? [{ accountId: vatPayable.id, debit: creditNote.vatAmount.toString() }] : []),
        ...(creditNote.nhilAmount.isPositive() ? [{ accountId: nhilPayable.id, debit: creditNote.nhilAmount.toString() }] : []),
        ...(creditNote.getfundAmount.isPositive() ? [{ accountId: getfundPayable.id, debit: creditNote.getfundAmount.toString() }] : []),
        { accountId: ar.id, credit: creditNote.amount.toString() },
      ],
    });

    const updatedInvoice = await tx.accountingInvoice.update({ where: { id: invoiceId }, data: { amountCredited: { increment: creditNote.amount } } });
    const isFullyPaid = new Prisma.Decimal(updatedInvoice.amountPaid).plus(updatedInvoice.amountCredited).greaterThanOrEqualTo(updatedInvoice.amount);
    if (isFullyPaid) await tx.accountingInvoice.update({ where: { id: invoiceId }, data: { status: "PAID", paidAt: new Date() } });

    return tx.accountingCreditNote.findUniqueOrThrow({ where: { id: creditNoteId } });
  });
}

/**
 * Settles a credit note with real cash leaving the business instead of
 * reducing a specific invoice's balance: Debit Revenue (+ reverse the tax
 * payable lines) / Credit the chosen cash/bank/mobile-money account.
 */
export async function refundCreditNote(organizationId: string, creditNoteId: string, accountId: string, actorId?: string | null) {
  const creditNote = await db.accountingCreditNote.findFirst({ where: { id: creditNoteId, organizationId } });
  if (!creditNote) throw new NotFoundError("Credit note not found.");
  if (creditNote.status !== "DRAFT") throw new CreditNoteStateError("Only a draft credit note can be refunded.");

  const [accounts, refundAccount] = await Promise.all([
    ensureDefaultAccounts(organizationId),
    db.accountingAccount.findFirst({ where: { id: accountId, organizationId, active: true, liquidityType: { in: ["CASH", "BANK", "MOBILE_MONEY"] } } }),
  ]);
  if (!refundAccount) throw new InvalidPaymentError("Select an active cash, bank, or mobile-money account owned by this organization.");
  const findAccount = (code: string) => { const account = accounts.find((candidate) => candidate.code === code); if (!account) throw new Error(`Default account ${code} missing.`); return account; };
  const [revenue, vatPayable, nhilPayable, getfundPayable] = [findAccount("4000"), findAccount("2100"), findAccount("2110"), findAccount("2120")];

  return db.$transaction(async (tx) => {
    const claimed = await tx.accountingCreditNote.updateMany({ where: { id: creditNoteId, status: "DRAFT" }, data: { status: "REFUNDED", settledAt: new Date() } });
    if (claimed.count === 0) throw new CreditNoteStateError("This credit note can no longer be refunded.");

    await postJournalEntry(tx, organizationId, {
      entryDate: new Date(),
      description: `Credit note ${creditNote.creditNoteNumber} refunded to ${creditNote.customerName}`,
      sourceModule: "accounting",
      sourceType: "ACCOUNTING_CREDIT_NOTE",
      sourceId: creditNote.id,
      postingPurpose: "REFUNDED",
      branchId: creditNote.branchId,
      createdById: actorId,
      lines: [
        { accountId: revenue.id, debit: creditNote.taxableAmount.toString() },
        ...(creditNote.vatAmount.isPositive() ? [{ accountId: vatPayable.id, debit: creditNote.vatAmount.toString() }] : []),
        ...(creditNote.nhilAmount.isPositive() ? [{ accountId: nhilPayable.id, debit: creditNote.nhilAmount.toString() }] : []),
        ...(creditNote.getfundAmount.isPositive() ? [{ accountId: getfundPayable.id, debit: creditNote.getfundAmount.toString() }] : []),
        { accountId: refundAccount.id, credit: creditNote.amount.toString() },
      ],
    });

    return tx.accountingCreditNote.findUniqueOrThrow({ where: { id: creditNoteId } });
  });
}

export async function voidCreditNote(organizationId: string, id: string) {
  const updated = await db.accountingCreditNote.updateMany({ where: { id, organizationId, status: "DRAFT" }, data: { status: "VOID" } });
  if (updated.count === 0) {
    const exists = await db.accountingCreditNote.findFirst({ where: { id, organizationId } });
    if (!exists) throw new NotFoundError("Credit note not found.");
    throw new CreditNoteStateError("Only a draft credit note can be voided.");
  }
  return db.accountingCreditNote.findUniqueOrThrow({ where: { id } });
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
      sourceModule: "accounting",
      sourceType: "EXPENSE",
      sourceId: expense.id,
      branchId: expense.branchId,
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
        sourceModule: "accounting",
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
      throw new InvalidPaymentError(`Expense of ${formatMoney(amount)} exceeds the fund's available balance of ${formatMoney(balance)}.`);
    }

    const entry = await postJournalEntry(tx, organizationId, {
      entryDate: data.expenseDate ?? new Date(),
      description: `Petty cash expense: ${data.description}`,
      sourceModule: "accounting",
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
      sourceModule: "accounting",
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
        sourceModule: "accounting",
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

export interface AccountingOverviewTrends {
  trends: Record<TrendGranularity, { label: string; invoiced: number; expenses: number; netIncome: number }[]>;
  invoiceStatusBreakdown: { label: string; value: number }[];
  recentInvoices: { id: string; invoiceNumber: string; customerName: string; amount: number; status: string; issueDate: Date }[];
  overdueInvoices: { id: string; invoiceNumber: string; customerName: string; amountDue: number; dueDate: Date }[];
}

/**
 * Backs the Accounting overview page's tabbed trends card - real invoice/
 * expense data, not sample figures. Deliberately not named
 * "getAccountingInsights" - that name already belongs to
 * src/modules/accounting/insights.ts's period-driven, AI-assistant-backed
 * Accounting Insights page (/app/accounting/insights), a separate, richer
 * surface this function has no relation to. Fetches once against the widest
 * lookback window, then buckets that data three ways (days/weeks/months) so
 * switching granularity client-side needs no extra round trip.
 */
export async function getAccountingOverviewTrends(organizationId: string): Promise<AccountingOverviewTrends> {
  const lookback = widestTrendLookback();

  const [invoiceRows, expenseRows, statusGroups, recentInvoices, overdueInvoiceRows] = await Promise.all([
    db.accountingInvoice.findMany({ where: { organizationId, issueDate: { gte: lookback } }, select: { issueDate: true, amount: true } }),
    db.accountingExpense.findMany({ where: { organizationId, expenseDate: { gte: lookback } }, select: { expenseDate: true, amount: true } }),
    db.accountingInvoice.groupBy({ by: ["status"], where: { organizationId }, _count: { _all: true } }),
    db.accountingInvoice.findMany({ where: { organizationId }, orderBy: { issueDate: "desc" }, take: 5, select: { id: true, invoiceNumber: true, customerName: true, amount: true, status: true, issueDate: true } }),
    db.accountingInvoice.findMany({ where: { organizationId, status: "OVERDUE" }, orderBy: { dueDate: "asc" }, take: 5, select: { id: true, invoiceNumber: true, customerName: true, amount: true, amountPaid: true, dueDate: true } }),
  ]);

  const invoicedBetween = (start: Date, end: Date) =>
    invoiceRows.filter((i) => i.issueDate >= start && i.issueDate < end).reduce((sum, i) => sum + Number(i.amount), 0);
  const expensesBetween = (start: Date, end: Date) =>
    expenseRows.filter((e) => e.expenseDate >= start && e.expenseDate < end).reduce((sum, e) => sum + Number(e.amount), 0);

  const buildSeries = (granularity: TrendGranularity) =>
    buildTrendBuckets(granularity).map((bucket) => {
      const invoiced = invoicedBetween(bucket.start, bucket.end);
      const expenses = expensesBetween(bucket.start, bucket.end);
      return { label: bucket.label, invoiced, expenses, netIncome: invoiced - expenses };
    });

  const invoiceStatusBreakdown = statusGroups
    .map((group) => ({ label: group.status, value: group._count._all }))
    .filter((entry) => entry.value > 0);

  return {
    trends: { days: buildSeries("days"), weeks: buildSeries("weeks"), months: buildSeries("months") },
    invoiceStatusBreakdown,
    recentInvoices: recentInvoices.map((invoice) => ({ ...invoice, amount: Number(invoice.amount) })),
    overdueInvoices: overdueInvoiceRows.map((invoice) => ({
      id: invoice.id,
      invoiceNumber: invoice.invoiceNumber,
      customerName: invoice.customerName,
      amountDue: Number(invoice.amount) - Number(invoice.amountPaid),
      dueDate: invoice.dueDate,
    })),
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

// --- Reporting: trial balance, general ledger, ageing, cash flow, COA templates ---

export interface TrialBalanceRow {
  account: { id: string; code: string; name: string; type: AccountingAccountType };
  debit: number;
  credit: number;
}

/**
 * Every account's raw (debit total - credit total) as of a date, shown in
 * whichever column the sign naturally falls on - not normalized by account
 * type. Because every journal entry balances on its own, the sum of every
 * account's raw net position balances too: sum(debit column) always equals
 * sum(credit column), which is the whole point of a trial balance. Zero-
 * balance accounts are omitted, matching how a real trial balance is
 * normally presented.
 */
export async function getTrialBalance(organizationId: string, asOfDate: Date = new Date()): Promise<{ asOfDate: Date; rows: TrialBalanceRow[]; totalDebit: number; totalCredit: number }> {
  await ensureDefaultAccounts(organizationId);
  const accounts = await db.accountingAccount.findMany({
    where: { organizationId },
    include: { journalLines: { where: { journalEntry: { entryDate: { lte: asOfDate }, status: { notIn: NON_POSTED_JOURNAL_STATUSES } } }, select: { debit: true, credit: true } } },
    orderBy: { code: "asc" },
  });

  const rows: TrialBalanceRow[] = [];
  let totalDebit = new Prisma.Decimal(0);
  let totalCredit = new Prisma.Decimal(0);
  for (const account of accounts) {
    const accDebit = account.journalLines.reduce((sum, line) => sum.plus(line.debit), new Prisma.Decimal(0));
    const accCredit = account.journalLines.reduce((sum, line) => sum.plus(line.credit), new Prisma.Decimal(0));
    const net = accDebit.minus(accCredit);
    if (net.isZero()) continue;
    const debit = net.isPositive() ? net : new Prisma.Decimal(0);
    const credit = net.isNegative() ? net.negated() : new Prisma.Decimal(0);
    rows.push({ account: { id: account.id, code: account.code, name: account.name, type: account.type }, debit: debit.toNumber(), credit: credit.toNumber() });
    totalDebit = totalDebit.plus(debit);
    totalCredit = totalCredit.plus(credit);
  }

  return { asOfDate, rows, totalDebit: totalDebit.toNumber(), totalCredit: totalCredit.toNumber() };
}

export interface GeneralLedgerLine {
  id: string;
  entryDate: Date;
  description: string;
  reference: string | null;
  postingNumber: string;
  sourceModule: string | null;
  debit: number;
  credit: number;
  runningBalance: number;
}

/** One row per account, for the General Ledger's index page. Reuses listAccounts's own balance computation. */
export function getGeneralLedgerAccounts(organizationId: string) {
  return listAccounts(organizationId);
}

export async function getGeneralLedgerForAccount(organizationId: string, accountId: string): Promise<{ account: { id: string; code: string; name: string; type: AccountingAccountType }; lines: GeneralLedgerLine[] }> {
  const account = await db.accountingAccount.findFirst({ where: { id: accountId, organizationId } });
  if (!account) throw new NotFoundError("Account not found.");

  const journalLines = await db.accountingJournalLine.findMany({
    where: { accountId, journalEntry: { organizationId, status: { notIn: NON_POSTED_JOURNAL_STATUSES } } },
    include: { journalEntry: { select: { entryDate: true, description: true, reference: true, postingNumber: true, sourceModule: true, createdAt: true } } },
    orderBy: [{ journalEntry: { entryDate: "asc" } }, { journalEntry: { createdAt: "asc" } }],
  });

  const isDebitNormal = account.type === "ASSET" || account.type === "EXPENSE";
  let running = new Prisma.Decimal(0);
  const lines: GeneralLedgerLine[] = journalLines.map((line) => {
    const delta = isDebitNormal ? new Prisma.Decimal(line.debit).minus(line.credit) : new Prisma.Decimal(line.credit).minus(line.debit);
    running = running.plus(delta);
    return {
      id: line.id,
      entryDate: line.journalEntry.entryDate,
      description: line.journalEntry.description,
      reference: line.journalEntry.reference,
      postingNumber: line.journalEntry.postingNumber,
      sourceModule: line.journalEntry.sourceModule,
      debit: Number(line.debit),
      credit: Number(line.credit),
      runningBalance: running.toNumber(),
    };
  });

  return { account: { id: account.id, code: account.code, name: account.name, type: account.type }, lines };
}

export interface AgeingBucket {
  current: number;
  days30: number;
  days60: number;
  days90: number;
  over90: number;
}

function bucketByAge(dueDate: Date, outstanding: number, asOf: Date): AgeingBucket {
  const bucket: AgeingBucket = { current: 0, days30: 0, days60: 0, days90: 0, over90: 0 };
  if (outstanding <= 0.004) return bucket;
  const daysOverdue = Math.floor((asOf.getTime() - dueDate.getTime()) / 86_400_000);
  if (daysOverdue <= 0) bucket.current = outstanding;
  else if (daysOverdue <= 30) bucket.days30 = outstanding;
  else if (daysOverdue <= 60) bucket.days60 = outstanding;
  else if (daysOverdue <= 90) bucket.days90 = outstanding;
  else bucket.over90 = outstanding;
  return bucket;
}

function sumAgeingBuckets<T extends AgeingBucket>(rows: T[]): AgeingBucket & { outstanding: number } {
  return rows.reduce(
    (sum, row) => ({
      current: sum.current + row.current,
      days30: sum.days30 + row.days30,
      days60: sum.days60 + row.days60,
      days90: sum.days90 + row.days90,
      over90: sum.over90 + row.over90,
      outstanding: sum.outstanding + row.current + row.days30 + row.days60 + row.days90 + row.over90,
    }),
    { current: 0, days30: 0, days60: 0, days90: 0, over90: 0, outstanding: 0 },
  );
}

export interface ReceivablesAgeingRow extends AgeingBucket {
  invoiceId: string;
  invoiceNumber: string;
  customerName: string;
  dueDate: Date;
  outstanding: number;
}

/** Real 0-30/31-60/61-90/90+ day buckets, replacing the binary current/overdue flag every other receivables view still uses. */
export async function getReceivablesAgeing(organizationId: string, asOf: Date = new Date()) {
  const invoices = await db.accountingInvoice.findMany({ where: { organizationId, status: { in: ["SENT", "OVERDUE"] } } });
  const rows: ReceivablesAgeingRow[] = invoices
    .map((invoice) => {
      const outstanding = Number(invoice.amount) - Number(invoice.amountPaid) - Number(invoice.amountCredited);
      return { invoiceId: invoice.id, invoiceNumber: invoice.invoiceNumber, customerName: invoice.customerName, dueDate: invoice.dueDate, outstanding, ...bucketByAge(invoice.dueDate, outstanding, asOf) };
    })
    .filter((row) => row.outstanding > 0.004)
    .sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime());
  return { asOf, rows, totals: sumAgeingBuckets(rows) };
}

export interface PayablesAgeingRow extends AgeingBucket {
  source: "Bill" | "Supplier invoice";
  id: string;
  reference: string;
  counterparty: string;
  dueDate: Date;
  outstanding: number;
}

/** Reads both AccountingBill and Procurement's own ProcurementSupplierInvoice, through Procurement's own listSupplierInvoices() rather than querying its table directly, so an org's true payable position is complete regardless of which flow created the bill. */
export async function getPayablesAgeing(organizationId: string, asOf: Date = new Date()) {
  const [bills, supplierInvoices] = await Promise.all([
    db.accountingBill.findMany({ where: { organizationId, status: { in: ["APPROVED", "PARTIALLY_PAID"] } } }),
    listSupplierInvoices(organizationId),
  ]);

  const billRows: PayablesAgeingRow[] = bills.map((bill) => {
    const outstanding = Number(bill.amount) - Number(bill.amountPaid);
    return { source: "Bill", id: bill.id, reference: bill.billNumber, counterparty: bill.supplierName, dueDate: bill.dueDate, outstanding, ...bucketByAge(bill.dueDate, outstanding, asOf) };
  });
  const supplierRows: PayablesAgeingRow[] = supplierInvoices
    .filter((invoice) => invoice.status === "APPROVED" || invoice.status === "PARTIALLY_PAID")
    .map((invoice) => {
      const outstanding = Number(invoice.totalAmount) - Number(invoice.amountPaid);
      const dueDate = invoice.dueDate ?? invoice.invoiceDate;
      return { source: "Supplier invoice", id: invoice.id, reference: invoice.invoiceNumber, counterparty: invoice.vendor.name, dueDate, outstanding, ...bucketByAge(dueDate, outstanding, asOf) };
    });

  const rows = [...billRows, ...supplierRows].filter((row) => row.outstanding > 0.004).sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime());
  return { asOf, rows, totals: sumAgeingBuckets(rows) };
}

/**
 * Direct-method cash-flow statement: every journal line posted against a
 * CASH/BANK/MOBILE_MONEY-liquidity account within the period, categorized
 * Operating/Investing/Financing by its journal entry's sourceType.
 * classifyCashFlowSourceType is the one place a future fixed-asset or loan
 * module registers its own INVESTING/FINANCING source types - every source
 * type in this codebase today is legitimately Operating (no fixed-asset or
 * loan module exists yet), so that is the correct default, not a
 * placeholder bug. openingCash + netChange is guaranteed to equal
 * closingCash by construction, since both are computed from the same
 * underlying line set split only by date.
 */
function classifyCashFlowSourceType(sourceType: string | null): "OPERATING" | "INVESTING" | "FINANCING" {
  void sourceType;
  return "OPERATING";
}

export async function getCashFlowStatement(organizationId: string, from: Date, to: Date) {
  const liquidityAccounts = await db.accountingAccount.findMany({ where: { organizationId, liquidityType: { not: "NONE" } }, select: { id: true } });
  const accountIds = liquidityAccounts.map((account) => account.id);

  const [periodLines, priorLines] = await Promise.all([
    db.accountingJournalLine.findMany({
      where: { accountId: { in: accountIds }, journalEntry: { entryDate: { gte: from, lte: to }, status: { notIn: NON_POSTED_JOURNAL_STATUSES } } },
      include: { journalEntry: { select: { sourceType: true } } },
    }),
    db.accountingJournalLine.findMany({
      where: { accountId: { in: accountIds }, journalEntry: { entryDate: { lt: from }, status: { notIn: NON_POSTED_JOURNAL_STATUSES } } },
      select: { debit: true, credit: true },
    }),
  ]);

  const openingCash = priorLines.reduce((sum, line) => sum.plus(line.debit).minus(line.credit), new Prisma.Decimal(0));
  const byCategory = { OPERATING: new Prisma.Decimal(0), INVESTING: new Prisma.Decimal(0), FINANCING: new Prisma.Decimal(0) };
  for (const line of periodLines) {
    const net = new Prisma.Decimal(line.debit).minus(line.credit);
    const category = classifyCashFlowSourceType(line.journalEntry.sourceType);
    byCategory[category] = byCategory[category].plus(net);
  }
  const netChange = byCategory.OPERATING.plus(byCategory.INVESTING).plus(byCategory.FINANCING);
  const closingCash = openingCash.plus(netChange);

  return {
    from,
    to,
    operating: byCategory.OPERATING.toNumber(),
    investing: byCategory.INVESTING.toNumber(),
    financing: byCategory.FINANCING.toNumber(),
    netChange: netChange.toNumber(),
    openingCash: openingCash.toNumber(),
    closingCash: closingCash.toNumber(),
  };
}

/**
 * Additional Ghana SME chart-of-accounts entries beyond the 12 system
 * accounts ensureDefaultAccounts() already creates for every organization -
 * deliberately non-overlapping with those codes, since the system accounts
 * already cover Cash/AR/AP/tax-payable/Revenue with the exact names this
 * app's own posting logic depends on. Not `isSystem` - these are ordinary,
 * editable/deletable accounts, just a convenient starting point.
 */
const GHANA_SME_CHART_TEMPLATE: { code: string; name: string; type: AccountingAccountType }[] = [
  { code: "1010", name: "Bank Account - GHS", type: "ASSET" },
  { code: "1020", name: "Mobile Money", type: "ASSET" },
  { code: "1400", name: "Prepaid Expenses", type: "ASSET" },
  { code: "1500", name: "Property, Plant and Equipment", type: "ASSET" },
  { code: "1510", name: "Accumulated Depreciation", type: "ASSET" },
  { code: "2200", name: "Withholding Tax Payable", type: "LIABILITY" },
  { code: "2300", name: "Salaries Payable", type: "LIABILITY" },
  { code: "2400", name: "Short-Term Loans", type: "LIABILITY" },
  { code: "3000", name: "Owner's Capital", type: "EQUITY" },
  { code: "3100", name: "Retained Earnings", type: "EQUITY" },
  { code: "3200", name: "Drawings", type: "EQUITY" },
  { code: "4900", name: "Other Income", type: "REVENUE" },
  { code: "5100", name: "Salaries and Wages", type: "EXPENSE" },
  { code: "5200", name: "Rent Expense", type: "EXPENSE" },
  { code: "5300", name: "Utilities Expense", type: "EXPENSE" },
  { code: "5400", name: "Fuel and Transport", type: "EXPENSE" },
  { code: "5500", name: "Communication Expense", type: "EXPENSE" },
  { code: "5600", name: "Bank Charges and Fees", type: "EXPENSE" },
  { code: "5700", name: "Repairs and Maintenance", type: "EXPENSE" },
  { code: "5800", name: "Depreciation Expense", type: "EXPENSE" },
  { code: "5900", name: "General and Administrative Expenses", type: "EXPENSE" },
];

/**
 * Idempotent by design: upserts by code, skipping anything already present
 * (the org's own system accounts, or a previous load of this same
 * template) - re-running it twice creates nothing extra the second time.
 */
export async function loadGhanaSmeChartOfAccounts(organizationId: string) {
  await ensureDefaultAccounts(organizationId);
  const existing = await db.accountingAccount.findMany({ where: { organizationId }, select: { code: true } });
  const existingCodes = new Set(existing.map((account) => account.code));
  const missing = GHANA_SME_CHART_TEMPLATE.filter((account) => !existingCodes.has(account.code));
  if (missing.length > 0) {
    await db.accountingAccount.createMany({ data: missing.map((account) => ({ organizationId, ...account, isSystem: false })), skipDuplicates: true });
  }
  return { addedCount: missing.length };
}

export interface AccountImportRow {
  code: string;
  name: string;
  type: AccountingAccountType;
  liquidityType?: AccountingLiquidityType;
}

/** Bulk chart-of-accounts import via CSV. Reuses the same organizationId+code
 * unique constraint loadGhanaSmeChartOfAccounts() already relies on: a row
 * whose code already exists for this organization is skipped, not duplicated. */
export async function importAccountsFromCsv(organizationId: string, rows: AccountImportRow[]) {
  if (rows.length === 0) return { importedCount: 0, skippedCount: 0 };
  const result = await db.accountingAccount.createMany({
    data: rows.map((row) => ({ organizationId, code: row.code, name: row.name, type: row.type, liquidityType: row.liquidityType ?? "NONE", isSystem: false })),
    skipDuplicates: true,
  });
  return { importedCount: result.count, skippedCount: rows.length - result.count };
}

export interface ContactImportRow {
  type: "CUSTOMER" | "SUPPLIER" | "BOTH";
  name: string;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  taxIdentificationNumber?: string | null;
}

/**
 * Bulk contact import via CSV. AccountingContact has no unique business key
 * today, so duplicate detection is application-level rather than a database
 * constraint: a row whose normalized email already belongs to an existing
 * contact - or to an earlier row in the same file - is skipped instead of
 * creating a second contact for the same address. A row with no email is
 * always created; there is no reliable key to dedupe it by.
 */
export async function importContactsFromCsv(organizationId: string, rows: ContactImportRow[], createdById?: string | null) {
  if (rows.length === 0) return { importedCount: 0, skippedCount: 0 };
  const existing = await db.accountingContact.findMany({ where: { organizationId, email: { not: null } }, select: { email: true } });
  const seenEmails = new Set(existing.map((contact) => contact.email!.trim().toLowerCase()));
  const toCreate: ContactImportRow[] = [];
  for (const row of rows) {
    const normalized = row.email?.trim().toLowerCase();
    if (normalized) {
      if (seenEmails.has(normalized)) continue;
      seenEmails.add(normalized);
    }
    toCreate.push(row);
  }
  if (toCreate.length > 0) {
    await db.accountingContact.createMany({
      data: toCreate.map((row) => ({ organizationId, createdById, type: row.type, name: row.name, email: row.email ?? null, phone: row.phone ?? null, address: row.address ?? null, taxIdentificationNumber: row.taxIdentificationNumber ?? null })),
    });
  }
  return { importedCount: toCreate.length, skippedCount: rows.length - toCreate.length };
}

// --- Attachments ---

/**
 * One generic attachment model covering every Accounting document type
 * (JOURNAL_ENTRY | INVOICE | BILL | CREDIT_NOTE | EXPENSE), mirroring
 * FleetMaintenanceAttachment's proven shape and storage pattern exactly - a
 * FileAsset row holding the file as a data URI, with a thin join record on
 * top. entityType/entityId is a plain polymorphic reference (not a Prisma
 * relation) since it can point at five different tables.
 */
export function listAccountingAttachments(organizationId: string, entityType: AccountingAttachmentEntityType, entityId: string) {
  return db.accountingAttachment.findMany({ where: { organizationId, entityType, entityId }, include: { fileAsset: true, uploadedBy: true }, orderBy: { createdAt: "desc" } });
}

/** One query for every attachment of a given type, for a list page that shows
 * many entities at once (e.g. every Bill) - avoids an N+1 lookup per row. */
export function listAccountingAttachmentsByType(organizationId: string, entityType: AccountingAttachmentEntityType) {
  return db.accountingAttachment.findMany({ where: { organizationId, entityType }, include: { fileAsset: true, uploadedBy: true }, orderBy: { createdAt: "desc" } });
}

export async function createAccountingAttachment(
  organizationId: string,
  data: {
    entityType: AccountingAttachmentEntityType;
    entityId: string;
    fileName: string;
    mimeType: string;
    size: number;
    dataUrl: string;
    caption?: string | null;
    uploadedById?: string | null;
    branchId?: string | null;
  },
) {
  return db.$transaction(async (tx) => {
    const asset = await tx.fileAsset.create({
      data: {
        organizationId,
        branchId: data.branchId,
        uploadedById: data.uploadedById,
        fileName: data.fileName,
        mimeType: data.mimeType,
        size: data.size,
        storagePath: `database://accounting/${data.entityType.toLowerCase()}`,
        url: data.dataUrl,
        metadata: { purpose: "accounting-attachment", entityType: data.entityType, entityId: data.entityId },
      },
    });
    return tx.accountingAttachment.create({
      data: { organizationId, entityType: data.entityType, entityId: data.entityId, fileAssetId: asset.id, caption: data.caption, uploadedById: data.uploadedById },
    });
  });
}

export async function deleteAccountingAttachment(organizationId: string, id: string) {
  const result = await db.accountingAttachment.deleteMany({ where: { id, organizationId } });
  if (result.count === 0) throw new NotFoundError("Attachment not found.");
}

// --- Recurring transactions ---

export class RecurringTemplateError extends Error {}

interface RecurringJournalPayload {
  description: string;
  reference?: string | null;
  lines: { accountId: string; debit?: string; credit?: string }[];
}

interface RecurringInvoicePayload {
  contactId?: string | null;
  customerName: string;
  customerEmail?: string | null;
  description?: string | null;
  lines: LineItemInput[];
  taxCodeId?: string | null;
  dueInDays: number;
}

interface RecurringBillPayload {
  contactId?: string | null;
  supplierName: string;
  supplierEmail?: string | null;
  description?: string | null;
  expenseAccountId: string;
  lines: LineItemInput[];
  taxCodeId?: string | null;
  branchId?: string | null;
  dueInDays: number;
}

export type RecurringTemplatePayload =
  | ({ type: "JOURNAL_ENTRY" } & RecurringJournalPayload)
  | ({ type: "INVOICE" } & RecurringInvoicePayload)
  | ({ type: "BILL" } & RecurringBillPayload);

function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function advanceByFrequency(date: Date, frequency: AccountingRecurringFrequency): Date {
  const next = new Date(date);
  switch (frequency) {
    case "WEEKLY": next.setUTCDate(next.getUTCDate() + 7); break;
    case "MONTHLY": next.setUTCMonth(next.getUTCMonth() + 1); break;
    case "QUARTERLY": next.setUTCMonth(next.getUTCMonth() + 3); break;
    case "YEARLY": next.setUTCFullYear(next.getUTCFullYear() + 1); break;
  }
  return next;
}

type RecurringTemplateRecord = Awaited<ReturnType<typeof db.accountingRecurringTemplate.findFirstOrThrow>>;

/**
 * The single generation path both the cron sweep and the manual "run now" action
 * call, so the two are guaranteed to produce the same result. entryDate/issueDate/
 * billDate always comes from the template's own nextRunDate, never "today" - a
 * catch-up run for a template that fell behind still books on the date it was due,
 * not the date someone happened to click the button.
 */
async function generateFromTemplate(template: RecurringTemplateRecord) {
  const payload = template.payload as unknown as RecurringTemplatePayload;
  if (payload.type !== template.type) throw new RecurringTemplateError("Recurring template payload does not match its declared type.");
  switch (payload.type) {
    case "JOURNAL_ENTRY":
      return createManualJournalEntry(template.organizationId, {
        entryDate: template.nextRunDate,
        description: payload.description,
        reference: payload.reference,
        createdById: template.createdById,
        lines: payload.lines,
      });
    case "INVOICE":
      return createInvoice(template.organizationId, {
        contactId: payload.contactId,
        customerName: payload.customerName,
        customerEmail: payload.customerEmail,
        description: payload.description,
        lines: payload.lines,
        issueDate: template.nextRunDate,
        dueDate: addDays(template.nextRunDate, payload.dueInDays),
        taxCodeId: payload.taxCodeId,
      }, template.createdById);
    case "BILL":
      return createBill(template.organizationId, {
        contactId: payload.contactId,
        supplierName: payload.supplierName,
        supplierEmail: payload.supplierEmail,
        description: payload.description,
        expenseAccountId: payload.expenseAccountId,
        lines: payload.lines,
        billDate: template.nextRunDate,
        dueDate: addDays(template.nextRunDate, payload.dueInDays),
        taxCodeId: payload.taxCodeId,
        branchId: payload.branchId,
      }, template.createdById);
  }
}

export function listRecurringTemplates(organizationId: string) {
  return db.accountingRecurringTemplate.findMany({ where: { organizationId }, orderBy: { nextRunDate: "asc" } });
}

export function createRecurringTemplate(
  organizationId: string,
  data: { name: string; frequency: AccountingRecurringFrequency; nextRunDate: Date; payload: RecurringTemplatePayload; createdById?: string | null },
) {
  return db.accountingRecurringTemplate.create({
    data: {
      organizationId,
      type: data.payload.type,
      name: data.name,
      frequency: data.frequency,
      nextRunDate: data.nextRunDate,
      payload: data.payload as unknown as Prisma.InputJsonValue,
      createdById: data.createdById,
    },
  });
}

export async function setRecurringTemplateActive(organizationId: string, templateId: string, active: boolean) {
  const result = await db.accountingRecurringTemplate.updateMany({ where: { id: templateId, organizationId }, data: { active } });
  if (result.count === 0) throw new NotFoundError("Recurring template not found.");
}

/**
 * Finds every active template due on or before `now`, generates its document, and
 * advances nextRunDate by its frequency - in that order, so a failed generation
 * never silently advances the schedule and skips a period. Runs across every
 * organization: this is the cron sweep's entry point.
 */
export async function generateDueRecurringTransactions(now: Date = new Date()) {
  const due = await db.accountingRecurringTemplate.findMany({ where: { active: true, nextRunDate: { lte: now } } });
  let generated = 0;
  const failures: { templateId: string; name: string; error: string }[] = [];
  for (const template of due) {
    try {
      await generateFromTemplate(template);
      await db.accountingRecurringTemplate.update({
        where: { id: template.id },
        data: { nextRunDate: advanceByFrequency(template.nextRunDate, template.frequency), lastGeneratedAt: now },
      });
      generated++;
    } catch (error) {
      failures.push({ templateId: template.id, name: template.name, error: error instanceof Error ? error.message : String(error) });
    }
  }
  return { candidates: due.length, generated, failures };
}

/** Manual catch-up/testing path: generates one template immediately regardless of
 * whether it is yet due, through the exact same generateFromTemplate() +
 * advanceByFrequency() the cron sweep uses. */
export async function runRecurringTemplateNow(organizationId: string, templateId: string) {
  const template = await db.accountingRecurringTemplate.findFirst({ where: { id: templateId, organizationId, active: true } });
  if (!template) throw new NotFoundError("Recurring template not found or inactive.");
  await generateFromTemplate(template);
  return db.accountingRecurringTemplate.update({
    where: { id: templateId },
    data: { nextRunDate: advanceByFrequency(template.nextRunDate, template.frequency), lastGeneratedAt: new Date() },
  });
}

export type { AccountingInvoiceStatus };
