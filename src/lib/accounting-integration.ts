import "server-only";

import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { primaryProductKey } from "@/platform/modules/product-groups";
import { ensureDefaultAccounts, listAccounts, postProcurementTaxAccrual, postSourceJournalEntry, reverseSourceJournalEntry } from "@/modules/accounting/service";

/**
 * The one place every revenue-generating module posts into Accounting's
 * ledger from, per docs/ACCOUNTING_MODULE.md's "Module integration
 * contract" (Accounting's own posting API, postSourceJournalEntry, is
 * idempotent per organization+sourceType+sourceId+postingPurpose but always
 * opens its own transaction — it is deliberately not composable inside a
 * source module's own db.$transaction, so every call site here runs after
 * the source module's own write has already committed, not nested inside
 * it. Reliability comes from that idempotency (a retried post is always
 * safe), not from cross-module atomicity, which this codebase's module
 * boundaries (docs/MODULE_BOUNDARIES.md) don't allow anyway).
 *
 * A source module's own operation (a driver payment, a dispensing sale, an
 * invoice payment) must never fail because Accounting is unreachable,
 * unconfigured, or not subscribed by this organization — every call here is
 * caught and logged, never thrown, mirroring src/lib/audit.ts's
 * logAuditEvent contract exactly. Callers that want to surface a degraded
 * state to an operator (e.g. a settings page "last sync" indicator) can
 * inspect the returned {posted, reason}.
 */

export type ModuleRevenueSource =
  | "fleet"
  | "pharmacy"
  | "hospital"
  | "pos"
  | "installment"
  | "hostel"
  | "hotel"
  | "school";

const MODULE_REVENUE_ACCOUNTS: Record<ModuleRevenueSource, { code: string; name: string }> = {
  fleet: { code: "4100", name: "Fleet Revenue" },
  pharmacy: { code: "4200", name: "Pharmacy Revenue" },
  hospital: { code: "4300", name: "Hospital Revenue" },
  pos: { code: "4400", name: "POS Revenue" },
  installment: { code: "4500", name: "Installment Revenue" },
  hostel: { code: "4600", name: "Hostel Revenue" },
  hotel: { code: "4700", name: "Hotel Revenue" },
  school: { code: "4800", name: "School Revenue" },
};

/**
 * Human-readable label for the source module, for the "Revenue by source"
 * statement and journal-entry descriptions — kept alongside the account map
 * so the two can never drift apart.
 */
export function moduleRevenueLabel(sourceModule: ModuleRevenueSource): string {
  return MODULE_REVENUE_ACCOUNTS[sourceModule].name;
}

/**
 * Whether `moduleCode` is currently active for this organization: assigned
 * and enabled, the module itself not suspended platform-wide, and — if the
 * org has any subscription record for it at all — currently within an
 * ACTIVE, date-valid subscription. Mirrors
 * src/lib/offline-sync/auth.ts's resolveCurrentEnabledModuleKeys, scoped to
 * a single non-consolidated module and safe to call with either the
 * default `db` client or another module's open transaction client.
 */
export async function isModuleActiveForOrg(
  client: Pick<typeof db, "organizationModule" | "subscription">,
  organizationId: string,
  moduleCode: string,
): Promise<boolean> {
  const now = new Date();
  const primaryKey = primaryProductKey(moduleCode);
  const [assignment, subscriptions] = await Promise.all([
    client.organizationModule.findFirst({
      where: { organizationId, enabled: true, module: { code: moduleCode, status: "ACTIVE" } },
      select: { id: true },
    }),
    client.subscription.findMany({
      where: { organizationId, module: { code: primaryKey } },
      select: { status: true, startsAt: true, endsAt: true },
    }),
  ]);
  if (!assignment) return false;
  if (subscriptions.length === 0) return true;
  return subscriptions.some((s) => s.status === "ACTIVE" && s.startsAt !== null && s.endsAt !== null && s.startsAt <= now && s.endsAt > now);
}

type DbOrTx = Pick<typeof db, "accountingAccount" | "organizationModule" | "subscription">;

async function getOrCreateModuleRevenueAccount(client: DbOrTx, organizationId: string, sourceModule: ModuleRevenueSource) {
  const spec = MODULE_REVENUE_ACCOUNTS[sourceModule];
  const existing = await client.accountingAccount.findFirst({ where: { organizationId, code: spec.code } });
  if (existing) return existing;
  try {
    return await client.accountingAccount.create({ data: { organizationId, code: spec.code, name: spec.name, type: "REVENUE", isSystem: true } });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return client.accountingAccount.findFirstOrThrow({ where: { organizationId, code: spec.code } });
    }
    throw error;
  }
}

