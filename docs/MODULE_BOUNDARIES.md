# Module Boundaries

This is the non-negotiable contract every future phase of this project must respect. It exists because the previous implementation violated it repeatedly and that's the direct reason for this rebuild — see `docs/DECISIONS.md`.

## The rule

Every page belongs to exactly one of three scopes:

1. **Platform scope** (`(platform)/*`) — Rock Frost operators managing the SaaS across every tenant organization. Organizations, subscriptions, module activation, platform-wide activity.
2. **Organization scope** (`(workspace)/(overview)/*`) — a single organization's cross-module concerns: an overview dashboard, the module launcher, cross-module reports, notifications, organization profile, and administration (users/roles/permissions/audit).
3. **Module scope** (`(workspace)/<module>/*`) — one module's own business data and workflows.

There must be no ambiguous pages — a page that shows a bit of Fleet and a bit of Installment "for convenience" does not have a home in this structure, and should not be built.

## Concretely, Fleet must never display

- installment customers
- layaway/installment payments
- installment products
- customer installment balances or account statuses
- installment collection reports

## Concretely, Installment must never display

- drivers
- vehicles
- fleet owners
- vehicle maintenance records
- insurance/roadworthy records
- fleet work-and-pay contracts

## Cross-module data

CRM data must not appear inside Fleet or Installment pages unless there is a deliberate, documented integration (recorded in `docs/DECISIONS.md`, not silently added). The same applies to Accounting data appearing inside any other module. If a future feature genuinely needs cross-module data (e.g. an organization-wide report combining Fleet revenue and Installment collections), it belongs in **organization scope** (`/reports`), built as its own explicit cross-module reporting feature — not smuggled into a module page.

## How this is enforced today

Structurally, via nested layouts — see `docs/ARCHITECTURE.md`'s "How module isolation is enforced structurally" section. Each module route tree has its own `layout.tsx` with its own `AppShell` instance and its own navigation array; there is no shared conditional-sidebar logic that could drift.

As modules gain real data (Phase 6 onward), this must also be enforced **server-side**, not just in navigation:

- Every module-owned database record must carry `organizationId` (and `branchId` where relevant) — see `docs/DATABASE_STRATEGY.md`.
- Every query and mutation in a module's service layer must filter by the current organization. Do not rely on the UI simply not showing a link to unauthorized data — assume a user can hit any URL directly.
- Permission checks are module-specific (`fleet.vehicles.manage`, `installment.customers.manage`, etc. — see `docs/AUTHENTICATION_AND_AUTHORIZATION.md`), not one shared "can access dashboard" flag reused across modules.

## Adding a new module

1. Add its entry to `src/platform/modules/registry.ts` (key, name, description, icon, route prefix, status).
2. If it has real navigation, add `src/modules/<key>/navigation.tsx` and reference it from the registry entry.
3. Create its route tree under `src/app/(workspace)/<key>/` with its own `layout.tsx` wrapping `AppShell` with that module's navigation — copy the pattern from `(workspace)/fleet/layout.tsx` or `(workspace)/installment/layout.tsx`.
4. Do not add its nav items to `workspace-navigation.tsx` or another module's navigation file. Each module's nav lives only in its own file.
