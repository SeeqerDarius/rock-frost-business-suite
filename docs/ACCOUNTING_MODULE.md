# Accounting module

## Posting and period concurrency guarantee

Every journal posting and every accounting-period create, close, or reopen operation acquires the same organization-scoped PostgreSQL transaction advisory lock. A posting can therefore commit before a close or be rejected after the close, but it cannot commit into a period that became closed concurrently. Source postings remain idempotent through the unique organization, source type, source id, and posting-purpose contract. Posted journals are corrected with reversal entries and are not edited or deleted.

## Ledger foundation

Accounting uses an immutable double-entry journal. Account balances are derived from journal lines. Posted journal entries are not edited or deleted. Corrections use a compensating reversal entry that preserves the original record.

Every journal entry has an organization-scoped posting number. Source modules post through `postSourceJournalEntry()` using a unique tuple of organization, source type, source id, and posting purpose. Retrying the same source operation returns the original posting instead of duplicating it.

### Reversal ownership

The Journal screen offers **Reverse entry** only for entries whose source type is `MANUAL`. Entries posted by Fleet, POS, Pharmacy, Hospital, Hotel, Hostel, School, Installment, invoices, expenses, opening balances, petty cash, and other managed workflows cannot be reversed from the generic journal screen. Their source workflow owns validation, state transitions, refund or void rules, permissions, and audit context.

This is enforced in the UI and in the Accounting service. `reverseJournalEntry()` rejects every non-manual source even if a caller crafts a Server Action request. Legitimate source workflows use `reverseSourceJournalEntry()` through the shared Accounting integration and must present the exact source type, source id, and posting purpose already stored on the journal. The original entry remains immutable and the correction remains a compensating journal entry.

## Accounting Insights

`/app/accounting/insights` provides a tenant-scoped command center for users with `accounting.reports.view`. It includes 30-day, 90-day, and 12-month views of recorded revenue, expenses, net income, cash and bank balance, average revenue transaction, revenue by originating module, overdue invoices, pending expenses, and revenue/expense trends.

The optional business-question assistant additionally requires `ai.assistant.use`. It receives only the selected organization's already-aggregated Accounting Insights payload, never an organization id supplied by the browser. Questions are limited to 30 per user per hour and are audited without storing the question text. If Groq is unavailable, deterministic answers from the same figures keep the feature usable. Figures are decision support, not audited financial, tax, or forecasting advice, and the UI tells users to reconcile external statements.

The assistant composer clears as soon as a valid question is submitted, displays the submitted question as an outgoing chat bubble, blocks duplicate sends while the answer is being prepared, and shows a reduced-motion-safe progress indicator. The completed answer animates into place and keyboard focus returns to the composer for the next question.

The chat identifies itself as **Rock Frost Business Assistant**. The compact Rock Frost favicon in the header preserves the product identity, while the dedicated assistant character at `public/rf-business-assistant.png` distinguishes automated answers from human messages. The signed-in user's outgoing questions use the profile image already stored on their user account, with name initials as an accessible fallback when no image has been uploaded.

## Accounting periods

Organizations can define non-overlapping accounting periods. Closing a period blocks all new journal postings dated inside that period, including automated postings and reversals. Reopening is explicit, permission-controlled, and audited.

Permissions added by this foundation:

- `accounting.periods.manage`
- `accounting.journals.reverse`
- `accounting.journal.approve`

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

This release establishes posting identity, period locking, source-owned reversals, operational insights, grounded Accounting Q&A, supplier payables, explicit customer receivable allocations, effective-dated tax codes, invoice output-tax evidence, Procurement input-tax evidence, controlled VAT working returns, revision-controlled budgets and forecasts with actual-versus-plan reporting, a shared customer/supplier contact record, multi-line invoices, standalone bills, and credit notes. See `docs/TAX_AND_STATUTORY_REPORTING.md` for the legal and filing boundary and `docs/ACCOUNTING_PLANNING.md` for planning controls.

Bank-statement import matching, fixed assets, predictive forecasting, consolidation, multi-company accounting, multi-currency revaluation, and component-level tax capture from modules other than Accounting and Procurement remain separate future releases and must not be marketed as delivered.
# Procurement payable integration

