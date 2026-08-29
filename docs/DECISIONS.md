# Architecture & Tooling Decisions

## 2026-08-29 - The manual-payment collection form only shows a dropdown where there's a real choice

**Decision:** In `DriverCollectionForm` (`src/app/app/fleet/driver-portal/collection-form.tsx`), the "Assigned vehicle," "Payment obligation," and "Active Work & Pay contract" fields render as a plain read-only value (backed by a hidden input for form submission) whenever there is only one eligible option, and fall back to the existing `<select>` only when there are genuinely two or more.

**Why:** Direct user feedback on the shipped form: a driver with one vehicle and one obligation type saw two dropdowns styled with a chevron, implying a choice, when there was nothing to choose. In practice a driver is assigned exactly one vehicle, so the vehicle field almost always has one option; the obligation-type field has one option unless that vehicle also has an active Work & Pay contract; the contract field has one option unless a vehicle somehow has more than one active contract. A dropdown that always resolves to its only option is worse than plain text - it invites an unnecessary click and implies a decision the driver isn't actually making.

**How it's applied:** Each of the three fields checks its own option count (`eligibleVehicles.length > 1`, `typeOptions.length > 1`, `vehicle.contracts.length > 1`) rather than assuming a fixed cardinality - the component's existing types already model vehicles and contracts as arrays (matching how the rest of the Driver Workspace treats them elsewhere), so the fix degrades gracefully to a dropdown again if a driver ever legitimately has more than one option, rather than hard-coding "always exactly one" and breaking if that assumption changes.

## 2026-08-29 - Trend charts filter on a new `existedYet` period flag, not just `existsSince`

**Decision:** `ObligationPeriod` (`src/modules/fleet/driver-obligations.ts`) gained an `existedYet: boolean` field, and both Phase 4 trend charts (due-vs-paid in `ObligationCard`, balance-remaining-over-time in the Work & Pay tab) filter their chart data on it before building series, in addition to whatever the existing `isOverdue`/`isOnTime` guarding already did.

**Why:** Phase 3's `existsSince` guard (see the Phase 3 entry below) stops a freshly assigned vehicle or contract from showing fake *overdue* history, but it only ever gated `isClosed` (and, transitively, `isOverdue`/`isOnTime`) - it never touched `expectedAmount`, which is a constant per period regardless of whether the obligation existed yet. Wiring a due-vs-paid trend chart straight off `summary.periods` therefore reproduced the exact failure mode Phase 3 had already fixed once, in a new place: a same-day-assigned vehicle would show a flat "due GHS 200" line stretching back across the whole 6-period trailing window, days before it was ever assigned. This was caught by browser-testing a same-day-assigned scratch case before shipping, not by the unit or integration suites (neither exercises the new chart-building code, only the pure summary math).

**How it's applied:** Charts filter `periods.filter((p) => p.existedYet)` before mapping to chart data, and render nothing (no chart, no misleading single-point line) when fewer than two real periods remain - a one-point trend isn't informative. `existedYet` itself is `existsSince === null || periodEnd >= existsSince`, computed once per period and exposed alongside the existing flags rather than re-derived by each consumer.

## 2026-08-29 - "Outstanding balance" on the Driver Overview means due-now plus overdue combined, not a third independent figure

**Decision:** The Driver Workspace Overview's 8 KPI tiles interpret "outstanding balance" as `dueNow + overdueAmount` - a "everything you currently owe, right now" bottom-line figure - rather than inventing a separate stored balance concept for periodic remittance obligations.

**Why:** The redesign brief listed 8 KPIs including both "outstanding balance" and "Work & Pay amount remaining" as separate items, but Fleet's vehicle remittance has no independent "outstanding balance" concept beyond its own due-now/overdue split - a missed daily remittance doesn't accrue as standing debt the way a loan balance does, it simply becomes an overdue period. Treating "outstanding balance" as its own from-scratch concept would have meant inventing a definition with no basis in how the obligation actually works. Reading it as the sum of the two figures already computed (due now, overdue) turns three tiles into three genuinely distinct, non-redundant numbers instead of two meaningful figures and one duplicate.

**How the boundary is preserved:** `outstandingTotal = obligations.totals.dueNow + obligations.totals.overdueAmount`, computed directly in `driver-portal/page.tsx` from the existing Phase 1 `getFleetDriverObligations()` totals - no new derived-logic function needed, since both inputs already exist.

**Not done (and deliberately so):** No new field or column tracking a running "balance owed" for remittance obligations - Work & Pay already has exactly that (`FleetWorkAndPayContract.outstandingBalance`, a real lifetime figure) and stays completely separate, shown as its own "Work & Pay remaining" tile.

## 2026-08-29 - Fleet's due-date/overdue/on-time-rate concept is derived entirely at read time, with no schema change

**Decision:** `src/modules/fleet/driver-obligations.ts` computes "amount due now," "overdue amount," "next due date," and "on-time rate" purely from `FleetDriverPaymentSubmission` history, anchored on the same periodic (DAILY/WEEKLY) schedule `submitFleetDriverPayment` already uses - nothing is stored. `computeObligationSummary()` is a pure function (no DB access) taking a schedule type, an expected amount, and a caller-supplied list of submissions; `getFleetDriverObligations()` is the thin DB-facing wrapper that fetches a bounded 60-day window and calls it once per vehicle and once per Work & Pay contract. On-time is keyed on the driver's own `paymentDate`, never the manager's later review/approval timestamp.

