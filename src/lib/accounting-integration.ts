import "server-only";

import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { primaryProductKey } from "@/platform/modules/product-groups";
import { ensureDefaultAccounts, postSourceJournalEntry, reverseJournalEntry } from "@/modules/accounting/service";

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

async function getOrCreateModuleRevenueAccount(organizationId: string, sourceModule: ModuleRevenueSource) {
  const spec = MODULE_REVENUE_ACCOUNTS[sourceModule];
  const existing = await db.accountingAccount.findFirst({ where: { organizationId, code: spec.code } });
  if (existing) return existing;
  try {
    return await db.accountingAccount.create({ data: { organizationId, code: spec.code, name: spec.name, type: "REVENUE", isSystem: true } });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return db.accountingAccount.findFirstOrThrow({ where: { organizationId, code: spec.code } });
    }
    throw error;
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
  try {
    if (!(await isModuleActiveForOrg(db, organizationId, "accounting"))) {
      return { posted: false, reason: "accounting-not-enabled" };
    }
    const [defaultAccounts, revenueAccount] = await Promise.all([
      ensureDefaultAccounts(organizationId),
      getOrCreateModuleRevenueAccount(organizationId, input.sourceModule),
    ]);
    const cashAccount = defaultAccounts.find((account) => account.code === "1000");
    if (!cashAccount) throw new Error("Default Cash account (1000) missing after ensureDefaultAccounts().");

    const entry = await postSourceJournalEntry(organizationId, {
      sourceType: input.sourceType,
      sourceId: input.sourceId,
      postingPurpose: input.postingPurpose,
      entryDate: input.entryDate,
      description: input.description,
      createdById: input.createdById,
      lines: [
        { accountId: cashAccount.id, debit: input.amount },
        { accountId: revenueAccount.id, credit: input.amount },
      ],
    });
    return { posted: true, journalEntryId: entry.id };
  } catch (error) {
    console.error("[accounting-integration] Failed to post module revenue:", { organizationId, sourceModule: input.sourceModule, sourceType: input.sourceType, sourceId: input.sourceId, postingPurpose: input.postingPurpose, error });
    return { posted: false, reason: "error" };
  }
}

/**
 * Reverses a previously posted module-revenue entry (e.g. a verified Fleet
 * payment later rejected, a dispensing sale reversed) by locating it via
 * the same sourceType+sourceId+postingPurpose identity used to post it,
 * then delegating to Accounting's own reverseJournalEntry so the reversal
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
    const reversal = await reverseJournalEntry(organizationId, original.id, { entryDate: new Date(), reason: input.reason, actorId: input.actorId });
    return { posted: true, journalEntryId: reversal.id };
  } catch (error) {
    console.error("[accounting-integration] Failed to reverse module revenue:", { organizationId, sourceType: input.sourceType, sourceId: input.sourceId, postingPurpose: input.postingPurpose, error });
    return { posted: false, reason: "error" };
  }
}