/**
 * Provisions the chart-of-accounts side of the integration eagerly, the
 * moment a module is activated, rather than waiting for that module's
 * first real transaction: for every revenue-generating module currently
 * active for this organization, ensures its Revenue account already
 * exists in Accounting — provided Accounting itself is active too (no
 * chart of accounts to create one in otherwise). Call this from every
 * module-activation call site (see src/platform/subscriptions/service.ts's
 * finalizeActivation, src/platform/module-requests/service.ts's
 * updateModuleRequest, and src/app/app/platform/actions.ts's module
 * toggle) inside the same transaction as the activation write, and
 * unconditionally — it's cheap and idempotent regardless of which module
 * was just activated, which also means activating Accounting itself
 * backfills every already-active revenue module's account in one call,
 * not just modules activated after Accounting was.
 */
export async function ensureRevenueAccountsForOrg(client: DbOrTx, organizationId: string): Promise<void> {
  if (!(await isModuleActiveForOrg(client, organizationId, "accounting"))) return;
  const modules = Object.keys(MODULE_REVENUE_ACCOUNTS) as ModuleRevenueSource[];
  for (const sourceModule of modules) {
    if (await isModuleActiveForOrg(client, organizationId, sourceModule)) {
      await getOrCreateModuleRevenueAccount(client, organizationId, sourceModule);
    }
  }
}

export interface PostModuleRevenueInput {
  sourceModule: ModuleRevenueSource;
  /** A stable identifier for the kind of record posting (e.g. "FLEET_PAYMENT") — see docs/ACCOUNTING_MODULE.md. */
  sourceType: string;
  /** The originating record's own id (e.g. the FleetPayment id) — paired with sourceType+postingPurpose for idempotency. */
  sourceId: string;
  /** Distinguishes separate financial events for the same source record (e.g. "COLLECTED" vs. a future "REFUNDED"). */
  postingPurpose: string;
  amount: string;
  entryDate: Date;
  description: string;
  createdById?: string | null;
}

export type PostModuleRevenueResult =
  | { posted: true; journalEntryId: string }
  | { posted: false; reason: "accounting-not-enabled" | "error" };

export async function postProcurementInvoiceAccrual(organizationId: string, input: { invoiceId: string; invoiceNumber: string; vendorName: string; taxCodeId?: string | null; taxableAmount: string; vatAmount: string; nhilAmount: string; getfundAmount: string; totalAmount: string; invoiceDate: Date; description: string; actorId?: string | null }): Promise<PostModuleRevenueResult> {
  try {
    if (!(await isModuleActiveForOrg(db, organizationId, "accounting"))) return { posted: false, reason: "accounting-not-enabled" };
    const entry = await postProcurementTaxAccrual(organizationId, input);
    return { posted: true, journalEntryId: entry.id };
  } catch (error) {
    console.error("[accounting-integration] Failed to accrue supplier invoice:", { organizationId, invoiceId: input.invoiceId, error });
    return { posted: false, reason: "error" };
  }
}

export async function postProcurementSupplierPayment(organizationId: string, input: { paymentId: string; accountId: string; amount: string; paymentDate: Date; description: string; actorId?: string | null }): Promise<PostModuleRevenueResult> {
  try {
    if (!(await isModuleActiveForOrg(db, organizationId, "accounting"))) return { posted: false, reason: "accounting-not-enabled" };
    const payable = (await ensureDefaultAccounts(organizationId)).find((account) => account.code === "2000");
    const liquidity = await db.accountingAccount.findFirst({ where: { id: input.accountId, organizationId, active: true, liquidityType: { in: ["CASH", "BANK", "MOBILE_MONEY"] } } });
    if (!payable || !liquidity) throw new Error("A valid payable and organization liquidity account are required.");
    const entry = await postSourceJournalEntry(organizationId, {
      sourceType: "PROCUREMENT_SUPPLIER_PAYMENT",
      sourceId: input.paymentId,
      postingPurpose: "PAID",
      entryDate: input.paymentDate,
      description: input.description,
      createdById: input.actorId,
      lines: [{ accountId: payable.id, debit: input.amount }, { accountId: liquidity.id, credit: input.amount }],
    });
    return { posted: true, journalEntryId: entry.id };
  } catch (error) {
    console.error("[accounting-integration] Failed to post supplier payment:", { organizationId, paymentId: input.paymentId, error });
    return { posted: false, reason: "error" };
  }
}