**Why:** Fleet has no due-date column anywhere - `FleetVehicle.salesTargetPeriod`/`salesTargetAmount` and `FleetWorkAndPayContract.paymentSchedule`/`scheduledPaymentAmount` are both purely periodic. Installment's closest analog (`getEffectiveAccountStatus`, a whole-contract `expectedEndDate` vs. now) doesn't transfer, since Fleet's obligation recurs every period rather than having one lifetime end date. Accounting's `AccountingInvoice.dueDate` + `sweepOverdueInvoices()` sweep-on-read pattern is closer in spirit but assumes a real stored due date to sweep - Fleet has nothing to sweep, so the read-time derivation has to reconstruct the schedule from scratch using the same `salesPeriod()`-shaped boundary math already proven correct in `submitFleetDriverPayment`. Keying on-time on `paymentDate` rather than review time was a deliberate call: a manager who is slow to approve a submission must never cost the driver their on-time record for something entirely outside their control.

**How the boundary is preserved:** The trailing window is fixed at 6 periods (6 days for DAILY, 6 weeks for WEEKLY) rather than an unbounded historical scan, matching the existing bounded-window convention already used for Fleet's own trend charts. A period only becomes "overdue" once the calendar day after `periodEnd` has actually started (`periodDeadline = periodEnd + 1 day`) - checking `now > periodEnd` directly would have marked every DAILY obligation "overdue" for the entire remainder of its own due day, since `periodEnd` for a daily period is midnight of that same day, not end-of-day.

**Not done (and deliberately so):** No new Prisma model or column - this stays a pure derived-at-read-time layer specifically to avoid a migration for a feature that has no need to persist anything. No cron/sweep job either, unlike Accounting's invoice sweep - there's nothing stored to go stale, so every read is already fresh.

## 2026-08-29 - A Driver's vehicle-remittance and Work & Pay trends are shown as two separate series, never summed

**Decision:** `getFleetDriverTrends(organizationId, { vehicleIds, contractIds })` (`src/modules/fleet/service.ts`) returns `{ vehicleRevenue, workAndPay }` as two independent trend series, each bucketed by day/week/month like every other trend chart in the app. The Driver Workspace renders them as two tabs, and only shows the Work & Pay tab at all when the driver actually holds an active contract.

**Why:** A user bug report distinguished these explicitly - "he can see insights or trends of his revenue generated for the org... and if its work and pay, insight or trend of his work and pay contract, not what the org's admin sees." Vehicle remittance and a Work & Pay instalment are different obligations on different schedules against different targets; summing them into one number would make neither figure legible to a Driver deciding what they still owe versus what they've already remitted.

**How the boundary is preserved:** `getFleetDriverTrends` mirrors the existing `getFleetInvestorTrends` filter-by-`relatedEntity`/`relatedEntityId` pattern (`FleetPayment` has no `driverId` column, only a polymorphic pointer to `FleetVehicle` or `FleetWorkAndPayContract`), but takes the caller's already-known vehicle/contract ID sets as input instead of re-querying `fleetDriver.findFirst`, since `driver-portal/page.tsx` already has this data from `getFleetDriverWorkspace`.

**Not done (and deliberately so):** No combined "total revenue" figure was added anywhere in the Driver Workspace - the point of the split is that a Driver's two obligations stay visually and numerically distinct.

---

## 2026-08-27 — Every displayed money amount routes through one shared `formatMoney()`, keyed to `Organization.currency`