Supplier invoice approval in Inventory and Procurement creates an idempotent accrual in Accounting. Untaxed invoices debit Inventory Asset and credit Accounts Payable. Taxed invoices additionally debit the separate recoverable input VAT, NHIL, and GETFund accounts while Accounts Payable receives the gross value. A partial or final supplier payment debits Accounts Payable and credits the organization-owned cash, bank, or mobile-money account selected at payment time. Procurement owns the operational invoice and payment record. Accounting owns its immutable journal and tax evidence. Users must correct source transactions through their source workflow rather than manually reversing a source-owned journal.

## Journal dimensions

Source-managed journal reversals retain the original source module and branch dimensions. The reversal transaction uses a 20-second timeout so its validation, balanced posting, original-entry claim, and reversal link can complete reliably when the managed PostgreSQL region has elevated latency.

Every new journal entry can carry two reporting dimensions in addition to its source identity:

- `sourceModule` is the canonical module key that owns the business event. Accounting invoice, receivable, expense, opening-balance, manual, and petty-cash postings use `accounting`. Procurement supplier accruals and payments use `procurement`. Revenue integrations preserve the module key supplied by the shared `postModuleRevenue()` contract.
- `branchId` identifies the originating operational branch when the source record has an authoritative branch. Accounting invoice and expense postings copy the branch from the source record. Procurement derives a branch only when every relevant goods receipt resolves to one branch. A multi-branch or branchless procurement event remains unallocated instead of being guessed.

The posting service verifies that a supplied branch belongs to the same organization before writing the journal. Reversal entries inherit both dimensions from the original entry. Historical entries are backfilled where the originating Accounting record still provides an unambiguous branch, and known source types are mapped to their canonical module keys.

# Accounts receivable

Customer receipts are explicit immutable allocation records rather than only an invoice-level running total. Each receipt records the invoice, amount, date, payment method, receiving cash, bank, or mobile-money account, optional reference and notes, and the user who recorded it. Invoice balances remain concurrency locked, so simultaneous receipts cannot overpay an invoice. Every new receipt has its own idempotent journal identity and posts debit to the selected liquidity account and credit to Accounts Receivable.

The Receivables page groups invoices by normalized customer email, falling back to normalized customer name when no email is available. It shows invoiced, paid, outstanding, and overdue balances plus statement-style invoice and receipt history. `accounting.receivables.manage` controls receipt entry separately from invoice creation.

# Contacts, multi-line invoices, bills, and credit notes (2026-08-31)

**Contacts.** `AccountingContact` (`/app/accounting/contacts`, `accounting.contacts.manage`) is a shared customer/supplier party record - `type` is `CUSTOMER`, `SUPPLIER`, or `BOTH`. `fleetOwnerId`/`procurementVendorId`/`crmContactId` are deliberately plain, unenforced string references to that other module's own party record - a convenience cross-reference a manager can fill in by hand, not a forced migration of Fleet's or Procurement's own party models, which keep operating exactly as before. Invoices, bills, and credit notes each gained an optional `contactId`; the invoice/bill/credit-note itself still stores its own name/email snapshot fields (`customerName`, `supplierName`, etc.), so picking a contact only pre-fills the form - a contact's name changing later never rewrites a historical document.

**Multi-line invoices.** `AccountingInvoiceLine` (description, quantity, unit price, a cached `lineTotal`) replaces the single freeform "amount" field the Invoices page previously offered. `createInvoice()`'s `taxableAmount` is now always the exact sum of its own lines' `lineTotal`, computed by a shared `computeLineItems()` used identically by invoices, bills, and credit notes. The invoice header's `amount`/`taxableAmount`/tax fields remain the authoritative aggregate total exactly as before - every existing reader that only ever looked at the header (receivables ageing, reports, the VAT return) keeps working unchanged. A one-time backfill migration (`20260831170000_accounting_contacts_bills_credit_notes`) created one `AccountingInvoiceLine` per pre-existing invoice from its own `taxableAmount` and description, so the "header total = sum of lines" invariant holds for every invoice ever created, not only new ones. The Invoices, Bills, and Credit Notes pages all share one dynamic add/remove line-item editor (`src/components/forms/line-items-editor.tsx`), submitting as indexed `lines[{n}][description|quantity|unitPrice]` form fields parsed back out by `parseIndexedFormRows()` (`src/lib/validation.ts`).

