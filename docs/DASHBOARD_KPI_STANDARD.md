# Dashboard KPI standard

Every customer-facing dashboard must begin with the operational decision it
supports. A primary KPI is acceptable only when its population, time boundary,
source record, formula, refresh behavior, responsible role, guardrail, and
drill-down route are known. Null or incomplete coverage must remain distinct
from a measured zero.

## Shared presentation contract

Dashboards may share cards, charts, empty states, loading states, and the
curved, zigzag, and bar trend modes. Modules are not required to share the same
layout or metrics. Changing a chart mode must not change the query, values,
currency, targets, filters, or date boundaries. Primary outcomes should link to
the records that explain them. Each dashboard should show its effective period
and data freshness.

## School primary definitions

| KPI | Purpose and formula | Source and grain | Drill-down | Guardrail |
| --- | --- | --- | --- | --- |
| Active students | Current enrolled population | `SchoolStudent.status = ACTIVE`, current snapshot, tenant and permitted campus/class scope | `/app/school/students?status=ACTIVE` | Missing active enrollment |
| Attendance rate | Present plus late marks divided by all published marks | `SchoolAttendance`, day and current-term grain | `/app/school/attendance` | Incomplete class registers |
| Published-result completion | Published student results divided by expected result slots when an expectation is available | `SchoolExam` and `SchoolExamResult`, term/exam grain | `/app/school/exams` | Draft and unmoderated results |
| School billed | Issued invoice amount less discount | `SchoolFeeInvoice`, current-term grain | `/app/school/fees` | Draft and void invoices excluded |
| School collected | Confirmed non-refunded payments | `SchoolFeePayment`, received-date grain | `/app/school/fees` | Refunds and failed Accounting postings |
| Outstanding | Billed less confirmed collected | Invoice and payment allocation grain | `/app/school/fees` | Overdue balance and students affected |

Financial KPI visibility requires `school.dashboard_financial.view`. School-wide
breakdowns require `school.analytics.view`. Conduct and medical details are not
dashboard sources.

## Accounting Financial Dashboard primary definitions

`/app/accounting/dashboard`, gated by `accounting.reports.view`. All figures
are scoped to the selected month/quarter/year "to-date" period and compared
against the prior calendar unit capped at the same day offset (e.g. Jan 1-30
vs Dec 1-30, not Dec 1-31) - never against `getAccountingSummary`'s
lifetime-since-inception totals, so the KPI tiles and the tables beneath them
can never disagree.

| KPI | Purpose and formula | Source and grain | Drill-down | Guardrail |
| --- | --- | --- | --- | --- |
| Current income | Revenue recognized in the selected period | `AccountingJournalEntry` REVENUE lines, period grain | `/app/accounting/invoices` | Non-posted (pending approval/rejected) entries excluded |
| Receivables | Outstanding customer balance | `AccountingAccount` code 1100, as-of-today snapshot | `/app/accounting/receivables` | Reflects only the general ledger's own AR account |
| Current expense | Expenses recognized in the selected period | `AccountingJournalEntry` EXPENSE lines, period grain | `/app/accounting/expenses` | Non-posted entries excluded |
| Payables | Outstanding supplier balance | `AccountingAccount` code 2000, as-of-today snapshot | `/app/accounting/ageing` | Procurement's `ProcurementSupplierInvoice` never posts a journal entry, so any payable not yet posted to the ledger is excluded from this balance (it IS included in the Average payable days flow figure, which does not require a point-in-time balance) |
| Benchmark gauges (10) | Margins, liquidity, solvency, and debtor/creditor days - see `src/modules/accounting/dashboard-service.ts`'s file header for each formula and its documented v1 simplifications | Derived from the same period figures as the KPI tiles and comparison tables | Each gauge's own formula/interpretation text | Cost of revenue is $0 (no COGS account type exists); "current" assets/liabilities means every Asset/Liability account (no short-term/long-term split exists); Permanence, Financial balance, and Long-term working capital render as "—", not a fabricated zero |
| Top Invoices | Highest-value invoices issued in the selected period | `AccountingInvoice`, sorted by amount descending | `/app/accounting/invoices` | Draft invoices are not excluded by status, since "top by value" is independent of workflow state |

Financial dashboard visibility requires `accounting.reports.view`, the same
permission every other Accounting reporting page already uses.

## Module review matrix

The authoritative KPI families for Fleet, Accounting, POS, Inventory and
Procurement, CRM, HR and Payroll, Installment Sales, Projects, Hotel, Hostel,
Pharmacy, and Hospital are the operational metrics documented by their module
services and reports. Reviews must reject vanity totals, percentages without a
denominator, incomparable trends, unbounded client-side aggregation, duplicate
charts, and clinical or safeguarding detail beyond the minimum necessary.

This standard is a release contract. A module dashboard is not considered
redesigned merely because it uses the shared visual components.