**Decision:** A new `src/lib/currency.ts` exports `formatMoney(value, currencyCode?)`, which formats a `Prisma.Decimal | number | string` through `Intl.NumberFormat("en-GH", { style: "currency", currency: code })`, falling back to `"GHS"` when no code is given or the given code is invalid. Every page/component across Accounting, POS, Payroll, Installment, Procurement, Fleet, Hotel, Hospital, Hostel, CRM, Analytics, Inventory, and HR that displays a monetary amount now calls this function (or a file-local `money()` wrapper that closes over the tenant's currency) instead of a bare `.toFixed(2)`. Input fields that feed a value back into form submission (`defaultValue` on a `type="number"` input) are deliberately left as raw numeric strings - only their `<Label>`/placeholder text gets a currency hint (e.g. "Selling price (GHS)").

**Why:** An audit prompted by a user report ("wherever there's money, make sure its having the currency indicated with it") found ~70 files rendering a bare number with no currency symbol or code, most visibly the Pharmacy dispensing receipt (5 unlabeled figures on a customer-facing printed receipt). Fixing each call site with its own ad hoc string concatenation would have re-introduced the same inconsistency the audit was fixing; one shared function keeps every organization's own `currency` field (`Organization.currency`, effectively "GHS" by convention wherever unset) as the single source of truth for how its money renders everywhere in the app.

**How the boundary is preserved:** Three modules already had their own correct, pre-existing pattern and were deliberately left alone rather than forced onto the new helper, to avoid two visually different money formats appearing in the same file: Fleet's existing inline `` `${tenant.organization.currency ?? "GHS"} ${value.toFixed(2)}` `` convention was extended to its few remaining gaps instead of replaced; School's own `src/components/school/format.ts` `formatMoney` (hardcoded to GHS, since School has no per-organization currency setting) was left untouched; Platform's super-admin dashboard keeps its own multi-currency-aware local `formatMoney`, since it aggregates revenue across organizations that can each have a different currency. A small number of service-layer thrown error messages (`InvalidPaymentError`, `MinimumDepositError`) call `formatMoney(value)` with no currency argument (defaulting to GHS) rather than threading a full organization fetch into functions that only receive an `organizationId`.

**Not done (and deliberately so):** No currency-conversion logic - `formatMoney` only formats a number for display in whatever currency code it's given; it never converts between currencies. No change to how money is stored (still `Prisma.Decimal` / numeric-string columns throughout) or how it's serialized in API/database write paths - only display call sites were touched.

---

## 2026-08-27 — Per-module SMS notifications fire after the transaction commits, and read module-level settings scoped to the same entity the settings already belong to

**Decision:** Every Phase 3 SMS trigger (Pharmacy's dispense-ready text, Hotel's booking confirmation, Payroll's payslip notice, Hospital's appointment reminder) sends its SMS as a separate step after the write it's reporting on has already committed - never inside the `db.$transaction` that creates the record. Each trigger also reads its module's existing settings model at whatever granularity that model already uses: `HotelSettings`/`HospitalSettings` are per-property/per-facility (`propertyId`/`facilityId @unique`), so the SMS check reads the specific property/facility's settings, not an organization-wide one; `PharmacySettings`/`PayrollSettings` are per-organization, so those checks are a plain per-org lookup.

**Why:** `sendSms()` makes a real network call to mNotify and then a further database write of its own (`SmsMessage`) - holding either of those inside an already-open transaction would extend a lock/connection for the duration of an external HTTP round trip, and a transient mNotify failure would roll back a dispense, reservation, or payroll run that had otherwise fully succeeded. Notifying a customer is not a condition of the underlying operation succeeding. Separately, `HotelSettings`/`HospitalSettings` were already modeled per-property/per-facility before this phase (a hotel chain's or hospital group's individual locations can already run different check-in times, numbering prefixes, and verification policies) - introducing an organization-wide SMS toggle for those two modules specifically would have been a new, inconsistent granularity alongside every other setting on the same model.

**How the boundary is preserved:** Each trigger function captures its transaction's result first, then performs the settings/phone lookup and `sendSms()` call as plain awaited statements afterward - `sendSms()` itself never throws (Phase 1's contract), so no additional try/catch is needed to protect the caller. Hotel's `createHotelReservation()` and Payroll's `processRun()` already had the relevant settings object in hand from an existing query (`property.settings`, the top-of-function `settings` fetch) with no extra read; Pharmacy's `dispense()`/`approveControlledDispense()` do one small extra post-commit read (settings + patient) since a controlled-drug approval and an immediate OTC completion don't already have a patient object in scope at that point.

**Not done (and deliberately so):** No retry or dead-letter queue for a failed SMS - a `FAILED` `SmsMessage` row is the entire failure record, exactly like Phase 1's original design. No batching (mNotify's `recipient` field accepts an array, but each notification here logs against one specific record via `relatedId`, which the codebase's existing dedup/audit convention keeps to one row per send).

---

## 2026-08-26 — SMS 2FA gets its own verified phone field, separate from the general contact phone

**Decision:** `User.twoFactorPhone` is a new field, distinct from the existing `User.phone`. SMS 2FA codes - at login, and when confirming enrollment or disablement - are only ever sent to `twoFactorPhone`, and it is only ever set by `confirmSmsTwoFactorSetup` after a code sent to that exact number has been verified. Editing the general `phone` field (on the account page) never touches it.

**Why:** `User.phone` is free text with no verification, editable any time from the account page. If SMS 2FA codes were sent to `phone` directly, editing that field - including by an attacker who has already obtained the account's password and is trying to defeat 2FA before it locks them out - would silently redirect where the next login code goes, to a number the legitimate owner never saw or approved. That would make SMS 2FA strictly worse than no 2FA at all in exactly the scenario 2FA exists to stop.

**How the boundary is preserved:** Enrollment (`beginSmsTwoFactorSetup`) takes a phone number from its own form field (defaulting to, but not silently trusting, the profile's current `phone`), sends a verification code to it via `issueSmsOtpChallenge`, and only writes it to `twoFactorPhone` once `confirmSmsTwoFactorSetup` confirms the matching code - and it reads the number back from the challenge row itself (`consumeSmsOtpChallenge`'s return value), never from the form, so there's no path where an unverified number reaches the field. `twoFactorMethod` (`TOTP | SMS`) is single-valued per account - switching methods requires disabling the current one first via the existing `disableTwoFactor` flow, which itself requires a fresh code (a `DISABLE`-purpose challenge, via `requestDisableSmsCode`) rather than trusting a stale one.

