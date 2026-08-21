# Testing Strategy

## Current state

**Two distinct, real test layers exist**, kept deliberately separate rather than one growing suite:

1. **Mocked-database unit suite** (`vitest.config.ts`, `test/*.test.ts` — non-recursive, does not pick up subdirectories — `npm run test`), committed since Pass 1 (2026-07-21). Fast, mocks `@/lib/db`, covers authorization/validation branching logic, trial expiry, cron authentication, and health-probe behavior.
2. **Real-PostgreSQL integration suite** (`vitest.integration.config.ts`, `test/integration/**/*.test.ts`, `npm run test:integration`), added in Pass 4 (2026-07-21). Runs real Prisma queries against a genuinely disposable database — see "Real-database integration tests" below.

**Known limitation of the mocked suite, stated honestly**: it verifies the code's *branching logic* ("does this function reject when the lookup returns null") without verifying the underlying Prisma query is well-formed or that a real database behaves as the mock assumes. That's why the integration suite exists as a second, independent layer rather than a replacement — the mocked suite stays for its speed on every commit; the integration suite is the one that actually proves tenant isolation and transaction behavior against real Postgres.

## Real-database integration tests

### Setting up a disposable test database

**Never point `TEST_DATABASE_URL` at the same database as `DATABASE_URL`.** The safety guard (`test/integration/setup/guard.ts`) refuses to run unless the test database's name contains `"test"`, differs from `DATABASE_URL`/`DIRECT_URL`, `ALLOW_INTEGRATION_TESTS=1` is explicitly set, and `NODE_ENV`/`VERCEL_ENV` isn't `production` — but the guard is a last line of defense, not a substitute for actually using a separate database.

Two ways to get one:

