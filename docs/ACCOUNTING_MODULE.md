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

## Current boundary

This release establishes posting identity, period locking, and reversals. Full accounts receivable, accounts payable, bank-statement matching, tax, budget, fixed-asset, and multi-currency workflows remain separate future releases and must not be marketed as delivered by this foundation.
