# Accounting module

## Posting and period concurrency guarantee

Every journal posting and every accounting-period create, close, or reopen operation acquires the same organization-scoped PostgreSQL transaction advisory lock. A posting can therefore commit before a close or be rejected after the close, but it cannot commit into a period that became closed concurrently. Source postings remain idempotent through the unique organization, source type, source id, and posting-purpose contract. Posted journals are corrected with reversal entries and are not edited or deleted.

## Ledger foundation

Accounting uses an immutable double-entry journal. Account balances are derived from journal lines. Posted journal entries are not edited or deleted. Corrections use a compensating reversal entry that preserves the original record.

Every journal entry has an organization-scoped posting number. Source modules post through `postSourceJournalEntry()` using a unique tuple of organization, source type, source id, and posting purpose. Retrying the same source operation returns the original posting instead of duplicating it.

## Accounting periods

Organizations can define non-overlapping accounting periods. Closing a period blocks all new journal postings dated inside that period, including automated postings and reversals. Reopening is explicit, permission-controlled, and audited.

Permissions added by this foundation:

- `accounting.periods.manage`
- `accounting.journals.reverse`

## Module integration contract

Payroll, POS, Procurement, School, Hotel, Pharmacy, Hospital, Fleet, Installment, and other modules must call Accounting's public posting service. They must not write Accounting journal tables directly.

Each integration must provide:

- A stable source type.
- A stable source record id.
- A posting purpose that distinguishes separate financial events for the same source.
- A balanced set of organization-owned account lines.
- The effective accounting date.

Posting into a closed period fails without partially changing either module. Integration services must display the failure and allow an authorized retry after correction or period reopening.

## Module integrations delivered

Fleet, Pharmacy, Hospital, POS, Installment, Hostel, Hotel, and School now call `postSourceJournalEntry()` — through a shared `postModuleRevenue()`/`reverseModuleRevenue()` helper in `src/lib/accounting-integration.ts`, not directly — at the moment each module treats its own money as confirmed (a verified Fleet payment, a completed Pharmacy dispensing, a Hospital/Hostel/Hotel/School fee payment, a POS sale, an Installment payment). See `docs/DECISIONS.md`'s 2026-08-21 entries for the full design and its explicit non-goals (Payroll/Procurement are not wired; they are expense/liability-side, not revenue). Each module posts into its own Revenue sub-account (4100–4800) rather than the shared 4000 Revenue account manual invoices use, so Accounting's Reports page can show a "Revenue by source" breakdown — a manager can trace any total back to the module and record that produced it.

Each module's Revenue account is created **eagerly, the moment the module is activated** for the organization (`ensureRevenueAccountsForOrg()`, called from every module-activation site), not deferred until a transaction actually needs it — a manager who turns on Fleet sees "Fleet Revenue" sitting at zero in the chart of accounts immediately, not only after the first payment is verified. Activating Accounting itself on an organization that already has other revenue modules running backfills all of their accounts in that same step. `postModuleRevenue()` still creates the account on first use too, as an idempotent fallback for any organization or activation path that predates this.

The integration is conditional on the organization having activated Accounting (`isModuleActiveForOrg()`) — a source module's own operation is never blocked, delayed, or altered by Accounting being unsubscribed, and a failed post is caught and logged, never thrown back to the caller.

## Every write path that finalizes revenue must post, not just the first one found

A module posting revenue from one call site is not the same guarantee as "this module's total revenue reflects in Accounting" — a module can have more than one code path that finalizes a confirmed-revenue record, and each one needs its own posting call. This was audited across all eight wired modules on 2026-08-22 after Fleet was found posting from only 1 of 4 paths that create a VERIFIED `FleetPayment` (the office-verified path was wired; a driver-submission approval, a Work & Pay deposit, and an office-recorded Work & Pay instalment were not). The same audit found a live bug in Pharmacy (a controlled-drug dispense posted revenue when merely *requested*, before maker-checker approval, and never reversed on rejection) and two gaps in Installment (an account-opening deposit, and payment amount edits). Hospital, Hotel, Hostel, and School each have only one revenue-finalizing code path and were confirmed already fully wired. See `docs/DECISIONS.md`'s 2026-08-22 entry for the full list and the fixes.

`postSourceJournalEntry()`'s uniqueness is `(organizationId, sourceType, sourceId, postingPurpose)`, and that tuple is never freed by a reversal — a reversed entry still occupies its identity, so a correction to an already-posted source (e.g. an edited Installment payment amount) cannot reuse the original posting purpose. `postModuleRevenue()`/`postModuleRevenueRefund()` calls for a correction use a distinct `postingPurpose` (Installment's is keyed as `` `ADJUSTED_${payment.updatedAt.getTime()}` `` so repeated edits within the edit window never collide). The originally-posted entry is never itself edited or reversed for an amount correction — only for a full deletion, where `reverseAllModuleRevenueForSource()` reverses the original entry and every correction entry for that source together, so nothing a deleted record ever posted is left standing.

## Current boundary

This release establishes posting identity, period locking, and reversals. Full accounts receivable, accounts payable, bank-statement matching, tax, budget, fixed-asset, and multi-currency workflows remain separate future releases and must not be marketed as delivered by this foundation. The revenue-side module integrations above are real; expense/liability-side integrations (payroll runs, purchase-order receipts) are not yet built.
