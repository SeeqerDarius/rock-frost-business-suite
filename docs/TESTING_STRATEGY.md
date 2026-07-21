# Testing Strategy

## Current state

**A real, committed Vitest suite exists as of the 2026-07-21 production-hardening Pass 1** (`vitest.config.ts`, `test/*.test.ts`, `npm run test`) — the project's first automated tests. It covers exactly Pass 1's fixes: the central tenant guard, session revocation, the dashboard permission leak, and the Administration/Projects/Payroll IDOR fixes (see `docs/HARDENING_PLAN.md`).

**Known limitation, stated honestly rather than glossed over**: these tests mock `@/lib/db` rather than running against a real database. That's a deliberate tradeoff for this pass (speed, no test-database infrastructure exists yet, and avoiding any risk of writing to the real Neon database from a test run) — but it means a test can pass while verifying the code's *branching logic* ("does this function reject when the lookup returns null") without verifying the underlying Prisma query is actually well-formed or that a real database would behave as the mock assumes. This is the same category of risk noted below under "do not mock the database for logic that depends on real constraints/transactions" — it was accepted here as a scoped exception for authorization/validation logic (not calculations, not transactions), not as a reversal of that guidance. Pass 2+ should add real integration tests against a test database, per the "Future" section below, rather than expanding the mocked suite indefinitely.

## Required validation at the end of every milestone

Run all of these and do not report a milestone complete if any fail:

```bash
npm run lint          # ESLint
npx tsc --noEmit       # TypeScript, strict mode
npx prisma validate    # Schema validity
npx prisma generate    # Client generation succeeds
npm run test           # Vitest — real, committed since the 2026-07-21 hardening pass
npm run build          # Full production build (Turbopack)
```

Document every failure honestly in `OPERATOR_HANDOFF.md` — do not claim success when a command fails.

## Browser verification

For any UI-facing change, don't rely on the build succeeding alone — actually load the pages. The pattern used in this rebuild:

1. Start the dev server in the background (`npm run dev`), poll until it responds.
2. Install `playwright` as a **temporary** devDependency (`npm install -D playwright`), never a permanent one.
3. Script navigation to the affected pages, capture full-page screenshots, and check `page.on("console")`/`page.on("pageerror")` for runtime errors — a clean build can still throw at render time (this rebuild caught a real Server→Client serialization bug this way that `tsc`/`next build` did not catch on their own, and a real accessibility warning from Base UI's `nativeButton` default).
4. Actually look at the screenshots. A blank or broken-looking frame is a failure to render correctly, not proof the page "loaded."
5. Clean up afterward: delete the temporary test script(s), and remove `playwright` from `package.json`/`package-lock.json` **surgically** (`npm uninstall playwright`), never via a blanket `git checkout -- package.json` — if other real dependencies were added in the same session, that command reverts them too. This exact mistake happened at least once in the previous implementation's history (see the archived `OPERATOR_HANDOFF.md`); check `git diff package.json` before reverting anything.

## Future: broader automated test coverage (Pass 2+)

Vitest is now committed and confirmed to work with this stack (see "Current state" above). Beyond Pass 1's authorization-focused suite, add:

- **Unit tests** for pure business logic (e.g. installment payment allocation, account lifecycle transitions, payroll gross/tax/net math).
- **Integration tests** for service-layer functions against a real (test) database — do not mock the database for logic that depends on real constraints/transactions; a prior project incident showed mocked-DB tests can pass while the real migration/logic fails.
- **Permission tests** — for every module permission, confirm both "user with permission can act" and "user without permission is blocked," at the API/server-action layer, not just the UI.
- **Tenant-isolation tests** — confirm a user in Organization A can never read or mutate Organization B's data, for every module query/mutation.
- **Responsive/accessibility checks** — at minimum, verify the mobile sidebar `Sheet` pattern and keyboard navigation work for any new interactive component; shadcn/Base UI components are accessible by default, but custom compositions (like `AppShell`) should be spot-checked.
