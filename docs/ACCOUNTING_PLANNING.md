# Accounting budgets and forecasts

## Delivered scope

Accounting provides monthly organization-currency budgets and rolling forecasts at `/app/accounting/planning`. A plan has a controlled revision, date range, currency snapshot, workflow state, monthly account lines, optional branch and source-module dimensions, and immutable decision history.

Posted double-entry journals remain the only source of actuals. Planning never writes to the ledger. Actual-versus-plan reporting applies the account's normal balance: debit less credit for assets and expenses, and credit less debit for liabilities, equity and revenue. Revenue above plan is favorable. Expense below plan is favorable. Balance-sheet differences are shown as neutral rather than described as good or bad.

Forecasts require an actual-through date. The date records the forecast assumption boundary. It does not alter or blend ledger transactions. The variance view always labels posted actual and planned values separately.

## Workflow and integrity

The workflow is `DRAFT`, `SUBMITTED`, `APPROVED`, optionally `LOCKED`, and `ARCHIVED`. A submitted plan can be rejected with a required reason. Only drafts are editable. Reviewed plans are corrected by creating a new draft revision, so approved history is not overwritten.

The submitter cannot approve the same plan. Plan-line mutations, transitions and revision allocation use PostgreSQL transaction advisory locks and expected-state updates. Tenant-owned accounts, branches and enabled source modules are revalidated inside the service. The dimension key uses explicit `all` sentinels so nullable database uniqueness cannot create duplicate organization-wide lines.

Permissions are separated:

- `accounting.plans.view`
- `accounting.plans.manage`
- `accounting.plans.approve`

Every plan mutation also creates a tenant-scoped audit event. Plan-specific decisions retain the actor, state transition, reason and timestamp.

## Cross-module actuals

Journal entries carry the authoritative source module and branch when the source workflow has that information. Planning lines can therefore compare one account across the organization or narrow the actuals to a selected active module or branch. Missing dimensions remain unassigned and are included only in organization-wide totals. The system never guesses a branch from the person posting a source transaction.

## Current boundary

This release is single-organization and single-currency planning. It does not provide predictive forecasting, spreadsheet import, multi-currency plans, legal-entity consolidation or intercompany eliminations. Those require the planned Accounting Entity and currency foundations. A budget or forecast is management information, not an audited financial statement or professional financial advice.