/**
 * Records a module's cash-basis revenue event in Accounting: debit the
 * shared Cash account, credit that module's own revenue sub-account, so a
 * manager can see both the combined cash position and exactly which
 * module's activity produced it. No-ops (returns {posted:false,
 * reason:"accounting-not-enabled"}) if this organization hasn't activated
 * Accounting — a module's own revenue recording must never depend on
 * Accounting being subscribed.
 */
export async function postModuleRevenue(organizationId: string, input: PostModuleRevenueInput): Promise<PostModuleRevenueResult> {
  return postModuleRevenueEntry(organizationId, input, "COLLECT");
}

/**
 * Posts a partial or full refund as its own distinct event — Debit the
 * module's Revenue account, Credit Cash — rather than reversing
 * (undoing) the original sale's journal entry. This is the correct shape
 * for a partial return (e.g. POS's line-level returnSaleLines()): the
 * original sale entry must stay intact for the portion that wasn't
 * returned, so reverseModuleRevenue()'s "locate and mark the original
 * POSTED entry REVERSED" isn't applicable here. Use reverseModuleRevenue
 * instead when the entire originating record is being undone (a payment
 * rejected, a whole dispensing reversed).
 */
export async function postModuleRevenueRefund(organizationId: string, input: PostModuleRevenueInput): Promise<PostModuleRevenueResult> {
  return postModuleRevenueEntry(organizationId, input, "REFUND");
}

async function postModuleRevenueEntry(organizationId: string, input: PostModuleRevenueInput, direction: "COLLECT" | "REFUND"): Promise<PostModuleRevenueResult> {
  try {
    if (!(await isModuleActiveForOrg(db, organizationId, "accounting"))) {
      return { posted: false, reason: "accounting-not-enabled" };
    }
    const [defaultAccounts, revenueAccount] = await Promise.all([
      ensureDefaultAccounts(organizationId),
      getOrCreateModuleRevenueAccount(db, organizationId, input.sourceModule),
    ]);
    const cashAccount = defaultAccounts.find((account) => account.code === "1000");
    if (!cashAccount) throw new Error("Default Cash account (1000) missing after ensureDefaultAccounts().");

    const lines = direction === "COLLECT"
      ? [{ accountId: cashAccount.id, debit: input.amount }, { accountId: revenueAccount.id, credit: input.amount }]
      : [{ accountId: revenueAccount.id, debit: input.amount }, { accountId: cashAccount.id, credit: input.amount }];

    const entry = await postSourceJournalEntry(organizationId, {
      sourceType: input.sourceType,
      sourceId: input.sourceId,
      postingPurpose: input.postingPurpose,
      entryDate: input.entryDate,
      description: input.description,
      createdById: input.createdById,
      lines,
    });
    return { posted: true, journalEntryId: entry.id };
  } catch (error) {
    console.error("[accounting-integration] Failed to post module revenue:", { organizationId, direction, sourceModule: input.sourceModule, sourceType: input.sourceType, sourceId: input.sourceId, postingPurpose: input.postingPurpose, error });
    return { posted: false, reason: "error" };
  }
}

/**
 * Reverses a previously posted module-revenue entry (e.g. a verified Fleet
 * payment later rejected, a dispensing sale reversed) by locating it via
 * the same sourceType+sourceId+postingPurpose identity used to post it,
 * then delegating to Accounting's source-identity reversal boundary so the reversal
 * is itself a real, auditable journal entry — never a silent balance edit.
 * A no-op (not an error) if nothing was ever posted for this source, since
 * that's the expected case when Accounting wasn't enabled at posting time.
 */
export async function reverseModuleRevenue(organizationId: string, input: { sourceType: string; sourceId: string; postingPurpose: string; reason: string; actorId?: string | null }): Promise<PostModuleRevenueResult> {
  try {
    const original = await db.accountingJournalEntry.findFirst({
      where: { organizationId, sourceType: input.sourceType, sourceId: input.sourceId, postingPurpose: input.postingPurpose, status: "POSTED" },
      select: { id: true },
    });
    if (!original) return { posted: false, reason: "accounting-not-enabled" };
    const reversal = await reverseSourceJournalEntry(organizationId, original.id, {
      entryDate: new Date(),
      reason: input.reason,
      actorId: input.actorId,
      sourceType: input.sourceType,
      sourceId: input.sourceId,
      postingPurpose: input.postingPurpose,
    });
    return { posted: true, journalEntryId: reversal.id };
  } catch (error) {
    console.error("[accounting-integration] Failed to reverse module revenue:", { organizationId, sourceType: input.sourceType, sourceId: input.sourceId, postingPurpose: input.postingPurpose, error });
    return { posted: false, reason: "error" };
  }
}