- **Neon branch** (recommended for local development against this project's real schema): create a branch of the Neon project dedicated to testing, name it so its database name contains `test` (e.g. `rockfrost_test`), and set `TEST_DATABASE_URL` to that branch's connection string in your local `.env`.
- **Disposable Postgres container** (what CI uses): a fresh `postgres:16` service container that exists only for the lifetime of the CI job — see `.github/workflows/ci.yml`'s `integration` job. Nothing persists between runs.

### Running them

```bash
npm run db:test:migrate   # applies committed migrations to TEST_DATABASE_URL (never DATABASE_URL)
npm run db:test:seed      # optional pre-warm — fixtures.ts seeds platform data automatically on first use anyway
npm run test:integration  # runs test/integration/**/*.test.ts against TEST_DATABASE_URL
npm run test:all          # npm run test && npm run test:integration
```

`test/integration/setup/fixtures.ts`'s `createTestOrg(label)` creates one fully isolated organization (with an ACTIVE user/membership and every module enabled) per call — every suite gets its own, so suites don't interfere with each other even against a shared database. `cleanupTestOrg(org)` deletes it afterward (cascading, via the schema's `onDelete: Cascade` relations, to everything it owns).

### What's covered

`test/integration/tenant-isolation/*.test.ts` — one file per business module (including Hotel and School) plus Administration — each creates two real organizations and proves, against real Postgres, that Organization A can never read or write Organization B's records through that module's service-layer functions. Hotel additionally verifies overlapping-room rejection; School verifies invoice overpayment rejection. This is the real-database counterpart to the mocked IDOR tests in `test/idor-*.test.ts`; both layers exist because the mocked tests are fast defense-in-depth and the integration tests are the actual proof.

`test/integration/concurrency/*.test.ts` (added in Pass 4, if present — check `docs/HARDENING_PLAN.md`'s Pass 4 section for current coverage) exercises genuine concurrent requests (`Promise.all` against real overlapping transactions) for the state-transition races the mocked suite can only simulate by asserting a mock returned `count: 0`.

## Required GitHub Actions configuration

`.github/workflows/ci.yml` has two jobs:

- **`validate`** — lint, typecheck, `prisma validate`, the mocked-db unit suite, and the production build. Uses placeholder, unreachable `DATABASE_URL`/`DIRECT_URL` values (these steps never connect to a real database).
- **`integration`** — spins up its own `postgres:16` service container (no external database, no secrets required for this part), migrates it, and runs the real-Postgres integration suite against it.

**No repository secrets are required for CI as currently configured** — every environment variable the workflow needs is either a harmless placeholder (`validate` job) or points at the ephemeral service container the job itself creates (`integration` job). If a future change needs CI to reach an *external* database or service (e.g. a hosted Neon test branch instead of the container), add its connection string as a GitHub Actions repository secret (Settings → Secrets and variables → Actions) and reference it as `${{ secrets.NAME }}` in the workflow — never hardcode a real credential into the YAML.

The integration setup validates `TEST_DATABASE_URL` before importing application services, then binds both the fixture Prisma client and the services' shared Prisma client to that already-approved disposable URL. This is required because service functions use `src/lib/db.ts`; leaving `DATABASE_URL` on CI's unreachable install-time placeholder would test only fixtures and make every real service query fail before exercising its invariants. Test files share one isolated Vitest fork/module graph and use a bounded connection pool, preventing a fresh pair of Prisma pools from leaking across every suite while preserving deliberate within-test concurrency.

**Re-running a failed workflow**: from the GitHub Actions UI, open the failed run and use "Re-run jobs" (either the failed job only, or all jobs). From the `gh` CLI: `gh run rerun <run-id>` (or `--failed` to rerun only failed jobs).

## Required validation at the end of every milestone

Run all of these and do not report a milestone complete if any fail:

```bash
npm run lint               # ESLint
npx tsc --noEmit            # TypeScript, strict mode
npx prisma validate         # Schema validity
npx prisma generate         # Client generation succeeds
npm run test                # Vitest, mocked database
npm run test:integration    # Vitest, real disposable Postgres (requires TEST_DATABASE_URL)
npm run build               # Full production build (Turbopack)
```

Document every failure honestly in `OPERATOR_HANDOFF.md` — do not claim success when a command fails, and do not claim `test:integration` passed unless it actually ran against a real database and you saw it pass (an agent without a reachable test database cannot honestly claim this step).

## Browser verification

For any UI-facing change, don't rely on the build succeeding alone — actually load the pages. The pattern used in this rebuild:

1. Start the dev server in the background (`npm run dev`), poll until it responds.
2. Install `playwright` as a **temporary** devDependency (`npm install -D playwright`), never a permanent one.
3. Script navigation to the affected pages, capture full-page screenshots, and check `page.on("console")`/`page.on("pageerror")` for runtime errors — a clean build can still throw at render time (this rebuild caught a real Server→Client serialization bug this way that `tsc`/`next build` did not catch on their own, and a real accessibility warning from Base UI's `nativeButton` default).
4. Actually look at the screenshots. A blank or broken-looking frame is a failure to render correctly, not proof the page "loaded."
5. Clean up afterward: delete the temporary test script(s), and remove `playwright` from `package.json`/`package-lock.json` **surgically** (`npm uninstall playwright`), never via a blanket `git checkout -- package.json` — if other real dependencies were added in the same session, that command reverts them too. This exact mistake happened at least once in the previous implementation's history (see the archived `OPERATOR_HANDOFF.md`); check `git diff package.json` before reverting anything.

## Future: still-open test coverage (Pass 5+)

Real-database integration tests and tenant-isolation coverage across every module now exist (see above, added in Pass 4). Still genuinely open:

- **True concurrent-load integration tests for every documented residual race** (see `docs/HARDENING_PLAN.md`'s Pass 4 section for exactly which races were closed vs. deliberately accepted this pass) — some concurrency coverage was added in Pass 4, but confirm current status there before assuming a given scenario is covered.
- **Permission tests** — for every module permission, confirm both "user with permission can act" and "user without permission is blocked," at the Server Action layer specifically (not just the service-layer functions the integration suite currently exercises).
- **End-to-end browser tests as a committed suite** — today, UI verification still follows the ad hoc "Browser verification" pattern below (temporary Playwright install, script, screenshot, uninstall), not a committed `test:e2e` suite. Worth formalizing once the highest-value smoke paths are identified.
- **Responsive/accessibility checks** — at minimum, verify the mobile sidebar `Sheet` pattern and keyboard navigation work for any new interactive component; shadcn/Base UI components are accessible by default, but custom compositions (like `AppShell`) should be spot-checked.
- **Production monitoring assertions** — configure an external uptime probe for `/api/health` and review Vercel Web Analytics, Speed Insights, runtime errors, and the daily trial-expiry success log. See `docs/OPERATIONS_AND_MONITORING.md`.