**Not done (and deliberately so):** No re-verification is required periodically after enrollment - `twoFactorPhone` is trusted indefinitely once verified, same as how a TOTP secret is trusted indefinitely once its setup code is confirmed. `phoneVerifiedAt` is not cleared on disable (it's a historical "was this number ever verified" marker, not a live gate), but `twoFactorPhone`/`twoFactorMethod` are, so a fresh enrollment always re-verifies from scratch regardless.

---

## 2026-08-26 — SMS delivery gets its own audit-log model, not the existing Notification model

**Decision:** `SmsMessage` is a new, dedicated model for every SMS this app sends (`src/lib/sms.ts`'s `sendSms()` writes one row per attempt, success or failure). `NotificationChannel.SMS` - an enum value that has existed since the schema's early design but was never read or written anywhere - stays permanently unused.

**Why:** `Notification` (`src/app/app/(overview)/notifications/page.tsx`) is queried with no `channel` filter at all - every row, regardless of channel, renders in the tenant's in-app bell. SMS recipients (a `PharmacyPatient`, `HotelGuest`, `HrEmployee`, or a future marketing-blast contact) have no `userId`, so an SMS-audit `Notification` row would have to be `userId: null`, which means it would show up as an org-wide bell entry visible to every staff member - one entry per prescription-ready text, per appointment reminder, per marketing-blast recipient. A 50-recipient send would flood the bell with 50 entries nobody asked to see. `NotificationStatus` also includes `READ`, which doesn't map onto an SMS with no read receipt.

**How the boundary is preserved:** `SmsMessage` carries its own `SmsMessageStatus` (`SENT | FAILED`), a `purpose` string (e.g. `PHARMACY_PICKUP_READY`), and an optional `relatedType`/`relatedId` pair. The pair exists specifically so a schedule-based sender (the planned Hospital appointment-reminder cron) can ask "has a reminder already gone out for this appointment" by querying the log, instead of adding a `reminderSentAt` column to `HospitalAppointment` itself - the same dedup idea already used elsewhere (Fleet's document-renewal notifications compare a `renewalStatus` value), just applied against a log instead of a source-row column.

**Not done (and deliberately so):** No delivery-status polling against mNotify's own `/status/<id>`/`/campaign/<id>/<status>` endpoints - `SmsMessage.status` reflects only whether the initial API call succeeded, not whether the carrier actually delivered the message. `providerResponse` keeps mNotify's raw response (including its campaign `_id`) for future use if delivery-status polling is ever built, but nothing polls it today.

---

## 2026-08-24 — Inventory items read Accounting's tax codes for their default sales tax

**Decision:** `InventoryItem` gained an optional `taxCodeId` pointing at Accounting's `AccountingTaxCode`. Inventory's `createItem`/`updateItem` validate it with a new `requireTaxCode()` that calls Accounting's already-public `listTaxCodes(organizationId)` — never a direct `db.accountingTaxCode` query from Inventory's service layer.

**Why:** The Items form was extended toward a fuller product model (product type, sales price separate from cost price, POS/Purchasable availability flags, tags) after the user asked for feature parity with a competitor's product form. A default sales tax on the product itself is part of that, and Accounting already owns a complete, effective-dated, auto-seeding tax-code system (`src/modules/accounting/tax-service.ts`) — building a second, Inventory-owned tax concept would duplicate it.

**How the boundary is preserved:** `requireTaxCode()` only checks that the given id belongs to the organization (via `listTaxCodes`, the same function Procurement's supplier-invoice form already uses for its own tax picker) — it does not check whether the code is effective *today*, since an item's default tax is a standing catalogue setting, not a dated transaction; effective-dating is enforced separately, at whatever future point something actually posts tax evidence using this field. Selection works identically whether or not the organization has activated Accounting (confirmed existing precedent: Procurement's own tax-code picker is gated only on `requireModuleAccess("procurement")`, not on Accounting's activation) — only *posting* into Accounting's ledger is module-activation-gated, and nothing posts using this field yet.

**Not done (and deliberately so):** POS does not yet compute or post per-line VAT/NHIL/GETFund evidence using an item's `taxCodeId` — this field is a foundation for that (closing a gap `docs/TAX_AND_STATUTORY_REPORTING.md` already names: POS is one of the eight revenue modules that still posts gross revenue only), not the posting integration itself. That remains a separate, larger piece of work.

---
## 2026-08-29: One Paystack integration with tenant subaccount settlement

Rock Frost uses one platform Paystack integration. Tenant operational collections are routed using Paystack subaccounts. Tenants do not supply secret credentials. Platform subscription revenue and tenant operational revenue have separate payment records, beneficiaries, and Accounting flows. Version 1 settles operational collections to the organization Settlement Account and does not pool tenant funds inside Rock Frost.

## 2026-08-22 — Every write path that finalizes a module's revenue must post to Accounting, not just the first one wired

**Decision:** Audited all eight revenue-generating modules (Fleet, Pharmacy, Hospital, POS, Installment, Hostel, Hotel, School) for every code path that finalizes a confirmed-revenue record, not just the one already wired to `postModuleRevenue()`. Fixed three gaps in Fleet (a driver-submission approval, a Work & Pay deposit at contract creation, and an office-recorded Work & Pay instalment all created a VERIFIED `FleetPayment` — and moved the Fleet dashboard total — without ever posting to Accounting), a live correctness bug in Pharmacy (a controlled-drug dispense posted revenue when merely *requested*, before maker-checker approval completed it, and a subsequent rejection never reversed that phantom entry), and two gaps in Installment (an account-opening deposit, and a payment amount edited within its edit window). POS's `refundSale()` is documented but left unwired — it has zero live callers today (test-only), so there is no action-layer call site to wire yet. Hospital, Hotel, Hostel, and School each have exactly one revenue-finalizing code path and were confirmed already fully wired; no changes were needed there.

**Why:** The user's own framing made the actual requirement explicit: "the total revenue of a module should reflect in the accounts module" — not "the module posts from wherever the original integration happened to hook in." The 2026-08-21 entry below implemented posting from one call site per module, verified by that module's Reports/dashboard page. That is not the same guarantee as the module's *total* reconciling with Accounting: a module can have (and, in Fleet's and Installment's case, does have) more than one write path that changes its own recognized-revenue total, and only the first one anyone found got wired. This was discovered concretely when the user asked whether a driver recording a sale and the Fleet dashboard total changing would reflect in Accounts — it didn't, because driver-submission approval is a separate code path from the office-verified-payment path the original integration wired.

**How the boundary is preserved:** No new cross-module coupling — the fixes are additional calls to the same `postModuleRevenue()`/`postModuleRevenueRefund()`/`reverseModuleRevenue()` helpers at the Server Action layer, after each module's own transaction commits, exactly matching the pattern in the entry below. One genuinely new primitive was added: `reverseAllModuleRevenueForSource()` (`src/lib/accounting-integration.ts`), which reverses every currently-POSTED entry for a source record regardless of `postingPurpose`. It exists because `postSourceJournalEntry()`'s uniqueness tuple (`organizationId, sourceType, sourceId, postingPurpose`) is never freed by a reversal, so a correction to an already-posted source can't reuse the original purpose — Installment's payment-amount-edit fix posts each correction under its own `` `ADJUSTED_${payment.updatedAt.getTime()}` `` purpose rather than reversing and reposting under "COLLECTED" (which would silently collide and do nothing). Deleting a payment now reverses the original entry and every correction entry together, so nothing a deleted record ever posted is left standing.

**Not done (and deliberately so):** `HirePurchaseCredit`'s `markCreditRefunded()` — real cash paid back to a customer against previously-collected installment revenue — is not wired to `reverseModuleRevenue()`/`postModuleRevenueRefund()`. Whether and how much that should reduce recognized module revenue is a business judgment (a credit's source can span multiple original payments) that needs the user's call, not an inferred one; flagged in `OPERATOR_HANDOFF.md` as an open follow-up rather than implemented speculatively. No backfill was run against historical data — driver-submission approvals, Work & Pay payments, and controlled-dispense approvals that happened *before* this fix may not have posted to Accounting at the time; this fix is correct going forward, not retroactive, and reconciling historical drift is a separate, explicitly-confirmed action against production financial records, not something to do silently as part of a code fix.

---

## 2026-08-21: Active internal memberships create missing HR employee identities

**Decision:** When Human Resources & Payroll is enabled, an active internal organization member must have one linked `HrEmployee`. Creation occurs at invitation acceptance, active role assignment, member reactivation, HR module activation, and a compatibility backfill on the HR employee register. `Vehicle Owner` and `Investor` remain external stakeholder identities and are excluded.

**Why:** Organization membership establishes authenticated access and role permissions, while HR owns employment records. Leaving these disconnected forces administrators to create the same person twice and causes Payroll and HR workflows to miss valid staff. Linking the identity at the shared Administration boundary removes that operational gap.

**How the boundary is preserved:** The synchronization calls HR's public service, checks the HR entitlement inside the transaction, scopes every query by organization, uses a PostgreSQL advisory lock, and creates only a missing record. It never overwrites HR-managed employment data. The created status history and tenant audit event state that the source was an organization membership. Other module pages do not query or display HR records.

---

## 2026-08-21 — Revenue-generating modules post confirmed revenue into Accounting

**Decision:** Every module whose core workflow collects real money — Fleet (verified payments), Pharmacy (completed dispensing), Hospital (invoice payments), POS (sales), Installment (payments), Hostel/Hotel/School (fee payments) — now posts a Debit-Cash/Credit-[Module]-Revenue journal entry into Accounting at the exact moment that module already treats the money as confirmed (a manager verifying a Fleet payment, a dispensing completing, an invoice payment being recorded, a sale completing). This is built on top of `codex/accounting-foundation`'s `postSourceJournalEntry()` (idempotent per organization+sourceType+sourceId+postingPurpose, period-lock aware) and reverses via its `reverseJournalEntry()` when the underlying event is later invalidated (a verified Fleet payment rejected, a dispensing reversed, a POS sale refunded, an Installment payment deleted).

**Why:** Before this, each module kept its revenue entirely in its own tables — Accounting had no visibility into money collected anywhere else in the platform, so an organization running e.g. Fleet and Accounting side by side saw a financial statement that never reflected the Fleet revenue actually being collected. This was flagged directly by the user: "why is Fleet revenue not recorded in accounts," after confirming Accounting genuinely had no cross-module posting anywhere in the codebase. `docs/ACCOUNTING_MODULE.md`'s own "Module integration contract" (added by the accounting-foundation branch) already names these exact modules as expected callers of `postSourceJournalEntry()` — this is that contract's first implementation, not a new design.

**How the boundary is preserved:** A new shared helper, `postModuleRevenue()`/`reverseModuleRevenue()` (`src/lib/accounting-integration.ts`), is the only thing any source module calls — none of the eight modules reach into Accounting's Prisma models directly, matching the exact discipline already established for Procurement/POS → Inventory below. Every call happens from the Server Action layer, after the source module's own transaction has already committed (`postSourceJournalEntry()` always opens its own transaction and is not composable inside another module's — see the file's own top-of-file comment), so a module's real business event (money collected) can never be rolled back by an Accounting failure; reliability comes from `postSourceJournalEntry()`'s idempotency (a retried post is always safe), not from cross-module atomicity. **The integration is conditional on the organization having actually activated Accounting** (`isModuleActiveForOrg()`, mirroring `src/lib/offline-sync/auth.ts`'s existing subscription-gating logic) — a source module's own operation always succeeds and is never blocked, delayed, or altered by Accounting being unsubscribed, misconfigured, or unreachable; a failed or skipped post is caught and logged, never thrown.

**Revenue by source, for manager visibility:** Each module gets its own system Revenue account (Fleet Revenue `4100`, Pharmacy Revenue `4200`, Hospital Revenue `4300`, POS Revenue `4400`, Installment Revenue `4500`, Hostel Revenue `4600`, Hotel Revenue `4700`, School Revenue `4800`) — see the account-timing correction below for when these are actually created. The chart of accounts only grows for modules an organization actually has activated. Accounting's Reports page (`src/app/app/accounting/reports/page.tsx`) gained a "Revenue by source" card: a per-account balance breakdown plus a recent-postings table (date, source module, description, posting number, amount) so a manager can trace any total back to the specific module and record that produced it, addressing the second half of the same request.

**Corrected 2026-08-21 (later same day) — account creation moved from lazy to eager:** The line above originally read "auto-provisioned on first use" — the account only came into existence the moment a module's first real transaction posted. The user reviewed this and rejected it: a revenue account that doesn't exist until the first sale happens is confusing (a manager activates Fleet, opens Accounting, and Fleet Revenue is simply absent until someone gets paid), and does not match how real accounting/ERP systems provision a chart of accounts ahead of transactional need. The fix is `ensureRevenueAccountsForOrg()` (`src/lib/accounting-integration.ts`), called from every module-activation call site (`finalizeActivation()` in `src/platform/subscriptions/service.ts`, `updateModuleRequest()` in `src/platform/module-requests/service.ts`, and the platform operator's module toggle in `src/app/app/platform/actions.ts`) inside the same transaction as the activation write: for every revenue-generating module currently active for the organization, it ensures that module's Revenue account already exists, provided Accounting itself is active too. It runs unconditionally on every module activation regardless of which module was just enabled, which means activating Accounting itself on an organization that already has other revenue modules running backfills every one of their accounts in that same call, not just modules activated afterward. `postModuleRevenue()`'s original lazy on-first-use creation is kept as an idempotent safety net (for any organization that activated a revenue module before this correction existed, or any activation path not yet covered), not removed.

**Not done (and deliberately so):** Payroll and Procurement still do not post to Accounting (unchanged from the entries below) — those are expense/liability-side integrations (a payroll run, a purchase order received) rather than revenue, and were out of the scope of what was asked. A verified-then-rejected Fleet payment, a reversed Pharmacy dispensing, a refunded POS sale, and a deleted Installment payment all reverse their posted entry; Hospital/Hostel/Hotel/School fee payments currently have no equivalent "undo" pathway in their own service layers, so no reversal call site exists for them yet — if one is added to those modules later, it should call `reverseModuleRevenue()` the same way. See `OPERATOR_HANDOFF.md`'s dated entry for exact files, validation, and what was not executed.

---

## 2026-08-14 — Inventory & Procurement consolidated as one customer-facing product; linked receiving now requires a warehouse

**Decision:** Inventory and Procurement are presented to tenants as one product, "Inventory & Procurement" — a shared sidebar navigation and a combined overview at `/app/inventory` (see `docs/INVENTORY_PROCUREMENT_CONSOLIDATION.md`). This is presentation only: the two modules keep their own route trees, permission prefixes, database tables, and service functions, unrenamed. Separately, `receiveOrderLine()` (`src/modules/procurement/service.ts`) now throws `WarehouseRequiredError` if a purchase order line linked to a real `InventoryItem` is received without a warehouse, rather than silently marking the line received while never touching Inventory. A non-stock line (no linked item) is unaffected and still requires no warehouse.

**Why:** The original 2026-07-20 Procurement/Inventory integration decision (below) described "no warehouse selected at receiving time" as an accepted no-op alongside "no linked item," treating both as reasons a receipt might legitimately not touch Inventory. That conflated two different situations: an order for a service or untracked item genuinely has no inventory consequence, but an order for a *real, linked* item with no warehouse chosen is an operator omission, not a valid non-stock order. Letting it through silently meant a purchase order could read as fully received with no `InventoryStock` row ever updated — a real correctness gap, not a deliberate feature.

**How the boundary is preserved:** The fix is a pre-condition check inside `receiveOrderLine()` itself, before any write — it does not change how Procurement calls Inventory (still only `recordMovement()`, still inside the same transaction as the line/order status update). `docs/DECISIONS.md`'s 2026-07-20 Procurement entry is amended in place to point here rather than being silently rewritten.

**Not done (and deliberately so):** No change to the module registry, entitlements, subscription/pricing catalogue, or permission prefixes — those remain centrally owned and are tracked separately for whoever owns that follow-up.

---

## 2026-08-03 — Vercel previews never apply database migrations

**Decision:** `npm run vercel-build` runs `prisma migrate deploy` only when `VERCEL_ENV=production`; preview builds compile the application without mutating a database. Production retains the migration-before-build gate.

**Why:** Preview database integrations may not expose a direct migration URL, and a feature-branch preview must never apply schema changes to a shared or production database. Real migration behavior is proven first by GitHub Actions against disposable PostgreSQL, then applied once during the production release.

## 2026-08-03 — Hotel and School are operational vertical suites

**Decision:** Promote Hotel and School to available modules after implementing their schema, services, RBAC, tenant isolation, navigation, workflows, reports, settings, migration, and tests. Restaurant charges are posted to Hotel folios within the same transaction as the order; School examination results move through explicit open, moderation, and published states.

**Boundary rule:** The vertical modules own vertical operational records. Existing shared modules remain independent; future external channel adapters and automated payroll posting must use public service boundaries rather than querying another module's tables.

This is the authoritative decision log for the rebuilt Rock Frost Business Suite. Record every consequential technical decision here, in date order, newest first. Do not silently reverse a decision recorded here — supersede it with a new dated entry explaining why.

---

## 2026-08-03 — Hotel and School are staged vertical suites

**Decision:** Add Hotel Management and School Management to the product registry
as `coming-soon` and to the platform module catalog seed for acquisition, then deliver them through the bounded releases and completion
gates in `docs/HOTEL_AND_SCHOOL_MODULES.md`. They must not be marked available,
made tenant-accessible or receive a permission prefix until their first
operational release passes schema, RBAC, state-transition, isolation, migration,
test, and documentation checks.

**Why:** Both requested verticals contain multiple dependent domains and
regulated/sensitive data. Registering the roadmap supports acquisition now,
while fail-closed availability prevents placeholder pages or incomplete financial
and academic workflows from being sold as production-ready.

**Boundary rule:** Future Hotel restaurant/channel and School workforce/payroll
integrations call existing module services behind explicit adapters. They do not
query POS, Inventory, Accounting, HR, or Payroll tables directly.


## 2026-07-20 — POS sales post real Inventory stock movements (ISSUE on sale, RECEIPT on refund)

**Decision:** When a POS sale includes a line linked to a real `InventoryItem`, and the selling register has a linked `InventoryWarehouse`, `createSale()` (`src/modules/pos/service.ts`) calls Inventory's own `recordMovement()` with `type: "ISSUE"` to post a real stock decrease. Refunding that sale (`refundSale()`) reverses it with a `type: "RECEIPT"` call. This is the same deliberate, documented cross-module integration pattern established for Procurement's receiving flow (see this file's Procurement entry above) — a checkout that doesn't actually move stock isn't a real point-of-sale flow.

**Why:** Same reasoning as Procurement: duplicating Inventory's stock-quantity and validation logic inside POS would be pure duplication, not module independence, and a sale with no real inventory consequence would just be a form.

**How the boundary is preserved:** POS only calls Inventory's public service functions (`recordMovement`, `getStockGrid`) — it never touches Inventory's Prisma models directly. A register without a linked warehouse, or a sale line without a linked `InventoryItem`, skips the Inventory call entirely (POS supports selling untracked items/services, same as Procurement supports ordering them).

**Known limitation, accepted for this pass:** a multi-line sale checks stock availability for every line up front (via `getStockGrid`) before posting any movement, but each line's `recordMovement()` call is still its own independent transaction — under concurrent access to the same item, a race between the pre-check and the actual decrement is possible. This mirrors the same class of limitation already accepted for Procurement's receiving flow; a single cross-module transaction spanning two modules' services was judged not worth the coupling it would require.

**Not done (and deliberately so):** POS does not post anything to Accounting (e.g. Debit Cash / Credit Revenue on a completed sale) in this pass — the same scope decision already recorded for Procurement and Payroll not integrating with Accounting. **Superseded 2026-08-21** (see that entry above): POS sales now post to Accounting via the shared `postModuleRevenue()` helper, one of eight modules wired in that pass.

---

## 2026-07-20 — Procurement receiving posts real Inventory stock movements

**Decision:** When a purchase order line is received on `/app/procurement/orders`, `receiveOrderLine()` (`src/modules/procurement/service.ts`) calls Inventory's own `recordMovement()` (`src/modules/inventory/service.ts`) with `type: "RECEIPT"`, posting a real stock increase into the chosen warehouse — provided the order line is linked to a real `InventoryItem` and a warehouse is selected. This is a deliberate cross-module integration, not a boundary violation, per `docs/MODULE_BOUNDARIES.md`'s "Cross-module data" section, which requires such integrations to be deliberate and recorded here rather than silently added.

**Why:** A purchase order that doesn't actually move stock when received isn't a real procurement flow — it would just be a form with no consequence, the same class of problem this rebuild exists to avoid (see the 2026-07-19 full-rebuild entry). Procurement genuinely needs Inventory's stock-movement logic; duplicating `recordMovement()`'s validation (insufficient/negative-stock checks, the `InventoryStock` upsert-or-create logic) inside Procurement would be pure duplication, not module independence.

**How the boundary is preserved:** Procurement only calls Inventory's public, already-permission-agnostic service function (`recordMovement`) — it never reaches into Inventory's Prisma models directly, and Inventory has no reciprocal dependency on Procurement (it doesn't know purchase orders exist). If the order line has no linked `InventoryItem`, the receipt is tracked on the `ProcurementOrderLine.receivedQuantity` alone and no Inventory call is made — receiving is not required to be tied to real inventory, since some procurement requests are for non-stocked items or services. **Corrected 2026-08-14** (see that entry below): a line that *is* linked to a real `InventoryItem` now requires a warehouse to be received at all — the original version of this decision let that case silently skip the Inventory call too, which is no longer true.

**Not done (and deliberately so):** Procurement does not post anything to Accounting (e.g., an Accounts Payable liability when an order is received) in this pass — see `OPERATOR_HANDOFF.md`'s Phase 12 entry for the same reasoning already applied to Payroll↔Accounting.

---

## 2026-07-19 — UI foundation: shadcn/ui + Radix UI + Tailwind CSS

**Decision:** Use [shadcn/ui](https://ui.shadcn.com) as the component/design-system foundation, built on Radix UI primitives and Tailwind CSS v4.

**License check:**
- shadcn/ui itself: MIT License. No royalties, no attribution requirement, unrestricted commercial use.
- Radix UI primitives (the accessible, unstyled behavior layer underneath): MIT License.
- Tailwind CSS: MIT License.

All three are safe for unrestricted commercial, closed-source use.

**Why this satisfies the project's template requirements:**
1. **License** — MIT across the whole stack; confirmed above.
2. **Commercial use** — explicitly permitted, no restrictions.
3. **Next.js App Router + TypeScript compatibility** — shadcn/ui's primary, officially documented target is Next.js App Router with TypeScript. No adaptation layer needed.
4. **No vendor lock-in** — shadcn/ui is not an installed dependency you import from `node_modules`. Its CLI (`npx shadcn@latest add <component>`) copies component source directly into `src/components/ui/`. Every component is fully owned, readable, and editable code in this repository from day one — there is no black-box package to fight against or wait on upstream for.
5. **Responsive navigation, tables, forms, dashboards** — shadcn/ui ships primitives for all of these: `Sheet` (slide-out drawer, used for mobile sidebar nav), `Table`, `Form` (wraps `react-hook-form` + `zod` resolvers), `Dialog`, `DropdownMenu`, `Command` (command palette / search), `Tabs`, `Card`, `Badge`, `Skeleton` (loading states), `Sonner` (toast notifications), and more — all composable, all Tailwind-styled, all accessible via Radix's ARIA-compliant behavior primitives.

**What this is not:** shadcn/ui is not a purchased or installed "dashboard template." There is no single generic dashboard shell being forced onto the whole product. It is a component toolkit; the actual application structure, navigation architecture, module boundaries, and page layouts are custom-built for Rock Frost on top of it, per `docs/MODULE_BOUNDARIES.md` and `docs/ARCHITECTURE.md`.

**Supporting libraries adopted alongside it (same rationale — MIT, Next.js/TS-native, no lock-in):**
- `react-hook-form` + `zod` (+ `@hookform/resolvers`) — form state and validation, the standard pairing shadcn's own `Form` component is built around.
- `@tanstack/react-table` — headless table logic (sorting, filtering, pagination) paired with shadcn's `Table` primitive for actual markup/styling.
- `lucide-react` — icon set shadcn/ui is designed around; MIT licensed, tree-shakeable.
- `sonner` — toast notifications (shadcn's recommended toast primitive as of Radix's own `Toast` being superseded).

**Explicitly rejected:** installing a pre-built "admin dashboard template" package (e.g. from ThemeForest-style marketplaces) — these typically force a single generic dashboard shell across the whole product, frequently carry non-commercial or attribution-required licenses, and create exactly the vendor lock-in this project's rules prohibit.

---

## 2026-07-19 — Full clean rebuild, previous implementation retired

**Decision:** Retire the entire previous Rock Frost Business Suite implementation (marketing site, dashboard, Fleet module, Hire Purchase/installment module, auth, RBAC — all of it) and rebuild from a clean foundation with enforced module isolation.

**Why:** The previous implementation mixed navigation, data, and presentation across unrelated business modules (Fleet and Hire Purchase/installment management bled into each other's dashboards, navigation, and shared components — e.g. a hardcoded "Fleet Operations" / "Rock Frost Fleet Control" heading rendered on every dashboard page regardless of which module the user was in). Root cause: the previous architecture had no enforced module-boundary concept — modules were pages bolted onto a single shared dashboard shell rather than independent, isolated units within a common platform. Patching individual instances of this bleed (sidebar grouping, topbar labeling) was addressed reactively per-bug rather than preventing the class of bug structurally.

**What was preserved:**
- Full git history (no history rewriting, no `.git` deletion).
- A complete snapshot of the previous implementation on branch `archive/pre-redesign-rfbs` (pushed to origin), and via the ordinary commit history on `main` up to commit `c35c86d`.
- The live Neon Postgres database (schema and data untouched by this rebuild — only application code was replaced; see `docs/DATABASE_STRATEGY.md` for how the new app reconnects to it).
- Environment variable names (recorded in a private, non-committed migration note — values were never printed or committed).
- Approved brand assets (`public/RFG.png`, favicon, apple-touch-icon, OG image, manifest, robots.txt, sitemap.xml).

**What was NOT preserved:** the previous `app/`, `components/`, and `lib/` implementation code, and the previous roadmap/architecture docs (archived under `docs/archive/previous-implementation/`, marked obsolete, not authoritative).