/**
 * Reverses every currently-POSTED entry for a source record, regardless of
 * postingPurpose — for a module (e.g. Installment's editable payments) where
 * a single source record can accumulate more than one posted entry over its
 * life (the original "COLLECTED" post plus any later amount-correction
 * entries, each under its own postingPurpose since postSourceJournalEntry's
 * organizationId+sourceType+sourceId+postingPurpose uniqueness means a
 * correction can never reuse the original's purpose — see postModuleRevenue
 * call sites that post amount-correction deltas). Use this instead of
 * reverseModuleRevenue when the whole source record is being deleted, so
 * nothing it ever posted is left standing. A no-op (not an error) if
 * nothing was ever posted for this source.
 */
export async function reverseAllModuleRevenueForSource(organizationId: string, input: { sourceType: string; sourceId: string; reason: string; actorId?: string | null }): Promise<{ reversedCount: number }> {
  const entries = await db.accountingJournalEntry.findMany({
    where: { organizationId, sourceType: input.sourceType, sourceId: input.sourceId, status: "POSTED" },
    select: { id: true, postingPurpose: true },
  });
  let reversedCount = 0;
  for (const entry of entries) {
    try {
      if (!entry.postingPurpose) throw new Error("Source posting purpose is missing.");
      await reverseSourceJournalEntry(organizationId, entry.id, {
        entryDate: new Date(),
        reason: input.reason,
        actorId: input.actorId,
        sourceType: input.sourceType,
        sourceId: input.sourceId,
        postingPurpose: entry.postingPurpose,
      });
      reversedCount++;
    } catch (error) {
      console.error("[accounting-integration] Failed to reverse one of a source's module revenue entries:", { organizationId, sourceType: input.sourceType, sourceId: input.sourceId, postingPurpose: entry.postingPurpose, error });
    }
  }
  return { reversedCount };
}

export interface RevenueInsights {
  monthly: { label: string; revenue: number }[];
  byModule: { label: string; value: number }[];
}

/**
 * Cross-module revenue for the main Dashboard's insights widget - every
 * revenue-generating module posts into its own dedicated Revenue account
 * (MODULE_REVENUE_ACCOUNTS), so this is real posted-ledger data, not a
 * per-module re-derivation. Returns null when Accounting isn't active for
 * this organization (nothing to show) rather than an empty/misleading chart.
 */
export async function getRevenueInsights(organizationId: string): Promise<RevenueInsights | null> {
  if (!(await isModuleActiveForOrg(db, organizationId, "accounting"))) return null;

  const sixMonthsAgo = new Date();
  sixMonthsAgo.setHours(0, 0, 0, 0);
  sixMonthsAgo.setDate(1);
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 5);

  const [accounts, recentLines] = await Promise.all([
    listAccounts(organizationId),
    db.accountingJournalLine.findMany({
      where: {
        account: { organizationId, type: "REVENUE" },
        journalEntry: { organizationId, entryDate: { gte: sixMonthsAgo }, status: "POSTED" },
      },
      select: { debit: true, credit: true, journalEntry: { select: { entryDate: true } } },
    }),
  ]);

  const months: { year: number; month: number; label: string }[] = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date();
    d.setDate(1);
    d.setMonth(d.getMonth() - i);
    months.push({ year: d.getFullYear(), month: d.getMonth(), label: d.toLocaleDateString("en-US", { month: "short" }) });
  }

  const monthly = months.map(({ year, month, label }) => {
    const revenue = recentLines
      .filter((line) => line.journalEntry.entryDate.getFullYear() === year && line.journalEntry.entryDate.getMonth() === month)
      .reduce((sum, line) => sum + (Number(line.credit) - Number(line.debit)), 0);
    return { label, revenue };
  });

  const byModule = accounts
    .filter((account) => account.type === "REVENUE")
    .map((account) => ({ label: account.name, value: account.balance }))
    .filter((entry) => entry.value > 0)
    .sort((a, b) => b.value - a.value);

  return { monthly, byModule };
}
