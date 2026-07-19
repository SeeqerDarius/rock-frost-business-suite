# Database Strategy

## Current state

**The live Neon Postgres database was not touched by this rebuild.** Only application code was replaced (see `docs/DECISIONS.md`). `prisma/schema.prisma` still reflects the previous implementation's schema exactly, and the actual database still holds that schema and its data.

`src/` currently contains **zero** references to Prisma or the database — no page queries anything, no service layer exists yet. This is intentional: Phase 1 (see `docs/DEVELOPMENT_ROADMAP.md`) is UI shells only.

## What's in the existing schema (inherited, not yet re-validated against the new architecture)

Multi-tenant platform models (`Organization`, `Branch`, `OrganizationMember`, `Role`, `Permission`, `RolePermission`, `AuditLog`, `Notification`, `FileAsset`, NextAuth-compatible `User`/`Account`/`Session`), plus the previous Fleet module's models (`FleetOwner`, `FleetDriver`, `FleetVehicle`, `FleetVehicleDocument`, `FleetMaintenanceRequest`, `FleetPayment`, `FleetWorkAndPayContract`). No Installment/Hire-Purchase models exist in the schema — that module was never migrated to a real database in the previous implementation.

## Plan going forward

1. **Phase 3 (Authentication)**: reconnect the new app to this same Neon database (or a fresh one — not yet decided, see Known Issues in `OPERATOR_HANDOFF.md`) via `DATABASE_URL`/`DIRECT_URL`. Re-validate the existing multi-tenant/RBAC models against the new architecture rather than assuming they're still correct as-is — the previous implementation's RBAC seed script (`docs/archive/previous-implementation/prisma/seed-rbac.ts`) is archived for reference, not for direct reuse (it imports from application code that no longer exists).
2. **Phase 6 (Fleet)**: decide whether to keep the existing `Fleet*` models or redesign them against this rebuild's actual module-boundary rules (`docs/MODULE_BOUNDARIES.md`) before writing any new Fleet queries.
3. **Phase 7 (Installment)**: design fresh, organization/branch-scoped models translating the reference GLV system's validated business rules — do not port GLV's own single-tenant schema directly. See `docs/DEVELOPMENT_ROADMAP.md` Phase 7 for the extraction approach.

## Non-negotiable rules for any future schema work

- Every module-owned record must include `organizationId` (and `branchId` where the module has branch-level granularity).
- Tenant isolation is enforced in server-side queries and mutations — never rely on the frontend to filter what a user sees.
- No generic catch-all models (e.g. a `ManagementRecord` or `BusinessItem` table used across unrelated modules). Use explicit, named domain models per module.
- Migrations are tracked in `prisma/migrations/` and applied via the standard `prisma migrate` workflow — do not hand-run untracked SQL against the live database (this happened at least twice in the previous implementation's history and caused real confusion; see the archived `OPERATOR_HANDOFF.md` for the full story if curious).

## Old seed scripts

`docs/archive/previous-implementation/prisma/` holds `seed-rbac.ts`, `seed-hire-purchase.ts`, and `seed-fleet-documents.ts` from the retired implementation — archived for reference on data shape and seeding patterns, not runnable as-is (they import from deleted application code).
