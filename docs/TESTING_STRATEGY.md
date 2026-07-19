# Testing Strategy

## Current state

No automated test suite exists yet (no Jest/Vitest/Playwright config committed). Validation today relies on the commands below plus manual/scripted browser verification. This is acceptable for Phase 1 (UI shells, no business logic to unit-test yet) but should not remain the permanent state once modules gain real logic in Phase 6/7.

## Required validation at the end of every milestone

Run all of these and do not report a milestone complete if any fail:

```bash
npm run lint          # ESLint
npx tsc --noEmit       # TypeScript, strict mode
npx prisma validate    # Schema validity
npx prisma generate    # Client generation succeeds
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

## Future: real automated tests (from Phase 6 onward)

Once modules have real business logic (calculations, status transitions, permission checks), add:

- **Unit tests** for pure business logic (e.g. installment payment allocation, account lifecycle transitions) — Vitest is a reasonable default given Next.js 16 + Turbopack, but confirm compatibility before committing to it.
- **Integration tests** for service-layer functions against a real (test) database — do not mock the database for logic that depends on real constraints/transactions; a prior project incident showed mocked-DB tests can pass while the real migration/logic fails.
- **Permission tests** — for every module permission, confirm both "user with permission can act" and "user without permission is blocked," at the API/server-action layer, not just the UI.
- **Tenant-isolation tests** — confirm a user in Organization A can never read or mutate Organization B's data, for every module query/mutation.
- **Responsive/accessibility checks** — at minimum, verify the mobile sidebar `Sheet` pattern and keyboard navigation work for any new interactive component; shadcn/Base UI components are accessible by default, but custom compositions (like `AppShell`) should be spot-checked.
