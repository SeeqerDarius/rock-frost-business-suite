# Database Strategy

> 2026-07-26 operational note: migration
> `20260726020000_add_acquisition_and_subscriptions` is committed but was not
> applied from the development environment (the compatible provider-metadata
> follow-up `20260726030000_add_subscription_payment_gateway` is pending too).
> Its `DIRECT_URL` currently equals
> the pooled Neon URL, and both the pooled endpoint and an in-memory
> direct-host retry returned Prisma's generic `Schema engine error`; even a
> simple Prisma query could not reach Neon from this environment. The Vercel
> build runs `prisma migrate deploy`; confirm that remote step succeeds before
> treating code that reads the new enquiry/subscription columns as live.

## Current state

`prisma/schema.prisma` is the real, live-in-use schema for this rebuild — 70+ models across every business module, all reconnected/redesigned since Phase 3. This document described Phase 1's "not yet touched" state (2026-07-19); none of it has been true since. For the current authoritative model-by-model breakdown, read the schema file directly and `docs/MODULE_BOUNDARIES.md` for the isolation rules every model follows, rather than this document — the sections below now describe *process*, not a stale inventory.

## Migration workflow (mandatory)

**Always use the safe, read-only-diff workflow — never `npx prisma migrate dev` against the shared Neon database.** `migrate dev` detects a pre-existing drift between the live database's migration history and older/removed local state and offers to reset the entire database; that offer must never be accepted.

1. Edit `prisma/schema.prisma`.
2. `npx prisma format && npx prisma validate`.
3. `npx prisma migrate diff --from-schema-datasource prisma/schema.prisma --to-schema-datamodel prisma/schema.prisma --script > <tempfile>.sql` — this is read-only against the live database, safe to run freely.
4. Read the generated SQL. Confirm it contains no unexpected `DROP` statements before proceeding.
5. Create `prisma/migrations/<YYYYMMDDHHMMSS>_<name>/migration.sql` with that SQL.
6. `npx prisma migrate deploy` (applies cleanly, tracked, no drift-reset prompt).
7. `npx prisma generate` (regenerates the Prisma Client — also runs automatically via the `postinstall` script after `npm install`).

A transient `P1001` connection error from Neon during step 3 is usually just a cold-start blip — retry the exact same command before assuming something is actually wrong.

## Seeding

`prisma/seed.ts` (run via `npm run db:seed`, or automatically via `npx prisma db seed`) is the committed, idempotent platform bootstrap — every `Permission` row, every system `Role` with its permission grants, and every `Module` row (marked `ACTIVE`). Safe to re-run at any time; every write is an upsert or an existence check first. It deliberately does **not** create a demo organization, demo users, or enable modules for a specific organization — that's tenant-level bootstrap data (creating an `Organization` + its first `Organization Owner`), a separate concern from platform-level RBAC/module registry seeding.

The actual data and logic live in `prisma/seed-data.ts` (pure exports, zero import-time side effects — no `PrismaClient` construction, no top-level execution) as `seedPlatform(db, options?)`; `prisma/seed.ts` is a thin CLI wrapper that constructs a real `PrismaClient` against `DATABASE_URL` and calls it. This split (added in hardening Pass 4) exists so `test/integration/setup/fixtures.ts` can call the exact same seeding logic against the disposable `TEST_DATABASE_URL` — importing `prisma/seed.ts` directly would have risked auto-running against whatever `DATABASE_URL` happened to be set at import time, which is exactly what `test/integration/setup/guard.ts` exists to prevent. See `docs/TESTING_STRATEGY.md` for the integration-test database setup.

The permission key list inside `prisma/seed-data.ts` is intentionally duplicated from `src/lib/auth/permissions.ts` rather than imported from it (that file has a Next.js-bundler-only `import "server-only"` a plain `tsx` execution can't resolve — the same reason `vitest.config.ts` needs a module alias for it). If you add a new permission key, add it in both places.

`docs/archive/previous-implementation/prisma/` holds the retired implementation's `seed-rbac.ts`/`seed-hire-purchase.ts`/`seed-fleet-documents.ts` for historical reference only — not runnable as-is (they import from deleted application code), and superseded by the current `prisma/seed.ts`.

## Non-negotiable rules for schema work

- Every module-owned record must include `organizationId` (and `branchId` where the module has branch-level granularity).
- **Every foreign id a Server Action or service function accepts from a caller must be resolved through an organization-scoped lookup before being written anywhere** — never trust a bare id. This is the single most common defect class found across the 2026-07-20 audit and its hardening passes (see `docs/HARDENING_PLAN.md`); a new relation field on any model needs this check the moment a function accepts that id from outside the service layer.
- Tenant isolation is enforced in server-side queries and mutations — never rely on the frontend to filter what a user sees.
- No generic catch-all models (e.g. a `ManagementRecord` or `BusinessItem` table used across unrelated modules). Use explicit, named domain models per module.
- Any state transition on a shared row (a status flip, a running total like `balance`/`totalPaid`/`amountPaid`) must be atomic — a guarded `updateMany` (invariant in the `WHERE` clause) for transitions that must reject a stale/duplicate request, or Prisma's `increment`/`decrement` for totals that must always accumulate correctly under concurrent writers. Never a `findFirst` read followed by a JS-computed absolute `update` — see `docs/HARDENING_PLAN.md`'s Pass 2 section for the fixes this replaced.
- Migrations are tracked in `prisma/migrations/` and applied via `prisma migrate deploy` only (see workflow above) — never hand-run untracked SQL against the live database.