**Bills.** `AccountingBill` (`/app/accounting/bills`) is a standalone payable document for an org that wants to record a simple supplier bill without Procurement's heavier PO/receiving flow - Procurement's own `ProcurementSupplierInvoice` is untouched and remains the authoritative source for PO-linked payables. A bill picks one of the org's own `EXPENSE`-type accounts to charge (`expenseAccountId`) rather than a fixed category. Its lifecycle mirrors an invoice's, reversed: `createBill()` (DRAFT, unposted) -> `approveBill()` (`accounting.bills.manage`; DRAFT -> APPROVED, posts Debit the chosen expense account + recoverable input tax / Credit Accounts Payable, plus an INPUT `AccountingTaxTransaction` for VAT-return evidence) -> `recordBillPayment()` (`accounting.payables.manage`; the exact `SELECT ... FOR UPDATE` row-locked, atomically-incremented pattern `recordInvoicePayment` already used, reversed: Debit Accounts Payable / Credit the chosen cash/bank/mobile-money account; transitions to `PARTIALLY_PAID` or `PAID`) or `voidBill()` (blocks once any payment exists; reverses the approval posting if one exists).

**Credit notes.** `AccountingCreditNote` (`/app/accounting/credit-notes`, `accounting.receivables.manage`) is issued in DRAFT against a customer, then settled exactly one way (not staged): `applyCreditNoteToInvoice()` reduces one specific invoice's outstanding balance (Debit Revenue + reverse the tax-payable lines / Credit Accounts Receivable, then increments the invoice's own `amountCredited`), or `refundCreditNote()` pays the customer real cash instead (Debit Revenue + reverse the tax-payable lines / Credit the chosen cash/bank/mobile-money account). `AccountingInvoice.amountCredited` is a new column, separate from `amountPaid` - outstanding balance is `amount - amountPaid - amountCredited` everywhere it's computed (`recordInvoicePayment`'s remaining-balance guard, its PAID-transition check, and `getReceivablesSummary()`), so a non-cash credit is never counted as cash received. A credit note larger than an invoice's current outstanding balance is rejected rather than allowed to overshoot.

# Reporting: trial balance, general ledger, ageing, cash flow, chart-of-accounts templates (2026-08-31)

No schema change - every report in this section is a pure read/compute over data that already existed cleanly (`AccountingJournalLine`, `AccountingAccount`, `AccountingInvoice`, `AccountingBill`, and Procurement's own `ProcurementSupplierInvoice`).

**Trial balance** (`/app/accounting/trial-balance`, `accounting.reports.view`). `getTrialBalance()` sums every account's raw (debit total - credit total) as of a date and shows it in whichever column the sign naturally falls on - not normalized by account type. Because every journal entry balances on its own, the sum of every account's raw net position balances too: the debit column total always equals the credit column total, which is the entire point of a trial balance and is what the page's "Balanced" indicator checks. Zero-balance accounts are omitted.

**General ledger** (`/app/accounting/general-ledger` index + `/app/accounting/general-ledger/[accountId]` detail). The index reuses `listAccounts()`'s existing balance computation; the per-account page shows every `AccountingJournalLine` ever posted against that account, oldest first, with a running balance computed the same debit/credit-normal way `computeBalance()` already does for the account's total. Extends the existing flat Journal/Cashbook list pattern rather than replacing it - neither of those pages is changed.

**AR/AP ageing** (`/app/accounting/ageing`). Real `current`/`1-30`/`31-60`/`61-90`/`90+`-day buckets, bucketed off each document's own `dueDate` relative to today - a genuine improvement over the Receivables page's existing per-customer current/overdue binary flag, which is left as-is since it serves a different purpose (a customer statement, not an ageing schedule). `getReceivablesAgeing()` reads `AccountingInvoice` (outstanding = `amount - amountPaid - amountCredited`, matching Track 7's own outstanding-balance convention exactly). `getPayablesAgeing()` reads **both** `AccountingBill` directly and Procurement's `ProcurementSupplierInvoice` through Procurement's own exported `listSupplierInvoices()` (not by querying its table directly), so an organization's true payable position is complete regardless of which flow created the obligation.

**Cash-flow statement** (`/app/accounting/cash-flow`). Direct method: every `AccountingJournalLine` posted against a `CASH`/`BANK`/`MOBILE_MONEY`-liquidity account within the chosen date range, categorized Operating/Investing/Financing by its journal entry's `sourceType` via `classifyCashFlowSourceType()`. Every source type in this codebase today is legitimately Operating - there is no fixed-asset or loan module yet to originate an Investing or Financing transaction - so that function's single `"OPERATING"` default is the correct classification today, not a placeholder bug; it is the one place a future fixed-asset or loan module registers its own category. `openingCash` (the balance immediately before the period) plus `netChange` (the period's categorized total) is guaranteed to equal `closingCash` by construction, since both are computed from the same underlying line set split only by date - the statement cannot fail to reconcile to the account's actual balance change.

**Ghana SME chart-of-accounts template.** `loadGhanaSmeChartOfAccounts()` (the "Load Ghana SME chart of accounts" button on the Chart of Accounts page, `accounting.accounts.manage`) upserts 21 additional Ghana-flavored accounts (Bank, Mobile Money, Prepaid Expenses, Property/Plant/Equipment, Withholding Tax Payable, Owner's Capital, Retained Earnings, Salaries and Wages, Rent, Utilities, and more) by code, skipping anything already present - deliberately non-overlapping with the 12 system accounts `ensureDefaultAccounts()` already creates for every organization, so the two never collide. Not `isSystem` - these are ordinary, editable/deletable accounts, just a convenient starting point. Idempotent by design: running it twice creates nothing extra the second time.

All four new reports export to PDF/XLSX through one bespoke route (`/api/reports/accounting/[reportType]`), mirroring the Fleet owner statement's existing bespoke-route pattern rather than the generic `/api/reports/[moduleKey]` summary-card flatten every module's plain Reports page export uses - these reports have real per-row data (accounts, invoices, bills), not a handful of summary stats.

# Journal entry approval workflow (2026-08-31)

No new model. `AccountingJournalStatus` gains two additive values: `PENDING_APPROVAL` and `REJECTED`, alongside `AccountingJournalEntry`'s existing `POSTED`/`REVERSED`. A manual journal entry created by someone who holds `accounting.accounts.manage` but not the new `accounting.journal.approve` lands `PENDING_APPROVAL` (with `submittedById` set) instead of posting immediately; the Action layer decides which, since the service layer has no permission context of its own - `createManualJournalEntry()` just takes a `requiresApproval` boolean. An actor who already holds `accounting.journal.approve` still posts immediately, exactly as before this track.

Every entry - pending, posted, rejected - is created with its full lines and a real posting number at submission time, not deferred to approval. What changes at approval is only the `status` column. This mirrors how a reversal already leaves the original entry's lines in place: the entry's rows are always real, and `status` alone decides whether they count.

**Balances stay honest while a decision is pending.** Every account-balance-affecting read - `listAccounts()`, `getCashbook()`, `getTrialBalance()`, `getGeneralLedgerForAccount()`, and both queries inside `getCashFlowStatement()` - filters its journal lines to `status: { notIn: ["PENDING_APPROVAL", "REJECTED"] }`. `POSTED` and `REVERSED` both stay included: a reversal leaves the original entry's lines in place and adds a new `POSTED` entry with the opposite signs, so the two only net to zero if both remain in the sum. A single `NON_POSTED_JOURNAL_STATUSES` constant is the one place this list is defined, reused by every read site above.

**Approve and reject** (`approveJournalEntry()` / `rejectJournalEntry()`, both `accounting.journal.approve`) mirror the Planning module's already-proven approval-state-machine (`transitionAccountingPlan()`): an optimistic `updateMany` scoped to `status: "PENDING_APPROVAL"` claims the transition, and a `count === 0` means someone else already decided it. Approving records `approvedById`/`approvedAt` and flips the entry to `POSTED`, at which point it is indistinguishable from an entry that posted immediately - the regression guard this track's tests check for. The submitter cannot approve their own entry (checked against `submittedById`, matching Planning's own guard); this restriction deliberately does not apply to rejecting your own submission, again mirroring Planning. Rejecting requires a non-empty reason, stored on `rejectedReason`; the entry stays in the ledger for the audit trail but never posts.

The Journal page shows an amber "Awaiting approval" note on `PENDING_APPROVAL` entries and a "Rejected: {reason}" note on `REJECTED` ones. Approve/Reject controls are shown only to an approver who is not the entry's own submitter - both the UI and the service layer enforce this independently.

# Bank reconciliation: statement import and matching (2026-08-31)

The instant, no-import path (`completeReconciliation()`: pick an account and period, type in the statement's closing balance, done in one step) is untouched and still exists on the Cash and bank page for anyone without a statement file to hand. This track adds a second, draft-based path alongside it, extending the reconciliation contract rather than replacing it.

**Draft reconciliations.** `createDraftReconciliation()` creates (or, called again for the same account/period, returns) an `AccountingReconciliation` row in the schema's existing but previously-unreachable `DRAFT` status, with placeholder zero balances - the real `statementBalance`/`ledgerBalance`/`difference` are only computed once the import is actually completed. A `P2002` collision with an already-`COMPLETED` reconciliation for that exact period surfaces as a clear `ReconciliationStateError`, not a raw constraint error.

**CSV import.** New `src/lib/csv-import.ts` - `parseCsv()` (backed by the `csv-parse` package, a real dependency rather than a hand-rolled RFC4180 parser given this feeds financial-record creation), `findColumn()`, and `mapCsvRows()` - is a generic primitive shared by every CSV-driven import in Accounting, not only bank statements. "Column mapping" is v1-simplified to automatic header-name detection rather than an interactive drag-and-drop step: `findColumn()` matches a header against a list of case-insensitive aliases (e.g. a date column matches "date", "transaction date", "posting date", or "value date"), which handles the Ghana-bank-export header variance the plan called out without the added UI surface of a manual mapping wizard. A statement's amount can come from one signed `amount`-like column or from separate debit/credit-like columns (`amount = credit - debit`, matching a bank statement's own convention that a credit is money in). `mapCsvRows()` collects a per-row error instead of aborting the whole file on the first bad row.

**Idempotent re-import.** `AccountingBankStatementLine` carries `sequenceInFile`, its 0-indexed position in the source CSV, and a `@@unique([reconciliationId, sequenceInFile])` constraint. Re-uploading the exact same file re-parses to the same row-to-sequence mapping, so `importBankStatementLines()`'s `createMany({skipDuplicates: true})` silently skips every row the second time - genuinely distinct same-day, same-amount transactions within one import still get distinct identities since they land on different sequence numbers.

**Auto-suggest matching.** `suggestReconciliationMatches()` is computed fresh on every page load, never persisted, so a suggestion can never go stale against a match or correction made a moment earlier. For each `UNMATCHED` statement line it looks for an unclaimed, `POSTED` journal line on the same account, within the period plus a 3-day pad, whose `debit - credit` exactly equals the statement line's signed amount (positive = money in, matching a debit-normal asset account); if no exact match exists, it falls back to a match within a small tolerance (`0.01`, e.g. a bank fee shaving a few pesewas off the posted amount) - exact is always preferred over tolerance when both exist. A journal line already claimed by one suggestion in the same pass is never offered to a second statement line. The manager confirms or ignores each line from the reconciliation workspace (`/app/accounting/reconciliations/[reconciliationId]`, `accounting.reconciliations.manage`); confirming sets the statement line `MATCHED` with `matchedJournalLineId` (a `P2002` on that column's uniqueness - a concurrent double-match - surfaces as the same clear state error), ignoring sets it `IGNORED`.

**Completion.** `completeDraftReconciliation()` closes a draft with the exact same `statementBalance - ledgerBalance` math `completeReconciliation()` already uses. An unmatched statement line was never posted anywhere, so it simply has no effect on the ledger balance and correctly keeps the difference non-zero until a human resolves it - post the missing entry from its originating workflow, or ignore a bank-only line like an unposted fee.

**Important files**: `prisma/schema.prisma`, `prisma/migrations/20260831190000_accounting_bank_statement_reconciliation/`, `src/lib/csv-import.ts` (new), `src/modules/accounting/service.ts`, `src/app/app/accounting/cashbook/{page.tsx,actions.ts}`, `src/app/app/accounting/reconciliations/[reconciliationId]/{page.tsx,actions.ts}` (new), `test/accounting-bank-reconciliation.test.ts` (new), `test/csv-import.test.ts` (new).
