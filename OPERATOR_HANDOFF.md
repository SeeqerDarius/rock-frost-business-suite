# Rock Frost Business Suite — Operator Handoff

## 2026-08-18: Desktop UI ported to the web app's Tailwind v4 + shadcn/ui stack (0.2.3 to 0.2.4)

- After the completed offline-expansion milestones (POS + School full offline parity), the user asked whether the desktop client could look exactly like the web app. It could not: the desktop had its own hand-rolled `--rf-*` CSS-variable theme and custom `Button`/`Card` components with inline `style={{}}` objects on every screen. The user chose a full port over keeping the lightweight custom UI.
- Ported the web app's real Tailwind v4 + shadcn/ui ("base-nova") stack into `apps/desktop/`: `@tailwindcss/vite`, `src/styles/globals.css` (replaces `theme.css`, same OKLCH tokens as the web app), `src/lib/utils.ts`, and all 26 `src/components/ui/*.tsx` shadcn files. `Button`/`Card` became thin wrappers around the real shadcn components so their ~120 existing call sites kept their simplified prop API while rendering genuine shadcn CSS. Every other primitive (`Select`, `Checkbox`, `Tabs`, `Label`, `Badge`, `Input`) was converted at each call site across all 32 desktop screen/shell files, including replacing every inline layout `style={{}}` object with Tailwind utility classes.
- This is a presentation-only change: no adapter, sync-engine, mutation-queue, or offline-mutation logic changed anywhere in `apps/desktop/`.
- Important files: `apps/desktop/src/styles/globals.css` (new), `apps/desktop/src/lib/utils.ts` (new), `apps/desktop/src/components/ui/*.tsx` (26 new), `apps/desktop/src/components/{Button,Card,form-fields,StatusPill}.tsx`, all `apps/desktop/src/modules/{pos,school}/screens/*.tsx`, all `apps/desktop/src/shell/*.tsx`, `apps/desktop/src/conflict/ConflictResolutionPanel.tsx`, `apps/desktop/src/update/UpdateBanner.tsx`, `apps/desktop/vite.config.ts`, desktop version manifests, `apps/desktop/README.md`, `apps/desktop/CLAUDE_HANDOFF.md`.
- Schema and environment changes: none.
- Validation from `apps/desktop/`: `npx tsc --noEmit` passed with zero errors; `npm run lint` passed; `npm test` passed unmodified with 16 files and 99 tests (no DOM-structure-dependent test needed updating despite the full UI swap); `npm run build` compiled 2,130 modules. `cargo check` and `npm run tauri:build` (native, `CARGO_TARGET_DIR` outside the worktree to avoid Windows' `MAX_PATH` limit) produced NSIS and MSI `0.2.4` installers in 15m40s (incremental; only the frontend changed, the Rust layer did not). The built `rock-frost-desktop.exe` launched and stayed responsive in a local smoke test. The NSIS installer is 3,564,760 bytes with SHA-256 `79D88FDC277773BAD9E069CE016915CE76C4F2C6C8FBEAA496C79946090AE094`; the MSI installer is 4,845,568 bytes with SHA-256 `BEF5FB5C3FB3F8BC78CA6EEB5AAEFE0831FD3F74EFFBD77E8C5B494ABFA7FAEE`. As with every previous desktop release, `tauri build`'s overall exit code was 1 only because `TAURI_SIGNING_PRIVATE_KEY` is not set for signed auto-update artifacts; both installer bundles were produced successfully regardless.
- Remaining risk: the freshly built `0.2.4` installer has not yet been manually installed and walked through on a live Windows machine to visually confirm the ported UI (this follows the same live-device manual-testing pattern used for the previous three desktop releases, since this environment has no working WebView2 CDP automation). Sent to the user for manual install/testing.
- Follow-up: CI's editorial-punctuation test caught an em dash in `apps/desktop/src/components/ui/icon-badge.tsx`'s doc comment, copied verbatim from the web app. Fixed in commit `62c6646`; re-ran CI, which passed clean (lint, type-check, mocked unit tests, real-Postgres integration tests, production build, dependency/secret scan).
- Release: local `main` was fast-forwarded from `e9f8cc1` to `62c6646` (bringing in the previously-pushed-but-not-yet-locally-merged M1-M11 offline expansion together with this UI port and its em-dash fix) and pushed to `origin/main`. Vercel production deployment `dpl_E1aqD34Lt8cnu7Go42pLa7cgFcsL` reached Ready and owns the `app`, `www`, `admin`, apex, and Vercel production aliases. Post-deploy verification: `/api/health` returned HTTP 200 with the database reachable; the protected `/app/account/desktop` route returned the expected HTTP 307 redirect to `/login` without credentials; an unauthenticated desktop sync pull returned HTTP 401; an empty desktop activation request returned HTTP 400; the runtime error log showed only a pre-existing, unrelated `/app` organization-membership error last seen on the prior deployment (2026-08-17), with nothing new from this release. No schema migration was required for this change.

## 2026-08-16: Complete platform request inbox coverage

- Root cause: the public contact form correctly stored the customer's successful submission as a `GENERAL` inquiry with `NEW` status, but `/app/platform/requests` queried and counted only `DEMO`, `MODULE`, and `CUSTOM_MODULE` intents. General inquiries and support requests were therefore present in production data but invisible to platform operators.
- Updated the platform inbox to show every `NEW` public inquiry. Added clear labels for demo, module, general, support, and custom-module requests, while preserving the existing active queue and history workflows.
- Production data verification found the latest affected `GENERAL` inquiry at `2026-08-16T10:38:57.626Z` still in `NEW` state, plus one `SUPPORT` inquiry in `NEW` state. Neither customer needs to resubmit, and no data repair is required.
- Important files: `src/app/app/platform/requests/page.tsx`, `test/platform-request-inbox.test.ts`, and `docs/MODULE_REQUESTS_AND_CUSTOMIZATION.md`.
- Schema and environment changes: none.
- Validation and release: the platform inbox, module request workflow, and contact form tests passed with 3 files and 10 tests; ESLint and strict TypeScript passed; the full mocked suite passed with 68 files and 376 tests; Next.js 16.2.12 produced a fresh optimized production build with all 194 pages; and `git diff --check` passed. Commit `9b1701d` was pushed to `origin/main`. Vercel production deployment `dpl_9T5x2Q6e3PdwmDQBAZGSGDAVRXde` reached Ready. The live health endpoint returned HTTP 200 with the database reachable, the protected admin request route returned the expected HTTP 307 login redirect without credentials, and the post-deploy error scan was clean.

## 2026-08-16: Public contact verification outage

- Root cause: production had neither Turnstile environment variable. The contact widget therefore rendered nothing, while `verifyBotProtection` rejected every production submission without a secret. The visible `bot-check` message was a deliberate redirect, so no 500 appeared in runtime error logs.
- Fixed contact submissions without weakening authentication. Contact uses Turnstile when both keys are configured; otherwise it requires a server-signed, time-limited proof, a minimum completion time, an empty honeypot, valid Zod input, and the existing database cooldown. Login and password-reset verification remain fail-closed.
- Added privacy-safe diagnostics for Turnstile provider errors, action/hostname mismatch, timeouts, and fallback rejection. Tokens and submitted contact content are not logged.
- Important files: `src/lib/contact-form-protection.ts`, `src/lib/bot-protection.ts`, `src/app/(public)/contact/actions.ts`, `src/app/(public)/contact/page.tsx`, `test/contact-form-protection.test.ts`, `test/contact-form.test.ts`, `docs/HARDENING_PLAN.md`, and `README.md`.
- Schema and environment changes: none. Configuring both documented Turnstile keys remains recommended but is no longer required for contact-form availability.
- Validation and release: 3 focused test files with 11 tests passed; the full mocked suite passed with 67 files and 375 tests; ESLint and TypeScript passed; Next.js 16.2.12 produced a fresh optimized production build and route manifest; the editorial punctuation release test passed; and `git diff --check` passed. Commit `5eadd01` was pushed to `origin/main`. Vercel production deployment `dpl_AEvQUS4GGUtu5umbJHkRektrrhBc` reached Ready and owns every public alias. The live `/contact` DOM contains a signed proof and honeypot, omits the unconfigured Turnstile widget, enables submission, and shows no verification error. No synthetic message was submitted, avoiding a false customer record and operator notification. `/api/health` returned HTTP 200 with the database reachable, and the post-deploy error scan returned no errors.

## 2026-08-15: Desktop false startup timeout fix

- Bumped the Windows desktop client to `0.2.1` and fixed a startup race where the activation screen rendered successfully but an uncancelled safety timer replaced it with a false error eight seconds later.
- The React entrypoint now observes the first committed application screen and explicitly cancels the guard. The guard also checks that the static startup marker still exists before displaying a timeout, providing an independent fail-safe.
- Important files: `apps/desktop/public/startup-guard.js`, `apps/desktop/src/main.tsx`, `apps/desktop/src/packaging/bundled-assets.test.ts`, desktop version manifests, `docs/OFFLINE_DESKTOP.md`, and desktop/root README files.
- Validation: desktop TypeScript passed, desktop ESLint passed, 12 test files with 66 tests passed, Vite production build compiled 1,634 modules, and the signed native Tauri build produced both NSIS and MSI `0.2.1` bundles. The NSIS installer is 3,480,349 bytes with SHA-256 `EED1586F2560527B8A34CFF585452875D10636E9934A1C382D9BD381C70F4E52`; its updater signature SHA-256 is `24587DA670801AA9C6337BADCAF3A948BB0746A224F3ABB24136EB810E7F6885`. The verified installer upgraded the existing local installation without deleting protected data, and the installed executable remained responsive after 15.6 seconds, beyond the former eight-second false timeout. `git diff --check` passed.
- Schema and environment changes: none. Existing activation, encrypted local database, credentials, and pending work are preserved by the upgrade.
- Release: commit `d4c5fd3` was pushed to `origin/main`. Vercel production deployment `dpl_4d2WdaFNgoD8t6YPTXXNqwR6vkLv` reached Ready and owns the public aliases. Post-deploy `/api/health` returned HTTP 200 with the database reachable; `/api/desktop/releases/latest` returned the expected uncached HTTP 204 because no public GitHub desktop release has been published yet.

## 2026-08-15: Authenticated Windows desktop automatic updates

- Upgraded the desktop client to `0.2.0` and added the official Tauri updater with an embedded public verification key, a Rock Frost update endpoint, passive Windows installation, visible availability and download progress, explicit Update and restart consent, safe relaunch, startup/online/six-hour checks, and non-blocking failure behavior.
- Added a validated server proxy for the public GitHub `latest.json` manifest. It returns HTTP 204 when no release exists and rejects malformed manifests or non-HTTPS artifact URLs. Added a public GitHub Actions release workflow that validates the desktop client, builds NSIS and MSI packages, emits updater signatures and `latest.json`, and publishes the release.
- Generated the password-protected updater private key outside the repository at `%LOCALAPPDATA%\RockFrostRelease\desktop-updater.key`, stored its password with Windows DPAPI at `%LOCALAPPDATA%\RockFrostRelease\desktop-updater-password.dpapi`, and restricted both files to the current Windows account. This free Tauri key is distinct from the future commercial Windows Authenticode certificate. Public distribution remains enabled while Authenticode procurement is pending.
- Version `0.1.1` cannot update itself and needs one manual installation of `0.2.0`. From `0.2.0` onward, verified in-app updates preserve the encrypted database, pending mutation queue, activation, and credentials.
- Validation: desktop TypeScript passed; desktop ESLint passed; 12 desktop test files with 65 tests passed. The optimized Tauri build compiled 1,634 frontend modules, produced NSIS and MSI `0.2.0` installers, and produced a matching `.sig` for each installer. The exact release binary launched, remained responsive, and initialized the encrypted database. The NSIS installer is 3,481,206 bytes with SHA-256 `A2CC2D09DB46511DA27F3B09D8362869D5EFA64C6196EBFE34BC194A91C63A0D`; its signature SHA-256 is `8A727D80109249D598A52080B0AF3C05CB5D3674FBDA17F32D96775757AE62CA`. The MSI installer is 4,763,648 bytes with SHA-256 `6FE43C837137A86330868F37F4EDE708A9C3BB4868A7DF799950875B8EA5DA82`; its signature SHA-256 is `EFDA8D1E2B01DA993E88BA75BB3333A19257EA5D711322D03FD6DB96134FB63B`. Root ESLint passed; the full mocked suite passed with 66 files and 372 tests; Next.js 16.2.12 compiled all 194 pages including the new update endpoint; `git diff --check` passed.
- Remaining release operation: GitHub CLI is not authenticated in this environment, so the protected key has not been copied into repository Actions secrets and the public `desktop-v0.2.0` GitHub release has not been created. Configure `TAURI_SIGNING_PRIVATE_KEY` and `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`, then run the `Desktop release` workflow. Until that one external step is completed, automatic checks safely receive HTTP 204 and public/manual EXE distribution remains available.
- Released implementation commit `17d2cc5` to `main`. Vercel production deployment `dpl_75om1Pzsm5zziJd8gWaGXh6g6NbB` reached Ready and received all Rock Frost production aliases. The live health endpoint returned HTTP 200 with the database reachable; `/api/desktop/releases/latest` returned the expected HTTP 204 with `Cache-Control: no-store`; the recent production error-log scan was clean. No database migration or new Vercel environment variable was required.

## 2026-08-15: Installed desktop blank-window correction

- Corrected the packaged Vite asset base from an implicit root path to `./`. The previous installer could launch its native Tauri window while failing to load `/assets/*`, leaving the entire client blank.
- Traced the remaining WebView startup failure with a temporary native page-state diagnostic. The exact exception was `Illegal invocation`: `DeviceLockController` stored unbound WebView2 timer functions and later invoked them with the controller as receiver. The production implementation now binds `setInterval` and `clearInterval` to `globalThis`, with a regression test covering the default timer path.
- Added a generated-build regression test that requires relative script and stylesheet references, a static startup state, React root-level error handling, a user-visible fatal startup fallback, a production API default, and minimal native stage logging that excludes credentials and business payloads. Temporary release developer tools and page-snapshot diagnostics were removed before the final customer build.
- Validation: desktop TypeScript and Vite production build passed with 1,629 modules; ESLint passed; 11 test files with 62 tests passed; the final optimized Tauri 0.1.1 build completed and produced replacement NSIS and MSI bundles. The exact 0.1.1 release EXE launched, remained alive and responsive, and initialized the encrypted SQLCipher database. The NSIS bundle is 2,978,946 bytes with SHA-256 `45B513BD8381B313BF479D5EACA57D9BCCEE411AB7161877CAA76706B2D2364A`; the MSI bundle is 3,940,352 bytes with SHA-256 `4807460A1895753797C2072CA45DD4268008C53B7DCF205933D459A3BDA884F6`.
- Released implementation commit `2a7d35f` to `main`. Vercel production deployment `dpl_GbRcsJoMSRZLgN1zbVqRSevmVxwm` reached Ready and received all Rock Frost production aliases. The live health endpoint returned HTTP 200 with `ok: true` and the database reachable; the recent production error-log scan was clean. No schema migration or new environment variable was required for this correction.

## 2026-08-15: Offline desktop synchronization server foundation

- Added a fail-closed server synchronization boundary for registered desktop devices. Activation uses short-lived, single-use hashed codes; device bearer secrets are hashed at rest; every request revalidates the user, membership, tenant, active subscription, enabled module, permission, token expiry, and device revocation state.
- Added a durable idempotency ledger keyed by organization and client mutation ID, explicit conflict records, tenant-scoped audit events, bounded payloads and batches, and module-specific snapshot scoping. The server never accepts an organization or user identity from a desktop payload and never exposes Prisma, PostgreSQL credentials, or direct database access.
- Offline mutation scope is intentionally limited to controlled append-only operations: Fleet maintenance reports and driver payment submissions, Installment payment collection, Inventory receipts and adjustments, and POS sales tied to the user's open session. Approvals, refunds, destructive corrections, payroll, HR, accounting posting, pharmacy, hospital, and other clinical or sensitive workflows remain online-only.
- Added tenant account controls for activation-code generation, device visibility, and immediate revocation; API routes under `/api/desktop`; migration `20260815020000_add_offline_sync_foundation`; authoritative documentation in `docs/OFFLINE_DESKTOP.md`; and unit plus real-PostgreSQL isolation, expiry, revocation, and replay tests.
- The full PostgreSQL gate initially exposed invalid support test sender fixtures and remote-latency transaction expiry in support messaging and pharmacy. Tests now create valid platform users, the affected transactions have bounded 15-second timeouts, and support conversation timestamps advance monotonically under concurrent sends.
- Integrated the isolated Tauri desktop client and reconciled it to the actual server contract. It now uses one-time activation codes, the five approved append-only mutation types, bounded full snapshots, real server conflict identifiers, stable UUID replay keys, pending-sync badges, encrypted local SQLite, Windows Credential Manager, offline lease persistence, local passcode locking, and revocation purge. Root TypeScript excludes the independently configured desktop package so its `@/` alias is resolved only by its own project.
- Validation: Prisma format and validate passed; the migration applied successfully from an empty disposable PostgreSQL database; focused offline integration passed with 1 file and 4 tests; corrected support/pharmacy integration passed with 3 files and 10 tests; final full integration passed with 26 files and 136 tests; root ESLint passed; root strict TypeScript passed; the complete mocked suite passed with 65 files and 368 tests; and the Next.js 16.2.12 production build compiled all 194 pages. Desktop typecheck and lint passed, 10 desktop test files with 60 tests passed, and the Vite build transformed 1,629 modules. Rust 1.97.1 `cargo check` passed after adding the required Tauri `Manager` import. The optimized Tauri release build succeeded and produced x64 NSIS and MSI bundles; a five-second release-executable startup smoke passed. The exact disposable database `rockfrost_test_offline_20260815` was deleted after testing; its shared preview branch was preserved.
- No new server environment variable is required. The desktop build needs `VITE_API_BASE_URL` set to the public application origin. The generated installers are internal-test artifacts only. Production must not advertise or distribute the desktop client until a trusted Windows code-signing certificate and authenticated signed-update channel are configured.
- Released the complete server and desktop integration through commits `ac62d67`, `7c8f522`, and `c2e0456` on `main`. Vercel production deployment `dpl_HDCTkejMBkgiakJDoWQf3WQa9HEr` reached Ready and received the production aliases. Its build cloned commit `c2e0456`, applied migration `20260815020000_add_offline_sync_foundation`, seeded 137 permissions, and compiled all 194 routes. Post-deploy verification returned HTTP 200 with the database reachable from `/api/health`; `/app/account/desktop` returned the expected HTTP 307 login redirect; an unauthenticated pull returned HTTP 401; an empty activation request returned HTTP 400; and the recent production error-log scan was clean.

## 2026-08-14: Fleet, Accounting, and HR controlled workflow upgrade

- Added a tenant-scoped Fleet Driver Workspace. Active organization users can be linked to a driver profile, view only assigned vehicles, report maintenance through the existing ownership check, and submit weekly or work-and-pay collections. Submissions remain pending until a Fleet payments manager approves or rejects them; approval atomically creates a verified Fleet payment.
- Added Accounting liquidity classification for cash, bank, and mobile-money ledger accounts, a journal-derived cashbook, locked one-time opening-balance posting against Opening Balance Equity, and preserved period reconciliation records with visible differences.
- Replaced direct HR termination with password and optional 2FA step-up, category/reason/dates, explicit account-access handling, maker-checker approval, pending/effective states, cancellation, reinstatement, append-only status history, final-pay inputs, and a generated offboarding checklist. The existing authenticated daily cron now applies approved future-dated terminations.
- Added granular permissions, schema migration `20260814130000_operational_workflow_upgrades`, `docs/OPERATIONAL_WORKFLOW_UPGRADES.md`, and focused workflow contract tests. No new environment variable is required; the existing `CRON_SECRET` protects scheduled effective-date processing.
- Validation: Prisma schema format/validate passed; Prisma client generation passed with `--no-engine` after the standard Windows engine DLL was locked by another process; TypeScript passed; ESLint passed; the full mocked suite passed with 62 files and 359 tests; the Next.js 16.2.12 production build compiled all 192 pages; focused final regressions passed with 3 files and 21 tests; `git diff --check` passed. The local disposable PostgreSQL integration suite could not run because `TEST_DATABASE_URL` and Docker are unavailable; GitHub CI owns that guarded database gate, but its private status cannot be read from this environment because GitHub CLI is not authenticated.
- Released implementation commit `47f6b4b` to `main`. Vercel production deployment `dpl_GGHWpQ9Y1M6PB3Ey9wpziJpjiMj1` reached Ready. Its build log confirms the production Neon migration applied successfully, 137 permissions and role grants were seeded, and all 192 routes compiled. `https://app.rockfrostgroup.com/api/health` returned HTTP 200 with the database reachable; all three new authenticated routes returned the expected HTTP 307 login redirect without credentials. The runtime error scan contained only three membership-resolution entries generated by those deliberate unauthenticated route probes; no build, migration, health, or signed-in runtime error was observed.

## 2026-08-13: Security control hardening

- Added global CSP, HSTS, clickjacking, MIME-sniffing, referrer, permissions, DNS-prefetch, and opener-policy headers in `next.config.ts`.
- Added server-verified Cloudflare Turnstile support for login, password-reset requests, and the public contact form. It requires `NEXT_PUBLIC_TURNSTILE_SITE_KEY` and `TURNSTILE_SECRET_KEY`; without the secret, production remains available and the widget is not rendered.
- Added a CI security job using `npm audit --audit-level=high` and full-history Gitleaks scanning. Applied non-breaking lockfile security updates; `npm audit --omit=dev --audit-level=high` now reports zero vulnerabilities.
- Added `test/security-hardening.test.ts`, updated `.env.example`, `README.md`, and `docs/HARDENING_PLAN.md`. No schema or migration change. PostgreSQL RLS and broader business-field encryption remain a separate architecture phase, not silently represented as complete.
- Validation: focused security/contact/auth tests passed (3 files, 11 tests); TypeScript and ESLint passed; dependency audit reported zero vulnerabilities; optimized production build compiled all 191 pages. The first full mocked-suite run found a pre-existing prohibited punctuation mark in two comments under the marketing component scan; those comments were corrected before the final suite rerun.
- Released as commit `1c03997` on `main`. Vercel production deployment `dpl_2z6kNiFrgMX3KxrYPqhc2RzgqHM8` reached Ready and received all production aliases. Post-deploy checks: login and contact returned HTTP 200; `/api/health` returned HTTP 200 with the database reachable; live responses contained the expected CSP, HSTS, frame denial, MIME-sniffing, permissions, and referrer headers; deployment logs completed without a build or deployment error.

## 2026-08-13: Restrained public design and editorial punctuation

- Reduced the shared public hero scale and description size, tightened its spacing, and simplified the Company hero proof panel.
- Replaced atmospheric radial glows, fixed background effects, glass blur, and the decorative CTA circle with a restrained corporate background, solid panels, subtle borders, and limited shadow.
- Removed the prohibited punctuation character from public marketing copy. `AGENTS.md` now prohibits it in customer-facing content, and `test/editorial-punctuation.test.ts` prevents it from returning to public source.
- No schema or environment changes. Validation: focused design, Company, and punctuation tests passed (3 files, 6 tests); TypeScript passed; ESLint passed; full mocked suite passed (57 files, 316 tests); Next.js 16.2.12 production build compiled and generated all 191 pages. The first full-suite run exposed only a five-second timeout in the new repository scan while tests ran in parallel; the scan timeout was raised to 15 seconds and the complete suite then passed.

## 2026-08-13 — Support bubble: open/close animation and mobile responsiveness (Claude, on `main`)

Direct owner follow-up on the floating support bubble shipped earlier the same day: "let the animation be in nice
style when you click on the chat bubble" and "let the chat pop up be responsive enough."

### What shipped

- **Open/close animation**: switched from an abrupt conditional-mount to a real enter/exit animation using
  `tw-animate-css` (the same animation system already used by this design system's dropdown/menu components — no
  new dependency). Opening plays `fade-in-0 zoom-in-95 slide-in-from-bottom-4` (200ms, `origin-bottom-right` so the
  panel visually grows out of the bubble). Closing doesn't unmount instantly: `FloatingSupportWidget` now tracks
  `open` (logical state) separately from `rendered` (DOM presence) — closing flips `open` immediately (playing a
  150ms `fade-out-0 zoom-out-95 slide-out-to-bottom-2`, with `pointer-events-none` so the fading panel can't still
  be clicked), then unmounts ~160ms later once the animation has had time to finish. The bubble's own icon morphs
  between a message icon and a close (X) icon via a crossfade + rotate transition instead of swapping abruptly, and
  both bubbles (tenant and platform) get a brief scale/fade entrance on first mount plus `hover:scale-105`/
  `active:scale-95` press feedback, consistent with this design system's existing button press behavior.
- **Responsiveness**: below the `sm` breakpoint the panel is now `inset-4` (near-full-screen, a real single-hand
  mobile chat surface) instead of a small fixed-size corner card; at `sm`+ it's the original `w-96`/`h-[32rem]`
  anchored card. `SupportChat` gained an optional `className` prop (merged via `cn`/`tailwind-merge`) specifically
  so the floating widget can override its default fixed height with responsive sizing, without touching the two
  full, non-floating `/app/support` / `/app/platform/support` pages that still use the component's default size.
- Everything above collapses to near-instant automatically under `prefers-reduced-motion`, via this codebase's
  existing blanket rule in `globals.css` — no new reduced-motion handling was required.

### Important files

`src/components/support/floating-support-widget.tsx` (open/close animation state machine, icon morph, responsive
panel), `src/components/support/floating-support-link.tsx` (matching entrance/press micro-interaction),
`src/components/support/support-chat.tsx` (new optional `className` prop), `docs/SUPPORT_MESSAGING.md`. No schema,
migration, Server Action, or test-behavior change — this is a client-side styling/animation pass only, so the
existing `test/support-messaging.test.ts` suite required no changes.

### Validation

`npx tsc --noEmit --incremental false`: clean. `npm run lint`: clean (after removing one now-unnecessary
`eslint-disable` comment). `npx vitest run`: **53 files / 306 tests passed**, unchanged — no test logic touches
CSS/animation. `npm run build`: succeeded, 190 routes. Directly inspected the compiled production CSS
(`.next/static/chunks/*.css`) and confirmed every `tw-animate-css` utility class used
(`zoom-in-75`, `zoom-in-95`, `zoom-out-95`, `slide-in-from-bottom-4`, `slide-out-to-bottom-2`, `fade-in-0`,
`fade-out-0`, `animate-in`, `animate-out`, `origin-bottom-right`) resolved to real generated CSS rules (e.g.
`.zoom-in-75{--tw-enter-scale:.75}`) rather than being silently dropped as unrecognized by Tailwind's JIT — the
concrete risk with hand-typed utility class names that don't error if wrong. Also ran a local `next start` smoke
test (real production server, real dev database): `/`, `/login`, `/api/health` all returned 200/reachable.

No authenticated browser verification of the actual animation motion or mobile layout was possible in this
environment (no tenant/platform login credentials available) — disclosed gap, not a claimed pass. Confidence here
rests on: the same animation utilities already working correctly elsewhere in this codebase (dropdown/menu
components), confirming the generated CSS is real (not silently dropped), and the standard, well-established
"delay unmount past animation duration" React pattern used for the exit transition.

### Deployment

Direct request on `main`, not branch-scoped — taken through the full release lifecycle per this repository's
default. Commit `0d3c150` was pushed to `origin/main`; Vercel production deployment `dpl_4RSHJyadFYb17CaBbAtxPCW3RuyT`
reached `Ready` and was aliased to `www.rockfrostgroup.com`/`app.rockfrostgroup.com`/`admin.rockfrostgroup.com`.
No schema change, so no migration ran.

**Production verification:** `www.rockfrostgroup.com/api/health` returned 200 with `"database":"reachable"`.
`app.rockfrostgroup.com/login` returned 200; `/app/dashboard` (where the bubble mounts) correctly redirected an
unauthenticated visitor (307). Scanned post-deploy runtime logs for `error`-level entries: only the same
pre-existing `"No organization membership found for the current user."` pattern already recorded as harmless in
both prior support-messaging releases — no new error types introduced by this styling/animation change.

## 2026-08-13 — Support messaging follow-up: floating bubble, read receipts, quick-reply templates (Claude, on `main`)

Direct owner follow-up request on the support-messaging feature shipped earlier the same day: enable a read-receipt
flow, add optional quick-reply message templates, and replace the sidebar "Support" nav entry with a floating chat
bubble icon on both sides.

### What shipped

- **Floating chat bubble, not a sidebar link**: `src/app/app/layout.tsx` (the one layout every authenticated route
  nests under) now mounts a floating bottom-right widget for every tenant page. Tenant identity gets
  `FloatingSupportWidget` — a self-contained bubble that expands into a full chat panel in place, lazy-loading its
  message history on first open rather than fetching it on every page navigation (only a cheap unread-count query
  runs on every request). Platform identity gets `PlatformSupportBubbleLink` — a bubble that links to the existing
  `/app/platform/support` two-pane inbox rather than an inline panel, since triaging many tenant conversations at
  once needs that page's list-plus-detail layout, not a small floating box. Both dedicated pages (`/app/support`,
  `/app/platform/support`) are kept and fully functional — only their `workspace-navigation.tsx`/
  `platform-navigation.tsx` sidebar entries were removed, and the tenant panel links back to the full page for
  anyone who needs the larger surface.
- **Read receipts**: `otherPartyReadAt(conversation, viewerRole)` (`src/lib/support/service.ts`) exposes the other
  side's existing read cursor from the viewer's perspective. `sendMessage` now returns `{ message, conversation }`
  (a signature change propagated through both actions.ts files and `SupportChat`'s `onSend`/`onPoll` prop types).
  Each of the viewer's own sent messages renders a `Check`/`CheckCheck` icon with an accessible "Sent"/"Read" text
  equivalent — never icon-only, matching the existing online-indicator convention.
- **Optional quick-reply templates**: `src/lib/support/templates.ts` exports `TENANT_SUPPORT_TEMPLATES` and
  `PLATFORM_SUPPORT_TEMPLATES` (plain label/content data). `SupportChat` renders them behind a "Quick replies"
  dropdown next to the composer; selecting one only populates the draft — it never auto-sends, so the user can
  still edit before submitting.
- `SupportChat`'s message-poll effect now fires once immediately on mount (previously only on the 4-second
  interval) — necessary so the floating widget's lazy-loaded panel populates right away instead of sitting empty;
  harmless extra request on the full pages, which already had accurate SSR data.

### Important files

`src/components/support/floating-support-widget.tsx` (new), `src/components/support/floating-support-link.tsx`
(new), `src/lib/support/templates.ts` (new), `src/lib/support/service.ts` (`otherPartyReadAt`, `sendMessage`
return-shape change), `src/components/support/support-chat.tsx` (read receipts, templates dropdown, optional
`onClose`/`expandHref` header actions, immediate first poll), both support `actions.ts` files (return
`otherPartyReadAt`; added `getPlatformSupportUnreadCount`), `src/app/app/layout.tsx` (mounts the widgets),
`src/platform/modules/workspace-navigation.tsx` and `platform-navigation.tsx` (Support nav entries removed;
`getPlatformNavigation` reverted from async to sync now that it no longer queries unread count itself — its one
call site in `src/app/app/platform/layout.tsx` updated to match), `docs/SUPPORT_MESSAGING.md`,
`docs/ARCHITECTURE.md`, `README.md`. No schema or migration change — purely additive to the existing
`SupportConversation`/`SupportMessage` read-cursor fields.

### Validation

`npx tsc --noEmit --incremental false`: clean (after fixing two real issues found during this pass — a return-type
mismatch in the concurrency integration test after `sendMessage`'s shape changed, and an unsupported regex `s`
flag under this project's TS target). `npm run lint`: clean (after fixing one real `react-hooks/set-state-in-effect`
violation — `FloatingSupportWidget` was calling `setUnread(0)` synchronously inside an effect on open; moved into
the click handler that toggles `open` instead). `npx vitest run`: **53 files / 306 tests passed** (16 in
`test/support-messaging.test.ts`, up from 13 — added `otherPartyReadAt` coverage, a template-selection-never-
auto-sends regression test via source inspection, and updated the nav-registration test to assert Support is
**absent** from both sidebar nav files and present in `src/app/app/layout.tsx` instead). `npm run build`: succeeded,
190 routes. Also ran a local `next start` smoke test (real production server, real dev database) and curled `/`,
`/login`, and `/api/health` — all 200, health reachable, no errors in server logs.

No authenticated browser verification of the floating bubble's actual open/close/send/template UI was performed
(no tenant/platform login credentials available in this environment) — disclosed gap, not a claimed pass. The
existing real-Postgres integration suites continue to be written-but-unexecuted locally (no `TEST_DATABASE_URL`
here) and now also type-check cleanly against the updated `sendMessage` return shape; they do run for real against
a disposable Postgres container in this repository's GitHub Actions CI on every push to `main`.

### Deployment

Direct request on `main`, not branch-scoped — taken through the full release lifecycle per this repository's
default. Commit `c0dfade` was pushed to `origin/main`; Vercel production deployment `dpl_3jpWw6bikKrVb5ebKPn5kP5Svidm`
reached `Ready` and was aliased to `www.rockfrostgroup.com`/`app.rockfrostgroup.com`/`admin.rockfrostgroup.com`. No
schema change, so no migration ran as part of this build.

**Production verification:** `www.rockfrostgroup.com/api/health` returned 200 with `"database":"reachable"`.
`app.rockfrostgroup.com/login` and `admin.rockfrostgroup.com/login` both returned 200. `/app/support`,
`/app/platform/support`, and `/app/dashboard` (where the floating bubble now also mounts, since it's global) all
correctly redirect an unauthenticated visitor to `/login` (307). Scanned post-deploy runtime logs for `error`-level
entries: only the same pre-existing `"No organization membership found for the current user."` pattern already
recorded as harmless in the prior release's verification (an anonymous request racing the parent layout's
`redirect("/login")` against the page's own `requireCurrentTenant()` call — the visitor still lands on `/login`
correctly every time) — now also observed on `/app/dashboard`, confirming it is unrelated to this change. No other
error patterns were present, and real authenticated traffic in the log window (`POST /app/support`, various nav
`GET`s) returned clean 200s.

## 2026-08-13 — In-app support messaging (Claude, on `main`)

Direct owner request: an in-app chat so tenants can reach out with enquiries/problems, with a reply pane for the
owner, an online indicator both directions, and — explicit constraint — **nothing sent to the owner's email**.
Delivered as a new cross-cutting feature (not a business module), taken through the full production release
lifecycle since the request had no branch-scoping instruction.

### What shipped

- **Tenant side**: `/app/support` — any active organization member (`requireCurrentTenant()` only, no module
  permission gate) can message Rock Frost and read the full history in one persistent conversation. Sidebar nav
  entry with a live unread-count badge (`workspace-navigation.tsx`).
- **Platform side**: `/app/platform/support` — a two-pane inbox (`requirePlatformOperator()` at the page, plus a
  role re-check inside every Server Action) listing every real tenant conversation with unread counts, a
  resolve/reopen control, and the same chat UI. Sidebar nav entry with a live unread-count badge
  (`platform-navigation.tsx`, whose exported nav array became an async function to support the live count).
- **Presence ("online indicator")**: no WebSocket infrastructure exists in this app, so presence is a lightweight
  heartbeat (`UserPresence.lastSeenAt`, upserted every 20s while a support surface is open and the tab is visible)
  with a 45-second online window — never color-only in the UI, paired with an explicit "Online"/"Offline" label.
- **Message delivery**: polling every 4 seconds, gated on `document.visibilityState === "visible"` (a
  `visibilitychange` listener stops both polling and heartbeats the instant a tab backgrounds), with client-side
  deduplication so a just-sent message is never double-appended when the next poll also returns it.
- **No email, verified**: there is no `sendEmail`/Resend call anywhere in the feature's service or actions files;
  enforced by a source-grep regression test (`test/support-messaging.test.ts`), not just by omission.
- **HCI**: `aria-live="polite"` announcement region for new messages, sr-only form label, Enter-to-send/
  Shift+Enter-newline, auto-scroll that only fires when the viewer was already near the bottom, disabled-while-
  sending state with an inline retry message on failure.
- Deliberately **not a module**: no `platform/modules/registry.ts` entry, no permission prefix, and excluded from
  the tenant backup/export system — matching the existing `Notification`/`AuditLog` precedent, since message
  history can reference a platform operator's identity that must never leak into a tenant's own data export.

### Important files

`prisma/schema.prisma` (new models `SupportConversation`/`SupportMessage`/`UserPresence`, new enums
`SupportConversationStatus`/`SupportSenderRole`), migration `20260813040000_add_support_messaging`,
`src/lib/support/service.ts`, `src/components/support/support-chat.tsx`,
`src/app/app/(overview)/support/{page,actions}.tsx`, `src/app/app/platform/support/{page,actions}.tsx`,
`src/platform/modules/workspace-navigation.tsx` (now async), `src/platform/modules/platform-navigation.tsx`
(`platformNavigation` array renamed to async `getPlatformNavigation()` — its one call site in
`src/app/app/platform/layout.tsx` was updated), `docs/SUPPORT_MESSAGING.md`, plus additive pointers in
`docs/ARCHITECTURE.md`, `docs/AUTHENTICATION_AND_AUTHORIZATION.md`, `docs/MODULE_BOUNDARIES.md`, and `README.md`.
No environment variable was added.

### Validation

`npx prisma validate`/`generate`: passed (with the documented harmless local `DIRECT_URL` mirror; empty in this
checkout's `.env` by design). `npx tsc --noEmit --incremental false`: clean. `npm run lint`: clean. `npx vitest
run`: **53 files / 303 tests passed** (up from the pre-existing 52/290 baseline — the 13 new tests are
`test/support-messaging.test.ts`, a mocked-DB suite covering tenant-isolation behavior and a source-level
regression guard against any email code path). `npm run build`: succeeded, both new routes compiled
(`/app/support`, `/app/platform/support`).

Two real-Postgres integration suites were written
(`test/integration/tenant-isolation/support-messaging.test.ts`,
`test/integration/concurrency/support-messaging.test.ts`) covering cross-org isolation, read-state isolation,
presence isolation, platform-inbox correctness, and concurrent sends/reads/heartbeats (relying on Prisma's atomic
`upsert` for the conversation-creation race rather than an app-level retry, since there is no sequential number to
compute the way tenant-facing record numbering needs one). **These did not run** — this checkout has no
`TEST_DATABASE_URL`/disposable test database, consistent with every other integration suite added this session;
they type-check cleanly under the same `tsc` run as the rest of the repository.

No authenticated browser verification was performed (no tenant/platform login credentials available in this
environment) — this is a disclosed gap, not a claimed pass.

### Deployment

Direct request on `main`, not branch-scoped — taken through the full release lifecycle per this repository's
default. Commit `bffb32d` was pushed to `origin/main`, and Vercel production deployment `dpl_FD8V5WkLDJ56Uce7XvJUKZ7eHTUu`
reached `Ready` and was aliased to `www.rockfrostgroup.com`/`app.rockfrostgroup.com`/`admin.rockfrostgroup.com`.
The production build's `prisma migrate deploy` step applied migration `20260813040000_add_support_messaging`
before `next build`, so no separate manual migration step was needed.

**Production verification:** `www.rockfrostgroup.com/api/health` returned 200 with `"database":"reachable"`.
`app.rockfrostgroup.com/login` and `admin.rockfrostgroup.com/login` both returned 200. Both new routes correctly
redirect an unauthenticated visitor to `/login` (307, `Location: /login`): `app.rockfrostgroup.com/app/support`
and `admin.rockfrostgroup.com/app/platform/support`. Scanned post-deploy runtime logs: the only `error`-level
entries were `"No organization membership found for the current user."` on `/app/support` — and confirmed this
is **pre-existing, unrelated behavior**, not a regression: the exact same error appears for `/app/dashboard` and
`/app/notifications` (unmodified pages) under the identical anonymous-request condition, a known Next.js RSC race
between the parent layout's `redirect("/login")` and the page's own `requireCurrentTenant()` call — the visitor
still lands on `/login` correctly (307) in every case, matching this repository's existing accepted behavior. No
other error/warning log entries were present.

## 2026-08-13 — Ambient shimmer on the Rock Frost wordmark (Claude, on `main`)

Direct owner request: "can you animate this?" against `public/RFGgg.png`. Presented four scoped options (one-time
entrance, hover-only, auth-screen-only, or an always-on ambient loop) since the app's own `docs/DESIGN_SYSTEM.md`
explicitly rejects decorative gradients/motion in persistent chrome by default; the owner chose the always-on loop.

### What shipped

A masked light sweep — a bright diagonal band crosses the wordmark's own lettering (never a plain rectangle over
the transparent background) roughly every 4.5 seconds. Implemented once in `src/app/globals.css`
(`.logo-shimmer`/`.logo-shimmer-band`/`@keyframes logo-shimmer-sweep`) and consumed by the single shared
`src/components/layout/logo.tsx`, so it applies everywhere the logo renders — public header, authenticated app
shell/sidebar, and auth pages — with no per-call-site changes needed. Respects the existing app-wide
`prefers-reduced-motion` rule already in `globals.css`; verified the animation's computed `animation-duration`
collapses to `0.01ms` under reduced motion, same as every other animation in the app.

### A real bug found and fixed during verification, worth recording

The first implementation animated `background-position` directly on the same element carrying the `mask-image`.
Screenshots showed no visible shimmer at all across many sampled frames. Isolated the cause by hand: a **static**
masked fill (mask clipping a solid color to the wordmark's alpha shape) rendered correctly, but the same element
with an **animated** `background-position` under that same mask silently stopped repainting per frame in
Chromium — despite `getComputedStyle` reporting the animation as genuinely "running" the whole time. Fixed by
splitting responsibilities across two elements: the mask stays static on the wrapper; the moving light band is a
separate plain child animated with `transform: translateX(...)` only (compositor-driven, doesn't hit this issue).

A second false trail during verification: my own test script paused the animation and then changed
`animation-delay` to try to force specific frames — this doesn't work, a paused CSS animation stays frozen at
whatever moment it was paused regardless of later delay changes, so every "forced" screenshot was silently showing
the same frozen frame. Caught this by switching to the Web Animations API's `currentTime` property
(`element.getAnimations()[0].currentTime = ms`), which does seek correctly, and confirmed the effect renders
correctly both via forced seeking and natural real-time playback (real `next start` production build, screenshotted
with Playwright). Full detail recorded in `docs/UI_UX_REFRESH.md`'s "Ambient shimmer" section for whoever touches
this next.

### Files changed

`src/app/globals.css`, `src/components/layout/logo.tsx`, `docs/UI_UX_REFRESH.md`.

### Validation

`npx tsc --noEmit --incremental false`: clean. `npm run lint`: clean. `npx vitest run`: **52 files / 290 tests
passed**, no regressions (this is a pure CSS/markup change with no logic to unit-test). `npm run build`:
`✓ Compiled successfully`. Visually verified against a real `next start` production build with Playwright: the
sweep is visible crossing the lettering in both forced-seek and natural real-time playback, and confirmed inert
under `prefers-reduced-motion`.

### Deployment

Direct request on `main`, not branch-scoped — taken through the full release lifecycle per this repository's
default. Commit `2884aa7`, pushed to `origin`, deployed as the new Vercel production deployment (aliased to
`git-main`, status `Ready`). Production health returned 200, and screenshotting `rockfrostgroup.com` directly
(seeking the real animation to a mid-sweep frame via the Web Animations API) confirmed the shimmer is live on the
actual production domain, not just the local build. The post-deploy runtime-log scan was clean — `info`-level
entries only, no errors.

## 2026-08-12 — Hospital public module discovery

Added Hospital to the authoritative public SEO/module catalog so `/modules/hospital` is statically generated alongside the other available modules. The page describes operational capabilities without presenting the product as a medical device or clinical-decision engine.

## 2026-08-12 — Direct module-route access hardening

Post-deploy probes of Pharmacy and Hospital found that an authenticated account without an organization membership caused nested module pages to throw while the parent app layout rendered its intended “No organization access” state. Updated the shared module/platform access guards to redirect missing-tenant requests to the safe app dashboard state, and made both new module layouts tolerate the parent-owned empty state. This removes avoidable 500s and production error-log noise without weakening module, tenant, or permission checks.

The first implementation commit `937f921` changed the shared guard dependency and broke focused authorization mocks (10 failures); it was pushed because the sequential shell command did not stop after the test failure. The follow-up restores the established `requireCurrentTenant` contract and catches only its exact missing-membership error. This correction must pass the focused and full CI gates; do not treat `937f921` alone as releasable.

## 2026-08-12 — Pharmacy and Hospital integration audit

Merged the independently developed Hospital vertical into `codex/pharmacy-production`. All shared-file conflicts were additive and resolved to retain both verticals across the module registry, dashboard widgets, permissions, seed roles, backup scopes, schema, README, and operator documentation. During validation, the first schema merge placed organization-side Hospital relations inside `User`; Prisma caught the duplicate fields before migration or deployment, and the relations were corrected into `Organization`. A second validation caught the two module registry definitions sharing one object; they are now separate entries. Combined strict TypeScript and ESLint pass, and the merged mocked suite passes 52 files / 290 tests. Local `prisma validate` remains unable to complete because this workstation resolves `DIRECT_URL` to an empty value; schema formatting/client generation succeeded and the disposable-PostgreSQL CI integration job is the authoritative migration/schema gate before release.

The first CI integration run `31556888096` failed safely before release: the Prisma Hospital models contained optional generic `userId`/`moduleId` ownership fields that Claude's SQL migration did not create and its services did not use. Removed those unintended relations from all Hospital models and their inverse `User`/`Module` lists, bringing the schema back into exact agreement with the migration and organization-owned tenancy design. Prisma validate and client generation now pass with a non-production placeholder connection URL. The full CI gate must be rerun; this failure was not deployed.

The second CI run `31557280185` confirmed schema migration success and passed the complete validation/build job, then exposed a real provider-scheduling race: two overlapping appointments could both pass a pre-transaction availability query. Moved availability checking and creation into one transaction protected by a provider-and-tenant-scoped PostgreSQL advisory transaction lock. This must pass the full integration rerun before release.

## 2026-08-12 — Pharmacy safety-control completion

Added reason-required batch quarantine, recall, and safe release actions. Empty or expired batches cannot be released, and every transition is tenant-scoped and audited. Added dispensing reversal as an auditable compensating transaction: original dispensing records remain immutable, eligible stock and prescription quantities are restored, controlled-medicine register reversals are appended, and recalled/quarantined stock is never silently made available. Important files are `src/modules/pharmacy/service.ts`, `src/app/app/pharmacy/actions.ts`, `src/app/app/pharmacy/stock/page.tsx`, and `src/app/app/pharmacy/dispensing/page.tsx`. Strict TypeScript, ESLint, and the Pharmacy focused suite (1 file / 3 tests) pass; full-suite, build, and release evidence follow after the production gate.

## 2026-08-12 — Pharmacy-first healthcare expansion initiated

Defined the production and regulatory boundary for a new Pharmacy vertical, the subsequent Hospital vertical, and a supported offline/on-premise edition in `docs/PHARMACY_AND_HOSPITAL_ROADMAP.md`. Pharmacy must be completed and released before Hospital implementation begins. The roadmap explicitly covers Ghana-focused medicine records, batch/expiry/recall traceability, prescription and restricted-medicine controls, tenant isolation, immutable audit history, safe inter-module contracts, and the non-certification/legal boundary. Implementation is in progress and must not be presented or deployed as complete until all listed release gates pass.

Pharmacy implementation on `codex/pharmacy-production` now includes migration `20260812013000_add_pharmacy_module`, nine `pharmacy.*` permissions, Pharmacy Manager/Pharmacist/Pharmacy Technician roles, platform registry/launcher/dashboard/SEO integration, medicine and supplier records, traceable batches, patients and prescribers, prescription quantities, guarded FEFO dispensing, automatic controlled-medicine register entries, reports, settings, active-module JSON backup/restore and Excel export discovery, and tenant/concurrency integration tests. The service rejects expired/quarantined/recalled stock, foreign-tenant references, missing prescriptions for prescription-only/controlled products, over-dispensing, invalid discounts, and concurrent overselling. Strict TypeScript, Prisma generation/schema validation, ESLint (after warning cleanup), 51 unit files / 282 tests, and `git diff --check` passed. Disposable-PostgreSQL integration, production build, commit, deployment and live verification remain pending.
## 2026-08-12 — Hospital Management vertical implemented (Claude, branch `agent/claude-hospital-production`)

Full implementation of the Hospital Management vertical per task brief, built concurrently with Codex's Pharmacy
work. **Not merged to `main`, not deployed** — Codex integrates after Pharmacy's own release gates pass, per
`docs/PHARMACY_AND_HOSPITAL_ROADMAP.md`'s Pharmacy-first sequencing (this branch satisfies that ordering by never
touching `main`; only simultaneous *production activation* of both verticals is what that rule guards against).

### Working-tree safety note before this task started

On session start, this shared working directory (`C:\Users\andre\rock-frost-business-suite`) was on
`codex/pharmacy-production` with substantial **uncommitted** Codex work in progress (a ~300-line `prisma/schema.prisma`
draft, `docs/PHARMACY_AND_HOSPITAL_ROADMAP.md`, and edits to `prisma/seed-data.ts`/`src/lib/auth/permissions.ts`/
`src/platform/modules/registry.ts`), and more files were actively changing during this session (confirmed via a
later `git status` showing additional modified files than the first check — Codex was live in this same directory).
A direct attempt to preserve that work with a checkpoint commit on Codex's own branch was correctly blocked by the
Claude Code auto-mode classifier (committing on another agent's behalf isn't something to route around). Rather than
`git checkout` a branch in a shared dirty working tree — which risks corrupting a live concurrent session — this
work was done in a **separate git worktree** (`git worktree add ../rock-frost-hospital -b
agent/claude-hospital-production origin/main`), leaving Codex's directory and in-progress files completely
untouched throughout. The worktree was removed after pushing; only the branch remains.

### Scope delivered

All 12 scope areas from the task brief: facility/department/service/provider configuration; patient registration
with organization-unique MRN and advisory (never-blocking) duplicate detection; appointments with transactional
provider-conflict prevention; encounters with append-only vitals, immutable-once-signed clinical notes, diagnoses,
append-only care plans, and disposition; admissions/wards/beds with transactional double-occupancy prevention and
append-only transfer history; laboratory and imaging with an order → result/finding → verify → correct-by-
supersession pattern that never mutates a verified row; a Hospital-owned versioned medication-order contract that
never reads or writes a Pharmacy table; billing with `Decimal(12,2)` money throughout and transactional payment
application; nursing tasks, clinical alerts, referrals, append-only consent, and reference-only attachment metadata
(no binary file/DICOM storage — an explicit boundary, matching the imaging PACS boundary); per-facility settings;
and a real (not mocked) dashboard widget/overview page. Full detail, the invariant-to-enforcement table, and the
regulatory/product boundary statement are in the new `docs/HOSPITAL_MODULE.md`.

### Database

New hand-reviewed migration `prisma/migrations/20260812050000_add_hospital_module/migration.sql` (1,180 lines),
generated via `prisma migrate diff --from-schema-datamodel <pre-change schema> --to-schema-datamodel
prisma/schema.prisma --script` (offline, no live database touched) and manually reviewed: 33 new `Hospital*` tables,
21 new enums, zero `DROP` statements, every foreign key either references `Organization`/`Branch` (cascade, matching
every other module) or another new `Hospital*` table. Timestamp is after the latest pre-existing migration
(`20260811070000_add_subscription_seat_limit`) and does not touch or conflict with Codex's separate, still-
uncommitted Pharmacy migration draft (different timestamp namespace; Codex's migration did not exist as a committed
file at any point this branch could have collided with it).

### Permissions, roles, and shared-file changes

13 new `hospital.*` permission keys and 9 new least-privilege system roles (Hospital Administrator, Receptionist,
Doctor, Nurse, Laboratory Scientist, Radiology Staff, Hospital Pharmacist, Billing Officer, Records Officer) — full
per-role permission table in `docs/HOSPITAL_MODULE.md`. Every shared-file edit was additive only (new lines inserted
at the end of an existing list/object, nothing reordered, reformatted, or removed) and no Pharmacy content was
touched — Pharmacy's own draft edits to these same files exist only uncommitted in the other worktree and were never
visible to or read by this branch:

- `prisma/schema.prisma` — added 33 `Hospital*` models/21 enums at the end of the file, plus one relation line per
  model appended to `Organization` and one appended to `Branch`.
- `src/lib/auth/permissions.ts` / `prisma/seed-data.ts` — 13 `HOSPITAL_*` keys appended to each file's `PERMISSIONS`
  object (kept identical between the two, as that file's own comment requires); 9 role descriptions appended to
  `SYSTEM_ROLES`; 9 entries appended to `ROLE_PERMISSIONS`; one entry appended to `MODULES`.
- `src/platform/modules/registry.ts` — one `hospital` entry appended to the module list, `Hospital` icon import added.
- `src/platform/modules/dashboard-widgets.tsx` — one `hospital: HospitalDashboardWidget` entry appended.
- `src/lib/backup/scopes.ts` — `"hospital"` appended to `BACKUP_MODULES`.
- `src/lib/backup/tenant-backup.ts` — `hospital: ["Hospital"]` appended to `MODEL_PREFIXES`. No other backup/export
  code needed changes — Excel export, JSON export, and merge restore are fully generic over `BackupModule`.
- Docs (`ARCHITECTURE.md`, `MODULE_BOUNDARIES.md`, `AUTHENTICATION_AND_AUTHORIZATION.md`, `BACKUP_AND_RECOVERY.md`,
  `README.md`) — one additive paragraph/line each pointing at `docs/HOSPITAL_MODULE.md`, matching the existing
  Hotel/School references in the same files.

**Expected merge conflict for Codex to resolve:** none of the above should produce a real content conflict against
Pharmacy's eventual commits, since both branches only append to the *end* of the same lists/objects — Git will very
likely report a textual conflict on adjacent-line-insertion in `prisma/schema.prisma`'s `Organization`/`Branch`
relation blocks and in `permissions.ts`/`seed-data.ts`'s `PERMISSIONS`/`ROLE_PERMISSIONS` objects (both branches
inserting new lines at the same location relative to the shared base), but the resolution in every case is simply
"keep both additions" — there is no semantic overlap to reconcile.

### Tests

- `test/hospital-module-access.test.ts` (new, mocked-DB, 8 tests) — Hospital's counterpart to
  `test/module-access.test.ts` (Hospital isn't folded into that shared file, matching the existing precedent that
  Hotel/School aren't either): confirms every one of Hospital's 14 `page.tsx`/1 `actions.ts` file calls
  `requireModuleAccess("hospital")` and never a bare `requireCurrentTenant`, confirms the layout/dashboard-widget
  guard shape, confirms the module is registered in the registry/permissions/seed/backup-scope files, and confirms
  every `HOSPITAL_*` permission key and role-permission grant is identical between `permissions.ts` and
  `seed-data.ts`.
- `test/integration/tenant-isolation/hospital.test.ts` (new, real-Postgres, 5 tests) — cross-tenant provider/
  patient/bed/lab-test reference rejection, "lists only its own patients/providers."
- `test/integration/concurrency/hospital.test.ts` (new, real-Postgres, 6 tests) — concurrent patient registration
  (distinct MRNs), concurrent overlapping-appointment booking (exactly one succeeds), concurrent same-bed admission
  (exactly one succeeds, bed never double-occupied), concurrent overpaying invoice payments (exactly one succeeds,
  balance never negative), concurrent exact-settlement payments (both succeed, invoice reaches `PAID`), and a direct
  database assertion that correcting a verified lab result never mutates the original row (value preserved,
  `supersedesResultId` links the new row, history count is 2).

### Validation — run and result

- `npx prisma generate`: succeeded.
- `npx prisma validate`: `The schema at prisma\schema.prisma is valid`.
- `npx tsc --noEmit --incremental false`: clean, zero errors, across the entire repository including every new file.
- `npm run lint`: clean, zero errors/warnings.
- `npx vitest run` (full mocked suite): **51 files / 287 tests passed**, including the new 8-test Hospital file; no
  pre-existing test was modified or broken.
- `npm run build`: `✓ Compiled successfully`; all 14 `/app/hospital/*` routes present in the route manifest with no
  build errors.
- `git diff --check`: clean (only the repository's standard benign LF/CRLF autocrlf notice, no real whitespace errors).
- `git status` inspected before starting (see the working-tree safety note above) and again immediately before this
  commit: only the files listed above are staged; nothing belonging to Pharmacy, Codex, or any other concurrent
  agent was ever staged or committed by this branch.

**Not run — honestly disclosed, not claimed:** `npm run test:integration`. No `TEST_DATABASE_URL` was configured in
this environment (only `DATABASE_URL`/`DIRECT_URL` were available), so the guarded integration-test safety check in
`test/integration/setup/guard.ts` would correctly refuse to run against anything reachable here. The two new
integration test files above are written and were manually reviewed against the exact same pattern as the passing
Hotel/Accounting equivalents (`test/integration/tenant-isolation/hotel.test.ts`,
`test/integration/concurrency/accounting.test.ts`), but per `docs/TESTING_STRATEGY.md`'s own instruction, "an agent
without a reachable test database cannot honestly claim this step" — so it is not claimed here. **Before merging
this branch, run `npm run db:test:migrate && npm run test:integration` against a real guarded disposable database
and confirm all 11 new integration tests pass.**

No browser/E2E verification was performed — no tenant login credentials were available in this session. This is a
disclosed gap, not a hidden one; see `docs/HOSPITAL_MODULE.md`'s "Known gaps" section.

### Remaining regulatory/integration risks

1. **Pharmacy contract connection is not yet wired.** `HospitalMedicationOrder.externalDispenseReference` is a
   plain nullable string today. Codex's Pharmacy branch needs to decide the actual shape of what it writes there
   (a dispensing-record ID, a batch reference, etc.) after both branches merge — this was deliberately left as an
   opaque string specifically so neither branch needs to agree on Pharmacy's internal schema before merging.
2. **Regulatory/compliance claims are explicitly disclaimed, not implemented.** This module records operational
   data only; it does not itself satisfy Ghana Health Service/HeFRA, Data Protection Commission, or NHIA
   requirements — see `docs/HOSPITAL_MODULE.md`'s regulatory boundary section and the in-app disclosure text on the
   Hospital overview and settings pages.
3. **Real-Postgres integration suite unexecuted** — see "Validation" above. This is the single hardest blocker to
   close before this branch could ever be considered for production activation.
4. **Duplicate-patient detection not surfaced in the UI** — real, tested service function; not yet an inline
   registration-form warning. Documented in `docs/HOSPITAL_MODULE.md`.
5. **No E2E/browser verification.** Same "no credentials available" constraint noted elsewhere in this repository's
   history for similar sessions.

### Branch and commits

Branch `agent/claude-hospital-production`, pushed to `origin`. Not merged to `main`; Codex integrates after
Pharmacy's release gates pass. Implementation commit `b2be797` ("Add Hospital Management vertical: schema, module,
routes, tests"), followed by this documentation-finalization commit.

## 2026-08-12 — Member lifecycle and seat-aware role management

Tenant Administration now supports safe role changes plus reversible member deactivation/reactivation. Role assignment remains scoped to the tenant and its active modules, enforces destination-module seat capacity, protects the final active Organization Owner, and records audit events. Deactivation uses the existing `SUSPENDED` state, immediately removes the membership from both tenant authentication and seat usage, and prevents administrators from deactivating their own current membership; reactivation reacquires seats transactionally before restoring access. The seat summary now displays remaining capacity explicitly. Files: `src/app/app/(overview)/administration/{actions,page}.tsx`, `test/member-management.test.ts`, `docs/BILLING_AND_SUBSCRIPTIONS.md`, and `README.md`. Strict TypeScript, ESLint, the focused member/seat/tenant suite (4 files / 28 tests), the complete unit suite (50 files / 279 tests), `git diff --check`, and the full 164-page Next.js production build passed. Commit `bfae259` deployed as Vercel production deployment `dpl_L92gWaWSU7HYFgvY4GMyvxAHWtjX` (`READY`). Production health returned 200 and the unauthenticated Administration probe correctly redirected to `/login`; the only error-log entry was the expected missing-membership message caused by that deliberate protected-route probe.

## 2026-08-12 — Track alternate Rock Frost marketing wordmark

Added the previously local-only `public/rfggggg.png` transparent “Rock Frost Technologies” wordmark to source control as an approved alternate marketing asset. Runtime branding remains unchanged: compact application and public navigation continue to use `public/RFGgg.png`, while favicon, Apple, Android/PWA, and loading artwork remain untouched. `docs/UI_UX_REFRESH.md` now records the asset's intended scope. The PNG signature and `git diff --check` passed; no application test/build was required because this is an unused static asset plus documentation only. Commit `ada8dd1` deployed as Vercel production deployment `dpl_DaLNry9YFaJvJAqtB9dpexa2e9rZ` (`READY`). Production returned the asset as `image/png` with the expected 158,795-byte size, `/api/health` returned 200, and the post-deploy error-log scan was empty.

## 2026-08-12 — Extended uniform icon treatment to the rest of the product (Claude, on `main`)

Follow-up to the 2026-08-11 entry below. The user sent screenshots of the live site showing the same grey/black-vs-blue icon inconsistency was still visible in four places the first pass didn't reach: the `/app/modules` directory page, the header's module-launcher dialog, the home-dashboard's per-module tiles (both the generic fallback card and all 12 real per-module dashboard widgets), the platform-owner's own `/app/platform/dashboard` stat cards, and the public marketing site (home page module grid, `/modules` catalog, `/solutions`, `/industries`).

### Fix

Extracted the blue badge markup that `OverviewMetricCard` already used into a new standalone primitive, `IconBadge` (`src/components/ui/icon-badge.tsx`, three sizes), so there is now exactly one definition of the treatment instead of one real instance plus N copies waiting to drift. Applied it everywhere a plain `<Icon className="size-X text-muted-foreground" />` was standing in for a module, metric, or feature: `ModuleLauncher`, `/app/modules`, `/app/dashboard`'s fallback module card, all 12 `src/modules/*/dashboard-widget.tsx` files, and the four public pages listed above. Also made `OverviewMetricCard`'s `href` prop optional (falls back to a plain non-interactive card) and migrated the platform dashboard's three top-line stats onto it, since two of the three now have a sensible destination (Organizations, Module activations) and the component already existed for exactly this shape of data. Left untouched, deliberately: small icons that sit beside an already-titled section heading inside a card (`SettingsIcon`, `ImageIcon`, the `Activity` icon next to "Module adoption") — that's a different, already-uniform convention, not the inconsistency being reported.

### Files changed

New: `src/components/ui/icon-badge.tsx`. Modified: `src/components/dashboard/overview-metric-card.tsx`, `src/components/navigation/module-launcher.tsx`, `src/app/app/(overview)/modules/page.tsx`, `src/app/app/(overview)/dashboard/page.tsx`, `src/app/app/platform/dashboard/page.tsx`, all 12 `src/modules/*/dashboard-widget.tsx`, `src/app/(public)/page.tsx`, `src/app/(public)/modules/page.tsx`, `src/app/(public)/solutions/page.tsx`, `src/app/(public)/industries/page.tsx`, `docs/DESIGN_SYSTEM.md`.

### Validation

`npx tsc --noEmit --incremental false`: clean. `npm run lint`: clean. `npx vitest run`: **49 files / 276 tests passed**, no regressions. `npm run build`: `✓ Compiled successfully`. Visually verified this time (the public pages need no authentication, so this was safe against the shared database): ran a real `next start` production build and screenshotted `/solutions`, the home page's module grid, and `/modules` with Playwright — confirmed the RF-blue badge now renders identically everywhere the icon inconsistency had been reported, matching the user's own screenshots pixel-for-pixel in layout. Did not get a fresh authenticated screenshot of `/app/modules`, the module launcher, `/app/dashboard`, or `/app/platform/dashboard` (no tenant login credentials available in this session) — those four reuse the exact same `IconBadge` component just verified on the public pages, so the visual risk is the same component, not new styling.

## 2026-08-11 — Uniform icon treatment across all module overview pages (Claude, on `main`)

User reported the app UI looked inconsistent — some icons rendered blue, some black — across modules.

### Root cause

Not a styling bug, a component-drift problem. Hotel and School (the two most recently built modules) use a shared `OverviewMetricCard` component for their overview-page stat cards: icon in a `bg-primary/10 text-primary` badge (RF blue), the whole card is a clickable link, and a one-line description under the value. The other 11 modules (Fleet, Installment, CRM, Inventory, Accounting, HR, Payroll, Procurement, Projects, Analytics, POS) each hand-rolled their own near-identical `Card` markup instead, with a plain `<stat.icon className="size-4 text-muted-foreground" />` (grey/black, no badge) and a separate "View" button. Both patterns were internally consistent on their own — the inconsistency was only visible when moving between an older module and Hotel/School. (The main landing dashboard's per-module tiles and the platform-owner's own dashboard were already uniform and untouched by this — the drift was isolated to the 11 in-module overview pages.)

### Fix

Migrated all 11 affected pages to render their stat grid through `OverviewMetricCard`, matching Hotel and School exactly: converted each `icon: SomeIcon` component reference to `icon: <SomeIcon className="size-4" />`, added a short `description` line per stat (e.g., Fleet's "Vehicles" now reads "Vehicles registered in the fleet"), removed the now-unused `Card`/`Button`/`Link` imports and the separate "View" button, and standardized the grid breakpoint to `sm:grid-cols-2 xl:grid-cols-4` everywhere (previously a mix of `lg:`/`xl:`). Installment's conditional "Products" stat (only shown to users who can manage products) and Analytics's extra "Other key figures" `Card` panel were preserved as-is. `docs/DESIGN_SYSTEM.md` now documents `OverviewMetricCard` as the one standard stat-card component for every module, specifically so this can't drift apart again.

### Files changed

`src/app/app/{fleet,installment,crm,inventory,accounting,hr,payroll,procurement,projects,analytics,pos}/page.tsx`, `docs/DESIGN_SYSTEM.md`. No component, schema, or route changed — this is a pure consumer-side migration onto an existing, already-shipped component.

### Validation

`npx tsc --noEmit --incremental false`: clean. `npm run lint`: clean. `npx vitest run`: **49 files / 276 tests passed**, no regressions. `npm run build`: `✓ Compiled successfully`. Not independently screenshotted against a live authenticated session this pass — no tenant login credentials were available in this session — but the change reuses `OverviewMetricCard` exactly as already shipped and visually verified on the Hotel and School overview pages, with no changes to that component itself.

## 2026-08-11 — Enforced per-module subscription user seats

Module subscriptions now support a positive `seatLimit` or explicit unlimited access. Active members and pending invitations consume seats according to the permission prefix of their assigned role; multi-module roles consume one seat in each module they can access. Tenant Administration and Billing display usage, while the platform subscription workspace sets and updates limits and prevents lowering below assigned usage. Invitation writes enforce capacity inside the membership transaction under an organization-scoped PostgreSQL advisory lock, closing concurrent over-allocation races; revoked invitations release their reserved membership seat. Legacy null limits remain unlimited until configured. Migration `20260811070000_add_subscription_seat_limit` adds the nullable field plus a positive-value database check constraint. Local validation passed: Prisma schema validation, strict TypeScript, ESLint, 49 test files / 276 tests, `git diff --check`, and the full 164-page Next.js production build. GitHub Actions run `31471788351` passed both validate and disposable-PostgreSQL integration jobs, including migration application and the new real-database seat-cap tests. Commit `584170b` deployed as Vercel production deployment `dpl_2nX8kU3wH8jVmSM56twmDUkzQCgN` (`READY`); build logs confirm migration `20260811070000_add_subscription_seat_limit` applied successfully. Production `/api/health` returned 200 with the database reachable, while unauthenticated Administration and Billing probes redirected to `/login`. The post-deploy error scan contained only the expected missing-membership errors generated by those deliberate unauthenticated protected-route probes; no unrelated runtime error was observed.

## 2026-08-11 — Inventory item image upload

Inventory managers can now attach an optional JPG, PNG, or WebP image (maximum 1 MB) while creating an item, replace it while editing, or explicitly remove it. Upload validation checks both size/MIME and file signatures. Images are stored on the tenant-owned `InventoryItem`, shown as bounded thumbnails in the catalog, and delivered through an authenticated Inventory-access route that scopes the item lookup to the active organization and uses `nosniff`/private cache headers. Migration `20260811030000_add_inventory_item_image` adds nullable `InventoryItem.imageData`; no environment change is required. Prisma generation/schema validation, focused image tests (2 files / 5 tests), strict TypeScript, ESLint, the full unit suite (48 files / 273 tests), and the 164-page production build including the protected image route passed. GitHub Actions run `31464466167` successfully migrated disposable PostgreSQL and passed the complete real-PostgreSQL integration/concurrency suite, including the new Inventory image isolation assertion. Its validate job exposed an existing homepage build/configuration mismatch: the new database-backed showcase was being prerendered while CI intentionally supplied an unreachable placeholder database. The homepage now uses Next.js `connection()` to declare request-time rendering, matching its owner-controlled database content and removing build-time database dependence. Corrected CI run `31464846448` passed both validate and disposable-PostgreSQL integration jobs completely. Commit `9d5de8f` deployed as Vercel production deployment `dpl_Cs2DL2qWwCJ4dfWvQxTH4g6TvcN5` (`READY`); build logs confirm migration `20260811030000_add_inventory_item_image` applied successfully. Production health and homepage returned 200, the unauthenticated item-image route returned 401, and the post-probe runtime-error scan was empty.

## 2026-08-11 — Fix: showcase logos permanently stuck on empty skeleton in production (Claude, on `main`)

User reported via a live production screenshot that all three homepage customer-showcase cards rendered as empty gray skeleton boxes — no logo, not even the demo SVG marks — with no error. This was a regression from the same-day showcase redesign shipped in commit `941f71c` below.

### Root cause

`LogoFrame` (`src/components/marketing/customer-showcase.tsx`) tracked load state purely via the `<img>` element's `onLoad`/`onError` React handlers, initialized to `"loading"`. That's vulnerable to a standard SSR hydration race: the browser starts fetching a server-rendered `<img>` the instant it parses the HTML, which can finish (and fire its native `load`/`error` event) before React finishes hydrating and attaching the `onLoad`/`onError` listeners. The event fires into the void, the listener that would have flipped `status` to `"loaded"` never existed yet, and — critically — the native load event does not fire again later, so the component was left permanently in `"loading"`, hiding the actual (fully downloaded) image behind `opacity-0` forever. This hit small/fast/cached same-origin assets hardest, which is exactly the demo SVGs and any already-cached real logo — i.e., the common case on a live production load, not an edge case.

### Fix

Added a `useRef<HTMLImageElement>` on the `<img>` plus a `useEffect` that checks `imgRef.current?.complete` once on mount and immediately resolves `status` from `naturalWidth > 0` if the image had already finished loading (successfully or not) by the time the effect runs. This is the standard fix for this exact class of bug: `.complete` reflects the image's real current state regardless of whether any event listener was attached in time to observe the transition into that state.

### Validation

- `npx tsc --noEmit --incremental false`: clean in every file this change touches (one pre-existing, unrelated error remains in Codex's `test/tenant-excel-export.test.ts`, confirmed via `git log` to predate and be unrelated to this fix).
- `npm run lint`: clean.
- `npm run build`: `✓ Compiled successfully`.
- `npx vitest run`: **46 files / 268 tests passed**, including both showcase test files, unchanged.
- **Real production-build verification, not code-only reasoning:** ran `npm run start` (actual `next start`, not `next dev`) and screenshotted the live-equivalent homepage with Playwright. First load after the fix showed all logos (the real "God's Love Ventures" logo and both visible demo SVG marks) rendering correctly instead of empty boxes. Additionally reproduced and re-verified the worst case directly: reloaded in the same browser context so every asset served from cache (maximizing the race window), and inspected the actual `<img>` DOM state (`complete`/`naturalWidth`/computed `opacity`), not just pixels. Immediately after `domcontentloaded` nothing had loaded yet (expected — nothing anomalous). After a short realistic delay, the demo SVGs — the fastest assets and the ones the bug hit hardest — resolved to `complete: true, naturalWidth: 150, opacity: 1` and stayed resolved; the real tenant logo (served through the `private, no-store` external-showcase-logo API route, so never browser-cached) took roughly one second of genuine server round-trip time before resolving to `complete: true, naturalWidth: 371, opacity: 1` — normal in-flight latency correctly shown by the skeleton pulse, not the bug.

### Files changed

`src/components/marketing/customer-showcase.tsx` only (12 lines added to `LogoFrame`; no other component, route, or test changed).

### Commit

Committed directly to `main` per this repository's default production-release rule (a direct bug-fix request, not a branch-scoped task).

## 2026-08-11 — Customer Excel exports and showcase integration

Added a customer-readable `.xlsx` export beside the existing JSON system backup in `/app/organization/backups`. Excel and JSON independently recompute the current tenant's active subscription/module scope on the server; inactive modules, other tenants, authentication/password data, and platform records remain excluded. The workbook contains an export summary and one filterable, frozen-header worksheet per selected data model, preserves scalar types, renders structured values readably, and neutralizes formula-like text to prevent spreadsheet formula injection. Excel is intentionally reporting-only; merge restore continues to accept only the lossless JSON backup. Added ExcelJS with its vulnerable transitive UUID dependency overridden to the patched major release; the remaining production audit findings pre-date this feature and are outside this dependency path. No schema migration or environment change is required. Also integrated Claude's reviewed customer-showcase carousel commits (`941f71c`, `f10c08d`) into the release candidate. Strict TypeScript, ESLint, focused workbook/route tests (2 files / 5 tests), the complete unit suite (46 files / 268 tests), the 164-page production build including `/api/organization/backup/excel`, and workbook ZIP/load verification passed. Commit `c972a51` deployed as Vercel production deployment `dpl_EKzwnT48TaTtTrM1KaUirK9K664H` (`READY`). The public homepage, production health endpoint, and showcase content returned successfully; the unauthenticated Excel route returned 401, and the post-probe runtime-error scan was empty.

## 2026-08-11 — Customer showcase redesign (Claude, branch `agent/claude-showcase-redesign`)

Scoped exactly to the assigned task: redesign the public homepage customer-showcase/logo carousel to look premium and production-ready, without touching unrelated features. **Not merged to `main`, not deployed** — per the task brief, Codex reviews, merges, pushes, and deploys. Branch and commit hash are at the bottom of this entry.

### What was wrong

The showcase rendered as one oversized hero panel (a full-height dark logo panel beside a separate quote panel) plus a row of small logo "switcher" thumbnails underneath — a lot of empty space, no consistent card language, and a visual style that didn't match the rest of the marketing site. There was also no way to show the section credibly before enough real customers had approved publication, and no fallback for a logo that fails to load.

### What changed

**Card redesign** (`src/components/marketing/customer-showcase.tsx`, full rewrite): each customer is now a self-contained card — a bounded logo frame with a consistent size, soft `bg-muted` background, subtle border, and `object-contain` (so a wide wordmark and a square mark both sit correctly without cropping or an oversized empty box); name/industry; a quote that wraps naturally rather than truncating mid-sentence; and an attribution footer pinned to the bottom via flex so cards with different quote lengths still align in a row. Logos show a skeleton-pulse placeholder while loading (real uploaded logos can be a few hundred KB) and fall back to a deterministic colored initials mark — never a broken-image icon — if the source is missing or errors.

**Carousel behavior:** rebuilt as a CSS scroll-snap track (1 card + a peek of the next on mobile, ~2 on tablet, ~3 on desktop) instead of a JS-transform slider — native touch/trackpad scrolling, no layout-shift risk, and `prefers-reduced-motion` handled for free by the existing app-wide rule in `globals.css` that already zeroes out animation/scroll durations, confirmed rather than assumed by reading that file. Previous/next buttons, a small position-dot row, and keyboard ArrowLeft/ArrowRight/Home/End all drive the same underlying scroll position (verified interactively — see Validation). There is deliberately no autoplay: `docs/UI_UX_REFRESH.md` already documented "without forced automatic rotation" as an intentional prior decision, so that was continued rather than second-guessed.

**Demonstration entries** (`src/lib/demo-showcase-customers.ts`, new — isolated exactly as the brief required): four fictional organizations (Northstar Learning Academy, Harborview Suites, Greenline Mobility, Cedar & Stone Retail) with original SVG marks under `public/demo-logos/` and remarks phrased as descriptions of the demonstration itself ("the demonstration workspace shows...") rather than claims of a real result. `DEMO_SHOWCASE_ENABLED` is the configuration switch — set to `false`, or delete the file and its one import, to remove every demo entry with no other change. `src/lib/showcase-composition.ts` (new) holds `buildShowcaseCustomers()`, the pure composition rule: real approved entries always come first and are never displaced; demo entries only fill the gap up to `MIN_SHOWCASE_ENTRIES_BEFORE_DEMO_FILL` (4) and disappear automatically once real approvals reach that minimum, still capped at the pre-existing 12-item homepage limit. Every demo card renders a visible "Sample" badge, and the section shows a disclosure sentence whenever at least one demo entry is displayed. This logic was deliberately extracted out of `page.tsx` into its own file specifically so it has no I/O and can be unit-tested directly.

**Consent/privacy rules preserved, not touched:** `src/lib/public-showcase.ts`, `src/lib/platform-marketing.ts`, both logo API routes (`/api/public/showcase-logo/[organizationId]`, `/api/public/external-showcase-logo/[customerId]`), and every file under `src/app/app/platform/settings/` are unmodified. Demo entries are pure static content with no database row and no privacy dimension — they don't go through the owner-managed external-customer system at all, so that system's consent/authorization rules couldn't be weakened even by accident. No new remote image domain was introduced; demo logos are local SVGs, and real logos continue to be served exactly as before.

### Files changed

**New:** `src/lib/demo-showcase-customers.ts`, `src/lib/showcase-composition.ts`, `public/demo-logos/{northstar-learning,harborview-suites,greenline-mobility,cedar-stone-retail}.svg`, `test/showcase-composition.test.ts`, `test/customer-showcase-component.test.ts`.

**Modified:** `src/components/marketing/customer-showcase.tsx` (full rewrite), `src/app/(public)/page.tsx` (composition now delegated to `buildShowcaseCustomers()`; the literal `marketing.showcaseEnabled`/`marketing.externalCustomers` references the existing `platform-settings-showcase.test.ts` asserts on are unchanged), `docs/PLATFORM_SETTINGS.md`, `docs/UI_UX_REFRESH.md`.

**Explicitly not modified:** `src/lib/public-showcase.ts`, `src/lib/platform-marketing.ts`, both logo API routes, `src/app/app/platform/settings/*`, `prisma/schema.prisma`, `next.config.ts`, `package.json`.

### Validation

- `npx tsc --noEmit` (and `--incremental false` during development): clean.
- `npm run lint`: clean, 0 errors/warnings.
- `npx vitest run` (full suite): **45 files / 266 tests passed**, including the 2 new files above (23 new tests) and both pre-existing showcase-related files (`test/public-customer-showcase.test.ts`, `test/platform-settings-showcase.test.ts`) unchanged and still passing.
- `npm run build`: `✓ Compiled successfully`.
- `git diff --check`: clean (only expected LF/CRLF autocrlf notices, no real whitespace errors).
- **Visual verification against the real app, not a guess:** ran `next dev` and loaded the actual public homepage in a headless browser (the homepage needs no authentication and only reads already-public marketing data, so this was safe against the shared database — no mutation). Confirmed: a real production showcase entry ("God's Love Ventures") renders correctly alongside demo-filled entries with visible Sample badges and the disclosure line; the Previous/Next buttons and ArrowLeft keyboard navigation both move the carousel and update the active position dot; the focus-visible ring is visible on the carousel track; dark mode renders cleanly; mobile (390px) shows one card plus a peek of the next. Also caught and fixed a real (if minor) polish bug this way — the very first real logo, a ~215 KB uploaded PNG, showed as an empty frame for a moment before finishing loading in the automated screenshot; added the load-skeleton specifically because of that observation, not preemptively.
- Not done: a real production deployment preview (out of scope — Codex deploys after review, per the task brief).

### Remaining risks / recommendations for Codex

- The demo-fill minimum (4) and cap (12) are reasonable defaults but not specified numbers in the brief — adjust `MIN_SHOWCASE_ENTRIES_BEFORE_DEMO_FILL` in `src/lib/demo-showcase-customers.ts` if a different threshold is wanted.
- The carousel's outer `<section>` and the inner scroll track both compute to an ARIA landmark region (the section via `aria-labelledby`, the track via explicit `role="region"` per the standard APG carousel pattern), so a screen reader's landmark list shows two nested regions with similar names. Not a spec violation and matches the documented ARIA carousel pattern, but worth a look if it reads as redundant in practice.
- Once real customer approvals consistently exceed `MIN_SHOWCASE_ENTRIES_BEFORE_DEMO_FILL`, demo entries stop appearing automatically — deleting `src/lib/demo-showcase-customers.ts` and its one import at that point is optional cleanup, not required.

### Branch and commit

Branch `agent/claude-showcase-redesign`, commit `941f71cd2454710483ed2138146e239c9baaf3bf`, pushed to `origin`. Not merged to `main`; Codex reviews, merges, pushes, and deploys per the task brief.

## 2026-08-11 — Active-module-only tenant backup and restore

Closed the module-scope gap in `/app/organization/backups`. The UI now lists only the organization's currently active module scopes and labels the combined option **All active modules**. Download requests independently recompute active scope and return 403 for inactive/unrelated module parameters; “all” builds records only from active module model prefixes. Restore independently recomputes the same scope and rejects backup files containing inactive-module data, while retaining tenant ID/code, password, optional 2FA, file-size, and per-row isolation controls. Current ACTIVE subscriptions are authoritative when present; enabled assignments remain the fallback for trial/platform-managed workspaces without subscriptions. Export manifests now record `includedModules`. Files: shared active-module resolver, backup library, download/restore routes, backup page/controls, tests, and `docs/BACKUP_AND_RECOVERY.md`. No schema migration or environment change is required. ESLint, strict TypeScript, **43 files / 243 tests**, the 164-page Next.js production build, and `git diff --check` passed. Commit `c65924d` deployed as Vercel production deployment `dpl_9pT7iydRmBgoN5oBP7a6r4hGgBq4` (`READY`, all live domains). Production health returned 200, unauthenticated download/restore probes returned 401, and the post-probe five-minute runtime-error scan was empty.

## 2026-08-10 — Tenant-module-aware Administration roles

Removed the legacy hardcoded Administration invitation-role list, which exposed Fleet and Installment roles even in School-only organizations and omitted the actual School roles. `/app/administration` now loads system and organization roles with their permissions, retains Organization Owner, excludes Super Admin, and shows only roles whose module permissions belong to the tenant's currently enabled modules. The invitation server action enforces the same rule to prevent forged or stale unrelated role IDs. Files: `src/lib/administration-roles.ts`, Administration page/actions, focused regression tests, `docs/AUTHENTICATION_AND_AUTHORIZATION.md`. No schema migration or environment change is required. ESLint, strict TypeScript, **42 files / 237 tests**, the 164-page Next.js production build, and `git diff --check` passed. Commit `f2e836d` deployed as Vercel production deployment `dpl_HwVzDCdTPxo3fFLBFJG1AqmZBgss` (`READY` and assigned to all live domains). Production health returned 200, unauthenticated Administration redirected to login, and the post-probe five-minute Vercel runtime-error scan was empty.

Follow-up from the live God’s Love Ventures workspace: its database contains enabled Installment and Hotel assignments, but only Hotel has a current ACTIVE subscription. The first filter correctly followed the general tenant `enabledModuleKeys` fallback and therefore still exposed Installment roles. Administration now prefers current active subscription module codes whenever any exist, retaining the enabled-module fallback only for trial/platform-managed workspaces with no subscriptions. The role popup opens below the trigger with selected-item alignment disabled and a bounded height, and legacy Hire Purchase role names display as Installment Manager/Staff in the selector and invitation email. The server-side invitation check uses the same subscription-aware scope. ESLint, strict TypeScript, **42 files / 238 tests**, the 164-page production build, and `git diff --check` passed. Commit `fc0f055` deployed as Vercel production deployment `dpl_3FwQwRpx5h9yNRuLQ8WemdNeiHDZ` (`READY`, all live domains); production health returned 200 and the post-deploy five-minute runtime-error scan was empty.

## 2026-08-10 — Owner-controlled independent customer showcase and expanded platform settings

Expanded `/app/platform/settings` from a single deletion-retention field into the Rock Frost owner control center. Owners can now control deletion recovery, the complete public customer-story section's visibility and copy, industry display, and independent customers whose systems are hosted outside this platform. Independent customer controls cover logo upload/replacement, name/industry/approved quote/attribution, publish/hide, explicit ordering, and confirmed removal. Data uses the platform anchor organization's existing `metadata.publicMarketing` object; no schema migration or environment change is required. The homepage combines published independent customers with consent-approved ACTIVE platform tenants, capped at twelve. A guarded external-logo route returns published images without browser/CDN storage so hiding a customer takes effect immediately, hidden images only to authenticated platform operators, and 404 otherwise. Platform mutations are Super-Admin-gated, audited, and revalidate owner/public surfaces.

Platform Settings now renders in a dedicated footer navigation area at the bottom of desktop and mobile platform sidebars. The avatar menu no longer points "Settings" to platform-wide controls; its single **Profile settings** entry opens the personal platform account page for photo, identity, email, password, and 2FA. Files: platform settings page/actions and delete confirmation, `src/lib/platform-marketing.ts`, public home/carousel, external-logo API, AppShell/platform navigation/layout, user menu, tests, `docs/PLATFORM_SETTINGS.md`, `docs/UI_UX_REFRESH.md`, and `README.md`. ESLint, strict TypeScript, **41 files / 234 tests**, the 164-page Next.js production build (including the external showcase-logo route), and `git diff --check` passed. Commit `f7d412e` deployed as Vercel production deployment `dpl_69UdoUky2K8GkNicnTYQ8Q9SbNSG` (`READY` and assigned to all live domains). Production health and the canonical homepage returned 200, unauthenticated platform settings redirected to login, and an unknown external logo returned 404. The first post-probe scan revealed that the unauthenticated settings render logged a missing-membership exception before its layout redirected; the page now checks nullable tenant context and redirects directly to login, with a regression assertion added. Corrective commit `d11e9ef` passed ESLint, strict TypeScript, its focused 3-test regression file, and the 164-page production build; it deployed as `dpl_9Yvx5Y8uKDExa44AtaAr4QU4You1` (`READY`, all live domains). The repeated unauthenticated settings probe redirected directly to login, health confirmed the database reachable, and the subsequent two-minute Vercel runtime-error scan was empty.

## 2026-08-10 — Consent-controlled customer showcase carousel

Added a real-customer advertising surface to the public home page without exposing tenants automatically. Platform operators can now open an organization record, enter an approved quote and attribution, and explicitly enable the public showcase. Publication requires an `ACTIVE` organization, uploaded logo, complete copy, and `metadata.publicShowcase.enabled = true`; onboarding alone is insufficient. The home page renders eligible customers in a responsive logo/testimonial carousel with accessible selection and previous/next controls but no forced automatic rotation. No placeholder organization, logo, or testimonial is fabricated when no customer has consented—the section stays hidden. Approved base64 logos are delivered through a separately guarded, cacheable `/api/public/showcase-logo/[organizationId]` route instead of inflating the React payload. Showcase changes are platform-authorized, audited, and revalidate the home page. No schema migration was needed because approval metadata uses the existing `Organization.metadata` field. Files: `src/lib/public-showcase.ts`, `src/components/marketing/customer-showcase.tsx`, public home page, platform organization detail/action, public showcase-logo route, `test/public-customer-showcase.test.ts`, `docs/UI_UX_REFRESH.md`, and `README.md`. ESLint, strict TypeScript, **40 files / 231 tests**, the 164-page Next.js production build (including the new dynamic logo route), and `git diff --check` passed. Commit `9bb430c` deployed as Vercel production deployment `dpl_2fTF56q6cU6b5qkp3mhvgQJzxyPD` (`Ready` and assigned to all live domains). Canonical home and health returned 200; an unapproved logo request returned 404; the home HTML currently omits “Customer stories,” confirming that no tenant was published without explicit approval. The post-probe Vercel error-log query was empty.

## 2026-08-10 — Wordmark-only branding on app and public home page

Removed the separate square RF icon from the shared visible `Logo` lockup and made the supplied single-line `public/RFGgg.png` wordmark the sole Rock Frost brand shown in both the authenticated app fallback/sidebar and public site header/home page. The compact sidebar state uses the same wordmark at a constrained size rather than reintroducing the icon. No favicon, Apple touch icon, Android/PWA icon, manifest configuration, or loader icon was changed. Files: `src/components/layout/{logo,app-shell}.tsx` and `docs/UI_UX_REFRESH.md`. ESLint, strict TypeScript, **39 files / 228 tests**, the 164-page Next.js production build, and `git diff --check` passed. Commit `329c338` deployed as Vercel production deployment `dpl_89BZmY4hZrqkuw7ghoCWcauMsPKY` (`Ready` and assigned to all live domains). The production home page returned 200 and its HTML references `RFGgg.png`; health, `manifest.webmanifest`, `icon-192.png`, `icon-512.png`, and `apple-icon.png` all returned 200 with their expected content types. The post-probe Vercel error-log query was empty.

## 2026-08-10 — Original RF loader restored without workspace blanking

Removed the authenticated root `app/loading.tsx` boundary that could replace the entire routed workspace with a white fallback. Ordinary internal navigation now keeps the current page and sidebar mounted while `AppNavigationLoader` shows only the original centered round RF mark with its pulse and “Loading…” label on a transparent interaction overlay. Removed the temporary top progress bar/status pill and the “Loading workspace / Your current page will stay visible” card. Replaced the fallback app-sidebar's plain `Rock Frost` text with the supplied single-line `public/RFGgg.png` wordmark while retaining the compact RF icon; public-site headers retain their existing text treatment, and the alternate multi-line `public/rfggggg.png` was intentionally not used because its technologies/tagline treatment is too dense at sidebar size. Files: `src/components/feedback/{app-navigation-loader,rf-loading-screen}.tsx`, `src/components/layout/{app-shell,logo}.tsx`, `src/app/app/loading.tsx` (removed), `public/RFGgg.png`, and `docs/UI_UX_REFRESH.md`. ESLint, strict TypeScript, **39 files / 228 tests**, the 164-page Next.js production build, and `git diff --check` passed. Automated browser capture was attempted after starting the local dev server, but the documented `agent-browser` binary and the fallback Node browser runtime are unavailable in this environment; an authenticated production navigation smoke check remains required. Commit `e549eea` deployed as Vercel production deployment `dpl_26zCUDnhGNbak4Zip8WwJ8zB4QYo` (`Ready` and assigned to the live domains). Production health, login, and `/RFGgg.png` returned 200, the asset returned `image/png`, and the post-probe Vercel error-log query was empty.

## 2026-08-10 — RF navigation loader redesign (fixed-timer bug + visual polish)

User feedback: "improve the loading behaviour. it doesn't look the best." Rather than guess from source, rendered the actual shipped markup/CSS (real compiled Tailwind output + the exact `globals.css` color tokens, both light and dark) to a static file and screenshotted it with Playwright/Chromium — confirmed two problems, one cosmetic and one a genuine functional bug, before writing any fix.

**The functional bug:** `AppNavigationLoader` showed for a blind `setTimeout(650ms)` on every internal link click, with no relationship to when navigation actually finished. A fast prefetched route (the common case in production) kept showing "loading" for the remainder of 650 ms after the destination had already rendered underneath it; a genuinely slow route lost its loading feedback at the 650 ms mark while still mid-fetch. Fixed by tracking `usePathname()`/`useSearchParams()` and treating the real route change as the completion signal — a 260 ms minimum-visible time avoids a flash on instant navigations, and an 8 s safety ceiling guarantees the click-blocking overlay can't get stuck if a request hangs.

**The visual problem:** the progress bar was frozen at a fixed 50% width, just pulsing opacity — it didn't progress, which reads as stalled/broken rather than "loading." Replaced with a bar that genuinely animates width (eases toward ~86% while waiting, completes to 100% only on real completion) via a CSS transition. The status pill's `animate-ping` ring (semantically closer to a notification than a loading state) is now a spinning ring, and the redundant second line of copy ("Your current page will stay visible" — an implementation detail, not something the user needed to be told on every click) was dropped. `RfLoadingScreen` (the `loading.tsx` Suspense fallback for genuinely slow requests) was restyled to the same spinning-ring language so the app has one consistent loading identity instead of two different ones.

**Files:** `src/components/feedback/app-navigation-loader.tsx`, `src/components/feedback/rf-loading-screen.tsx`, `src/app/app/layout.tsx` (wrapped the loader in `<Suspense>`, per Next's own recommendation for a component calling `useSearchParams()` — confirmed via `node_modules/next/dist/docs` this only actually matters for prerendered routes, which this authenticated tree never is, so it's a defensive addition rather than a fix for an observed problem), `docs/UI_UX_REFRESH.md`.

**Validation:** `npx tsc --noEmit --incremental false` clean; `npm run lint` clean (fixed one real `react-hooks/exhaustive-deps` warning from the new effect, with an inline comment explaining why the omitted deps are safe rather than silently suppressing it); `npx vitest run` — **39 files / 228 tests passed**; `npm run build` — `✓ Compiled successfully`. Visual verification was done against the actual compiled CSS and color tokens (not a guess) via a disposable static-HTML reproduction, screenshotted in both light and dark — not against a running authenticated session, since `.env`'s `DATABASE_URL` points at the real production Neon instance and no disposable database was available in this session.

**Not done:** a live authenticated click-through in a browser. Recommend a quick manual check after deploy — click between two sidebar destinations and confirm the pill/bar feel responsive rather than sluggish or twitchy, and check one genuinely slow navigation (e.g. a large report page) to confirm the safety ceiling isn't reached in normal use.

## 2026-08-10 — Platform-owner audit events removed from tenant audit surfaces

Fixed an actor-isolation gap in the otherwise organization-scoped audit viewer. Platform actions performed against a customer were stored with the target tenant's `organizationId`; filtering only on that ID therefore exposed the Rock Frost Super Admin's event to the tenant. Added shared `tenantAuditWhere()`/`TENANT_AUDIT_ACTOR_WHERE` scopes that keep the active organization boundary while excluding any actor holding the global system `Super Admin` role. Applied the scope to tenant rows, pagination count, actor/module/entity filter values, and CSV export. The platform-only `/app/platform/activity` remains the full operator trail. System-generated tenant events and genuine tenant-user events remain visible. The page now also checks the server session before tenant resolution, so an unauthenticated direct request redirects to `/login` instead of surfacing a tenant-resolution render error. Files: `src/lib/audit-scope.ts`, tenant audit page, audit CSV route, `test/audit-tenant-isolation.test.ts`, and `docs/HARDENING_PLAN.md`. Validation passed ESLint, strict TypeScript, **39 files / 228 tests**, the 164-page Next.js production build, and `git diff --check`. Code commits `f051729` and `cf5af06` deployed as Vercel production deployment `dpl_GQPbQdKe9pTRqYHpV8YkLdTwNS6U` (`Ready` and assigned to the live domains). Post-promotion probes returned health 200, audit page 307 to `/login`, audit export 401, and the deployment error-log query was empty.

## 2026-08-10 — RF navigation transition preserves the current page

Replaced the opaque navigation overlay introduced in `afed69e` with a non-blanking transition: the existing workspace remains visible while a slim RF-blue progress line and compact glass RF loading card float above it for the same bounded transition. The overlay still prevents accidental repeat interaction, retains `role=status`/live-region semantics, and respects the global reduced-motion rule. Files: `src/components/feedback/app-navigation-loader.tsx`, `docs/UI_UX_REFRESH.md`. Validation passed ESLint, strict TypeScript, **38 files / 227 tests**, the 164-page Next.js production build, and `git diff --check`. Commit `673b821` deployed as Vercel production deployment `dpl_9ckEQ1QXTtLtj6cFoWiui8tLpbRo` (`Ready`); production health returned 200 and the post-deployment Vercel error-log query was empty.

## 2026-08-10 — RF loading transition made visible on fast production navigation

The server-only `app/loading.tsx` boundary was correct but normally imperceptible because production `<Link>` routes are prefetched and resolve without suspending. Added `AppNavigationLoader`, mounted once in the authenticated root layout, to show the existing accessible RF loading screen immediately for 650 ms on genuine same-origin navigation. It ignores modified clicks, external links, downloads, new-tab links, the current URL, and same-page anchors. The existing server loading boundary remains responsible for waits longer than the short transition, and the existing global reduced-motion rule makes the animation static for users who request reduced motion. No data fetching or server response was artificially delayed.

**Files:** `src/components/feedback/app-navigation-loader.tsx`, `src/app/app/layout.tsx`. **Validation:** ESLint passed; strict TypeScript passed; full unit suite passed **38 files / 227 tests**; Next.js 16.2.12 production build passed with 164 pages; `git diff --check` passed. Commit `afed69e` deployed as Vercel production deployment `dpl_2p5niQPoRbZd5S14172qL6p9P5co` (`Ready`). Production app health and login returned 200 and the post-probe Vercel error-log query was empty. Because verification had no authenticated browser session, the customer should hard-refresh once and confirm the 650 ms overlay while navigating between two sidebar destinations.

## 2026-08-10 — Combined production-readiness release: 2FA, tenant backups, transactional email, requests/settings/branding/loading

Integrated Claude commits `746d79d` and `357ca35` with the Codex security, backup, and email lane. Claude's detailed requests/settings/branding/loading breakdown remains immediately below this entry. No ownership-boundary conflicts were found.

**Security:** added optional TOTP two-factor authentication for platform administrators and organization users. Authenticator secrets are AES-256-GCM encrypted using `TWO_FACTOR_ENCRYPTION_KEY` with `NEXTAUTH_SECRET` fallback; enrollment and disabling require the current password, successful changes revoke existing sessions, and enrolled users must supply a valid six-digit code at login. Wrong TOTP codes participate in the existing account lockout policy. Added migration `20260810110000_add_user_two_factor_authentication` for `User.twoFactorSecret`, `twoFactorEnabled`, and `twoFactorConfirmedAt`.

**Backup/recovery:** added `/app/organization/backups` and tenant-scoped export/restore APIs covering all 13 module scopes. Exports dynamically include only business models with the active `organizationId`; identity, password, platform, billing-control, and other-tenant records are excluded. Restore is a non-destructive merge and requires `org.settings.manage`, the current password, exact tenant-code confirmation, and TOTP when enabled. Cross-tenant rows/files and models outside the selected scope are rejected. The Organization Settings page now links to the real backup workspace and describes saved scheduling values as preferences rather than claiming an unimplemented scheduler consumes them. Physical Neon recovery remains operator-only.

**Client email:** replaced minimal invitation and password-reset fragments with escaped, branded transactional templates containing complete HTML and plain-text parts, role/organization context, expiry/one-time-use wording, fallback URLs, and anti-phishing guidance. `sendEmail` now supports the optional monitored `RESEND_REPLY_TO`. Inbox placement is not guaranteed by templates; `docs/EMAIL_DELIVERY.md` records the required verified sender domain, SPF, DKIM, DMARC, bounce/complaint monitoring, and production variables. `vercel env ls production` returned no standard project-level variables; Marketplace-managed variables may be separate, so the Resend integration/domain still requires dashboard verification.

**Important files:** `src/lib/auth/{totp,nextauth}.ts`, Account Security routes, `src/lib/backup/{scopes,tenant-backup}.ts`, organization backup routes/page, `src/lib/{email,email-templates}.ts`, invitation/password-reset actions, Prisma schema/migration, `.env.example`, `docs/{AUTHENTICATION_AND_AUTHORIZATION,BACKUP_AND_RECOVERY,EMAIL_DELIVERY}.md`, and three new focused test files.

**Validation:** Prisma schema validation passed with non-production placeholder URLs; Prisma client generation passed; strict TypeScript passed; ESLint passed with zero errors/warnings; full unit suite passed **38 files / 227 tests** after making the authenticated-encryption tamper test deterministically mutate a decoded tag byte; Next.js 16.2.12 production build passed and generated **164 pages**, including `/app/account/security`, `/app/platform/account/security`, `/app/organization/backups`, and both backup APIs. `git diff --check` passed. The guarded database migration/integration commands were attempted but correctly refused before connecting because `TEST_DATABASE_URL` is not configured; no production database was used for tests.

**Environment/migration:** production must retain `NEXTAUTH_SECRET`; setting a dedicated stable `TWO_FACTOR_ENCRYPTION_KEY` before users enroll is recommended. Changing that key later without a rotation procedure makes existing TOTP secrets unreadable. `RESEND_API_KEY`, a verified-domain `RESEND_FROM_EMAIL`, and preferably `RESEND_REPLY_TO` are required for real delivery. The production Vercel build runs `prisma migrate deploy` before build/seed.

**Remaining risks:** perform an authenticated browser smoke test after deployment for tenant/platform 2FA enrollment and login, same-tenant backup download, requests views/confirmations, organization logo/theme, and the loading screen. Do not test restore against production customer data; use a disposable tenant/database. Payroll numbering/overtime and School ranking remain the honest product gaps documented by Claude below.

**Production smoke correction:** initial production deployment `dpl_7pW631GX9Bjk7KpFFRvehxry5N2V` reached Ready and applied the release, but an unauthenticated probe of `/app/account/security` exposed an existing nested-layout race: the parent layout redirects/no-accesses correctly while the `(overview)` child independently called `requireCurrentTenant()` and threw before that response won. Changed both `(overview)` and `platform` child layouts to nullable `getCurrentTenant()` resolution and render their bounded no-access state instead of throwing. Corrective validation passed ESLint, strict TypeScript, `git diff --check`, and all **38 files / 227 tests**. A follow-up deployment is required and its ID/status is recorded below when complete.

Follow-up deployment `dpl_8omVcmkeT4fubs5FAHh8H4BXZt7Y` reached Ready. Health returned 200 on `www`, `app`, and `admin`; tenant/platform security routes returned the expected unauthenticated 307. That probe then exposed the same throwing-helper pattern directly inside the new backup page. Hardened the page to redirect unauthenticated users and both backup APIs to return JSON 401 before tenant authorization. Final hardening again passed ESLint, strict TypeScript, `git diff --check`, and **227/227 unit tests**; the final deployment ID and clean log result are appended after promotion.

Final hardened production deployment `dpl_DPxZNrkfJunHnGYUCNKdQNYDmAG3` reached **Ready**. Post-promotion probes: `www`/`app`/`admin` health all 200; tenant security, tenant backup page, and platform security all returned the expected unauthenticated 307; backup export API returned 401; Vercel error-log query after those probes returned no logs. Production code commit is `910b52e`.

## 2026-08-10 — Requests experience, module settings, organization branding, and premium loading (Claude, branch `agent/claude-requests-settings-loading`)

Scoped exactly to the four-part brief given for this branch: (A) platform and tenant module-request UX, (B) a real audit-and-fill pass over every module's Settings page, (C) making organization branding actually consumed by the shell, (D) a premium loading state. Worked concurrently with Codex, who owns auth/2FA, backup/export/restore, cron, security docs/tests, and `prisma/schema.prisma`/migrations — none of those were touched. This entry documents everything; **not merged to `main`, not deployed** — that is explicitly Codex's job per the task brief.

### A — Requests experience

**Platform (`src/app/app/platform/requests/`):** the single always-expanded page (every request's full form rendered at once, inquiries and queue mixed together, one-click "Approve and enable module") is now three URL-driven views — **Active queue** (default), **Inbox** (unlinked public inquiries), **History** (`COMPLETED`/`REJECTED`/`CANCELLED`, previously unreachable in this UI once a request left the active queue) — plus search (title/organization/module) and priority/type filters, all server-rendered GET params (shareable URLs, no client JS required for filtering). Requests are collapsed rows by default (`_components/request-card.tsx`, a small client component for the expand/collapse only); opening one reveals the same management form as before. **Approve and enable module** and **Reject** now sit behind an explicit confirmation dialog (`_components/confirm-submit-button.tsx`) — previously both were one click with no confirmation, "Reject" didn't exist as a shortcut at all (only reachable by manually changing the status `<select>`). The reject button posts a dedicated `rejectRequest=true` flag rather than reusing `name="status"` (which would have collided with the form's own status `<select>` — `FormData.get()` only returns the first same-named value, silently dropping the button's intent; caught and fixed before it shipped). `actions.ts`'s `manageModuleRequest` gained that one new branch; every other action, its Zod schema, and `updateModuleRequest`/`createModuleRequest` (`src/platform/module-requests/service.ts`, untouched) are unchanged — same permission gate (`requirePlatformOperator()`/`isPlatformOperator`), same audit logging, same notification-on-status-change.

**Tenant (`src/app/app/(overview)/module-requests/`):** same Open/All/Resolved view split, search, and collapsible rows (`_components/request-timeline-card.tsx`); the "new request" form moved from an always-expanded card into `EntityDialog` (the same dialog pattern Accounting/Fleet already use) so the page opens on the requester's own requests rather than a form. `requireCurrentTenant()` + `hasPermission(tenant, PERMISSIONS.ORG_SETTINGS_MANAGE)` gate is unchanged; `actions.ts` was not modified at all — the existing `submitModuleRequest`/`addModuleRequestMessage` are reused as-is.

### B — Module settings audit (13 modules)

Read every module's settings `page.tsx` + `actions.ts` + backing `service.ts` before changing anything, per the assignment's own instruction. Findings and what was done, module by module:

**Modules with no dedicated `<Module>Settings` Prisma table — real settings added via `OrganizationModule.configuration`** (see "Schema-free settings mechanism" below; zero migration):
- **Fleet** (`src/modules/fleet/service.ts`): the placeholder page ("no fleet-wide settings yet... e.g. default maintenance approval thresholds") is replaced with a real **document renewal reminder window (days)**, default 30 — the exact value `computeRenewalStatus()` already hardcoded, so existing behavior is unchanged for every organization that doesn't touch it. Threaded through `createFleetVehicleDocument`, `updateFleetVehicleDocument`, and `refreshFleetDocumentStatuses` (all in `service.ts`; no other file needed changing). Gated on `PERMISSIONS.FLEET_INSURANCE_MANAGE` — **Fleet has no `fleet.settings.manage` permission at all** (`src/lib/auth/permissions.ts` is Codex's exclusive file, so a new one couldn't be added); insurance/roadworthy documents are exactly what this setting governs, so that permission is the correct existing fit. Noted inline in `actions.ts`.
- **Projects**: **project code prefix** (default "PRJ"), wired into `generateProjectCode()`. New `actions.ts` (module had none before).
- **Accounting**: **invoice number prefix** (default "INV"), wired into `generateInvoiceNumber()`. Added as a new card above the pre-existing (real, unchanged) expense-categories card.
- **HR**: **employee number prefix** (default "EMP"), wired into `generateEmployeeNumber()`. Added above the pre-existing leave-types card.
- **CRM**: **default owner for new leads/deals** — a real org-member picker; `createLead`/`createDeal` now fall back to this configured user when the caller doesn't supply an `ownerId`, so nothing sits unowned by default. Silently skips a configured owner who is no longer an active member (the record is simply left unowned, same as before) rather than failing the create. Added a new `listActiveMembers()` export.
- **Inventory**: **default reorder point for new items.** `createItem()`'s own optional-field fallback turned out to be unreachable dead code — the existing create form (`src/app/app/inventory/items/page.tsx`, `actions.ts` unchanged) already always sends an explicit `reorderPoint` (defaulting to "0" client-side), so the service-level fallback would never fire. Removed that dead branch and instead pre-filled the *form's* `defaultValue` from the setting (mirrors Installment's already-established "pre-fills the field when creating a new record" pattern, which itself lives on a different page than Installment's own settings page — confirmed precedent for a settings value affecting a sibling page within the same module). This is the one settings change in this pass that touches a page outside `settings/` (a single `defaultValue` line; no validation/schema logic changed).
- **POS**: **sale number prefix** (default "SALE"), wired into `generateSaleNumber()`. `PosSettings` already exists but only has `receiptFooterText` — the prefix lives in the generic store alongside it, both surfaced on the same settings page.
- **Procurement**: **order number prefix** (default "PO"), wired into `generateOrderNumber()`. Same pattern — `ProcurementSettings` only has `defaultWarehouseId`.

**Modules with a dedicated Settings table:**
- **School**: `SchoolSettings.gradingScale` was genuinely decorative — stored via the `GradingScaleField` UI (built in an earlier session) but never read back, which that earlier session's own doc (`docs/SCHOOL_UI_CUSTOMER_READINESS.md`) honestly flagged as gap "SC-5." `recordSchoolExamResult()` (`src/modules/school/service.ts`) now auto-derives a result's letter grade from the student's campus grading scale (percentage → band match) whenever a grade isn't explicitly supplied — an explicit grade always wins, so a teacher can still override it. Nothing else changed; the Exams page already renders `result.grade`, so this is visible with zero page changes. Updated the stale "nothing reads this yet" comment in `grading-scale-field.tsx` to point at the new consumer. `allowRanking` remains genuinely unconsumed (see below).
- **Hotel, Installment**: audited in full — both are already comprehensive, real, and fully consumed (Hotel's settings page covers property policy/charges/numbering/housekeeping across every property; Installment's covers 15+ fields, each with an explicit "what this changes" description, several explicitly noted as feeding Reports rather than a workflow). No changes made; nothing decorative found.
- **Payroll**: audited `PayrollCompensation`/`PayrollRun`/`PayrollPayslip` — no unused fields (overtime, pay-period day, payslip numbering) exist to safely surface without a schema change. Left as-is rather than forcing something decorative. See "Schema requirements for Codex."
- **Analytics**: confirmed it is correctly settings-less by design (a pure read-only aggregation layer over every other module's own summary function, per `docs/ARCHITECTURE.md`) — left unchanged.

**Schema-free settings mechanism.** `src/platform/module-requests/configuration.ts` already had a generic, validated `OrganizationModule.configuration` JSON store (`features`/`limits`/`workflow`/`terminology`/`extensions`) and a reader, `getOrganizationModuleConfiguration()`, but the only writer was the platform operator's raw-JSON editor at `/app/platform/organizations/[organizationId]/modules/[moduleId]` — nothing tenant-facing could write to it, and (per that page's own docs note) nothing in the app actually consumed it yet. Added `updateOrganizationModuleConfigurationValues(organizationId, moduleCode, patch, actorId)` to the same file: a **shallow merge** into the four record fields (not a full-object replace), so a tenant saving their module's settings can never silently wipe a key the platform operator set via the raw editor, or vice versa. Writes go through the same Zod schema as the platform editor, resolve the module by `code` (not a bare id), and log an audit event (`module_settings.updated`). Every module-service function above that reads a setting resolves it through `getOrganizationModuleConfiguration()` with an explicit, safe default (regex-validated for prefixes: `^[A-Z0-9]{2,8}$`) — an org that never touches a given setting sees identical behavior to before this pass.

### C — Organization branding and appearance

The interface **theme** setting was already consumed (`OrganizationThemeSync`, mounted in `src/app/app/layout.tsx`) — confirmed working, unchanged. The uploaded **logo** was not: `Organization.logoUrl` was written by `uploadCompanyLogo` and read back only as a preview on the settings page itself; nothing else in the app referenced it at all (grepped — zero other usages before this pass).

`src/app/app/layout.tsx` (the one layout every authenticated route — every module, organization scope, and platform scope — already renders under) now also selects `logoUrl`/`name` and provides them through a new `OrganizationBrandingProvider` (`src/components/theme/organization-branding-context.tsx`, a plain React Context) wrapping `{children}`. This was the deliberate alternative to prop-drilling `logoUrl` through all 14 module `layout.tsx` files individually (each hand-writes its own `organization={{ organizationId, memberships }}` object passed to `AppShell` — extending that shape would have meant touching every one of them). `AppShell`'s new `WorkspaceLogo` (`src/components/layout/app-shell.tsx`) reads the context and, only when the `organization` prop is present (tenant-scoped shells — platform's own `AppShell` usage never passes it, so platform operators always see the Rock Frost mark regardless of any tenant's branding) **and** a logo is set, renders the organization's own logo + name in place of the Rock Frost mark, in both the desktop sidebar rail and the mobile sheet header. An organization that hasn't uploaded a logo sees the unchanged default. `src/components/layout/logo.tsx` itself was not modified — `WorkspaceLogo` is a new sibling that conditionally falls back to it, so every other caller of `Logo` (if any exist outside `AppShell`) is unaffected.

Also polished `src/app/app/(overview)/organization/settings/page.tsx`: raw `<p>` success/error banners replaced with the app's standard `Alert` pattern; the logo card now shows a live preview tile with honest "no logo uploaded — Rock Frost mark shown by default" copy instead of only rendering an `<Image>` when present; split the one dense "Tenant policy" form into two focused cards (**Interface theme**, **Backup and recovery policy**) for clearer hierarchy — both still submit to the same unmodified `updateWorkspaceSettings` action via hidden inputs carrying the other card's current values, so the action's validation/shape is untouched. `docs/ACCOUNT_AND_TENANT_SETTINGS.md` updated to describe the consumption path.

### D — Premium loading experience

Only one `loading.tsx` exists in the app (`src/app/app/loading.tsx`) — confirmed this is architecturally correct, not a gap: per Next.js's `loading.js` file convention, it wraps every nested `layout.js`/`page.js` below it, so it already structurally covers every top-level route transition (tenant ↔ platform, module ↔ module, first load). It previously rendered a generic gray skeleton grid. Replaced with `src/components/feedback/rf-loading-screen.tsx`, a new shared component: the RF mark (`/icon.png`, the same asset generated in an earlier pass — no brand asset was generated or replaced here) centered with a soft pulsing/ping glow ring, `role="status"` + `aria-live="polite"` + visible "Loading…" text for screen readers. No client JS, no artificial delay — pure CSS, swapped out the instant real content streams in, exactly like the skeleton it replaced. Reduced motion: `src/app/globals.css` already forces every animation's `animation-duration`/`transition-duration` to ~0 under `prefers-reduced-motion: reduce` app-wide, so the pulse/ping utilities degrade to a static mark automatically — confirmed this was already in place rather than adding a redundant `motion-safe:`/`motion-reduce:` layer.

### Permissions, tenant isolation, and validation preserved

No permission check was loosened anywhere. Every settings action still gates on its module's existing `<Module>_SETTINGS_MANAGE` permission (Fleet substitutes `FLEET_INSURANCE_MANAGE`, the closest existing fit, documented above and inline). Every new/changed service function still takes `organizationId` explicitly and filters every query on it, per `docs/MODULE_BOUNDARIES.md`. New Zod validation was added at every new Server Action boundary using the existing `src/lib/validation.ts` primitives (`parseWithSchema`, `cuid`), not ad-hoc parsing. `updateOrganizationModuleConfigurationValues()` re-validates the merged shape through the same schema the platform's raw-JSON editor already uses, and resolves the target module by `code` rather than trusting a bare id. Audit logging (`logAuditEvent`) was added for the new configuration writes; existing audit logging elsewhere (module request updates, exam results, etc.) was not touched.

### Schema requirements for Codex

Nothing above required a schema change — everything used either an existing dedicated Settings table or the generic `OrganizationModule.configuration` JSON store. Two items were found during the audit that are real, honest gaps, deliberately **not** built around with a workaround:

1. **`PayrollSettings`** — model: `PayrollSettings` (`prisma/schema.prisma`). Currently only `defaultTaxRate Decimal`. Recommend, if wanted: `overtimeMultiplier Decimal @default(1.5)` (consumed by `processRun()` in `src/modules/payroll/service.ts` — but only once `PayrollCompensation` also gains an hours-worked/overtime-hours field; there is currently nothing to multiply), `payPeriodDayOfMonth Int?` (consumed by the payroll-run-creation action to prefill `payDate`), and a `payslipNumberPrefix String @default("PSL")` alongside a real `payslipNumber String` column on `PayrollPayslip` (currently payslips have no human-readable number at all, unlike every other module's numbered documents). None of these are safe to fake without the backing column.
2. **School `allowRanking`** — model: `SchoolSettings.allowRanking Boolean` (already exists, already toggleable on the Settings page). It remains unconsumed — nothing computes or displays a class ranking anywhere. This is not a schema gap (the boolean already exists); it's a scope call: making it real needs a ranking computation exposed on the Exams page, which is outside this branch's `src/app/app/platform/requests/**` / `src/app/app/(overview)/module-requests/**` / module-settings-pages lane. Flagging it explicitly rather than leaving it silently unfinished.

### Files changed (43)

**Requests (A):** `src/app/app/platform/requests/{page.tsx,actions.ts}`, `src/app/app/platform/requests/_components/{confirm-submit-button.tsx,request-card.tsx}` (new); `src/app/app/(overview)/module-requests/page.tsx`, `src/app/app/(overview)/module-requests/_components/request-timeline-card.tsx` (new).

**Module settings (B):** `src/platform/module-requests/configuration.ts`; `src/modules/{accounting,crm,fleet,hr,inventory,pos,procurement,projects,school}/service.ts`; `src/app/app/accounting/settings/{page.tsx,actions.ts}`; `src/app/app/crm/settings/{page.tsx,actions.ts}`; `src/app/app/fleet/settings/page.tsx`, `src/app/app/fleet/settings/actions.ts` (new); `src/app/app/hr/settings/{page.tsx,actions.ts}`; `src/app/app/inventory/settings/{page.tsx,actions.ts}`, `src/app/app/inventory/items/page.tsx`; `src/app/app/pos/settings/{page.tsx,actions.ts}`; `src/app/app/procurement/settings/{page.tsx,actions.ts}`; `src/app/app/projects/settings/page.tsx`, `src/app/app/projects/settings/actions.ts` (new); `src/components/school/grading-scale-field.tsx` (comment only).

**Organization branding (C):** `src/app/app/layout.tsx`; `src/components/theme/organization-branding-context.tsx` (new); `src/components/layout/app-shell.tsx`; `src/app/app/(overview)/organization/settings/page.tsx`.

**Loading (D):** `src/app/app/loading.tsx`; `src/components/feedback/rf-loading-screen.tsx` (new).

**Docs/tests:** `docs/MODULE_REQUESTS_AND_CUSTOMIZATION.md`; `docs/ACCOUNT_AND_TENANT_SETTINGS.md`; `test/module-access.test.ts` (updated a hardcoded `actions.ts` file count from 45 to 47 — the two new Fleet/Projects settings actions files are real and correctly guarded, confirmed by the test's own content-check loop, which passes unchanged).

Not modified: `prisma/schema.prisma`, any migration, `next.config.ts`, `package.json`, `CLAUDE.md`, `AGENTS.md`, or anything under `src/lib/auth/**`, backup/export/restore, cron, or security tests/docs.

### Validation results

- `npx tsc --noEmit --incremental false`: clean, run repeatedly through the session as each area landed.
- `npm run lint`: clean (0 errors, 0 warnings) — one real defect caught and fixed pre-lint (see A: the `name="status"` collision), one unescaped-apostrophe batch fixed on the organization settings page.
- `npm run test`: **226/227 passed, 37/38 files.** The one failure, `test/two-factor-authentication.test.ts` ("encrypts secrets with authenticated encryption and decrypts them"), is Codex's own file for their in-progress, uncommitted 2FA work — confirmed pre-existing and unrelated to this branch by `git stash`-ing every change here and re-running that single test in isolation: it still failed identically against the unmodified tree. Not touched, per the ownership boundary (`src/lib/auth/**` is exclusively Codex's). `test/module-access.test.ts` did have one real regression from this branch (a hardcoded file-count assertion, not a security/guard defect — see above) and was fixed and reconfirmed passing.
- `npm run build`: `✓ Compiled successfully`.
- No database/integration suite was run — nothing in this pass touched the schema, and every module-settings write goes through the existing, already-tested `OrganizationModule.configuration` column or an existing dedicated Settings table.

### Remaining risk / next step

Browser/visual verification was not performed (no interactive browser session available in this environment) — every claim above is grounded in reading the actual consuming code path (e.g. confirming `WorkspaceLogo` is reached only when `organization` is passed and `logoUrl` is set), not just that a build succeeded. Recommend a quick authenticated look at: the sidebar with and without a tenant logo set, the platform Requests three-view queue with a mix of statuses, and the loading screen on a throttled connection, before or shortly after this branch is integrated.

### Branch and commit

Commit `746d79d7703ece5c7777011b081670455881e9ae` on branch `agent/claude-requests-settings-loading`, pushed to `origin`. **Not merged to `main`, not deployed** — per the task brief, Codex integrates, validates, and deploys the combined release.

---

## 2026-08-10 — Favicon/app-icon source swapped to `public/rf logo.png` (explicit user request)

At the user's explicit instruction ("use this file for the icon and favicon"), regenerated every icon surface from `public/rf logo.png` — a 500x500 RF mark that already had genuine alpha transparency (verified corner/edge pixels were `0,0,0,0`, not a baked-in matte). No cropping or redesign was applied; the file's existing framing was used as-is, only resized per target.

**Files changed:** `src/app/icon.png` (180x180), `src/app/apple-icon.png` (180x180), `src/app/favicon.ico` (16/32/48 — rebuilt by hand-writing the ICO container, since no `png-to-ico`-style package was available in this environment; structure verified against the previous file with `file`), `public/icon-192.png` and `public/icon-512.png` (the PWA manifest icons `public/manifest.webmanifest` already pointed at, so no manifest edit was needed). No schema/migration change.

**Note for whoever picks this up next:** the 2026-08-03 "Claude review lane" entry below deliberately moved *away* from `rf logo.png` and toward a dark-navy-square-background treatment (matching `apple-icon.png`'s prior look) specifically to fix a dark-sidebar clash and unify every icon surface on one asset. This pass reintroduces `rf logo.png` with its native transparent background instead, which is a different visual choice than that prior decision — done on explicit user request today, not a rediscovery of the same problem. If the transparent-background mark looks wrong against the dark sidebar/header again, that's the known tradeoff being made here, not a new bug.

**Validation:** `npm run lint` passed (no errors/warnings); `npx tsc --noEmit --incremental false` passed; `npm run test` passed 214/214 across 34 files; `npm run build` compiled successfully with `/icon.png` and `/apple-icon.png` present in the route output. No database/integration suite was relevant (asset-only change).

**Deployment:** commit `ceaeb6f` was pushed to `main` at the user's explicit request and deployed successfully as Vercel production deployment `dpl_7njhQqQDALzrqYiXNwN7B3MygjSp` (`Ready`, confirmed via `vercel inspect --wait`). Both `www.rockfrostgroup.com` and `app.rockfrostgroup.com` aliases returned HTTP 200 with correct MIME types for `/icon.png`, `/favicon.ico`, and `/icon-512.png`; `/api/health` returned 200 on both. The live `/icon.png` bytes were downloaded and compared byte-for-byte against the committed file — exact match, confirming no stale CDN cache.

## 2026-08-03 — Claude review lane: UI/UX audit (no code changes)

Completed the "Claude review lane" defined in `docs/UI_UX_REFRESH.md` after confirming Codex's sidebar/shell tranche was committed (`fa5494f`, "Refine workspace navigation and module UX"). Reviewed the resulting `AppShell`/`SidebarNav` interaction model, audited the public acquisition pages (home, solutions, modules, industries, company, contact), and audited the small-format RF icon treatment across `src/app/icon.png`, `apple-icon.png`, `public/icon-192.png`/`icon-512.png`, the orphaned `public/rf logo.png`, and the JSON-LD `Organization.logo` reference to `public/RFG.png`. Full findings and proposed follow-ups are recorded in `docs/UI_UX_REFRESH.md` under "Claude review lane: findings (2026-08-03)"; no Codex-owned files were edited and no other code was changed.

Headline finding: the favicon/in-app logo (`src/app/icon.png`, rendered at 30px in every sidebar and header instance) used a different, lighter treatment than the PWA/iOS icons, clashed with the dark sidebar in dark mode, and the JSON-LD organization logo pointed at a decorative mascot poster (`RFG.png`) rather than a square brand mark.

**Applied same day, on explicit request, after logging the finding above:** `src/app/icon.png` is now a copy of the existing `apple-icon.png` (180x180, the same dark-navy chrome RF mark already used for the PWA/iOS icons), so the favicon, in-app sidebar/header logo, and installed-app icons are now one consistent asset. `src/app/(public)/layout.tsx`'s JSON-LD `Organization.logo` now points at `${SITE_URL}/icon-512.png` instead of `RFG.png`. `public/rf logo.png` was left in place, still unreferenced, in case it's wanted for something else later — not deleted. These are asset/markup-only changes; no component logic changed. Not build- or visually-verified (no Node.js/npm available in this session, see environment note below) — recommend a `npm run build` and a manual look at the sidebar/favicon/tab icon in both light and dark mode before this is considered fully confirmed.

Environment note: this session ran locally against the real working tree (not a sandbox) but found no Node.js, npm, or Git available on the machine's PATH (checked machine/user PATH and common install locations). `node_modules/` and `.git/` already exist from a prior setup, but no install/build/test/lint or git command could be run from this session — findings above are from static file review only, not a running app. No validation gate was run as a result; nothing in this entry has been build- or test-verified beyond source inspection. This entry was also inserted after noticing a concurrent agent had appended the "Hotel Settings completion and Reports-route repair" entry below while this review was in progress — that entry and its content were preserved as-is.

## 2026-08-03 — Hotel Settings completion and Reports-route repair

Completed the Hotel Settings module as enforced property configuration rather than passive form fields. Each property now controls timezone/currency, check-in/out, tax and service charge, outstanding-checkout policy, reservation/folio/receipt/order prefixes, automatic checkout cleaning tasks, housekeeping due hours, and mandatory inspection. The stay, payment, restaurant, checkout, and housekeeping services consume those settings. Housekeeping also supports tenant-scoped manual task creation, duplicate-open-task prevention, assignment, due date, priority, notes, inspection, and completion.

Fixed the production Reports 404 at its source. `.vercelignore` used unanchored `reports/` and `output/` patterns, which removed nested App Router report directories from Vercel source packaging. Both rules are now root-anchored, and a regression test protects them. The production build route manifest explicitly contains `/app/hotel/reports` plus all other module report routes.

Added additive migration `20260803215500_complete_hotel_settings`; no environment change is required. The disposable PostgreSQL database applied all 27 migrations. Validation passed Prisma validate/generate, strict TypeScript, ESLint, 34 unit files / 213 tests, 19 integration files / 104 real-database tests, and the 160-page Next.js production build. Pre-existing `output/` and `reports/` artifacts remain preserved and uncommitted.
## 2026-08-03 — Coordinated UI/UX and sidebar refresh

Refined the authenticated workspace after a live-interface review and an independent agent audit. The desktop `AppShell` now has a sticky, persistent user-collapsible sidebar; its 72px rail retains accessible icon navigation and tooltips. The mobile sheet is full-height with an independently scrolling navigation region and closes only after route selection. The top bar now identifies the current page and module, while RF blue is used semantically for primary, focus, chart, and active-navigation tokens.

Fixed a real navigation defect in which overview routes could remain highlighted alongside nested routes. `getActiveNavigationHref()` now chooses the longest segment-boundary match, `SidebarNav` exposes `aria-current`, and four regression tests cover nested Hotel routes, overview matching, false prefixes, and Organization/Billing collisions. Hotel and School navigation is grouped by operational domain, and both overview pages now use fully linked real-data KPI cards, localized Ghana-cedi fee formatting, and high-frequency workflow launchers without inventing metrics.

Coordination and acceptance criteria are recorded in `docs/UI_UX_REFRESH.md`. Codex owns the shell/sidebar and Hotel/School overview files in this tranche; an external Claude session may review them after the commit and should use the non-overlapping public-site/small-icon review lane described there. Pre-existing untracked `output/` and `reports/` were preserved.

Validation: strict TypeScript passed with `--incremental false`; ESLint passed; the full single-worker unit suite passed 33 files / 212 tests; and the Next.js 16.2.12 production build passed with 160 generated static pages. No migration or environment change is required.

## 2026-08-03 — Hotel and School implementation and release

Hotel and School are now implemented as tenant-isolated, RBAC-controlled modules rather than roadmap placeholders. Hotel includes properties, room types and rooms, guests, reservations, check-in/out, automatically charged folios, payments, housekeeping, restaurant orders with folio posting, channel mappings, reports, and settings. School includes campuses, students and guardians, academic years and terms, classes and enrollment, attendance, fees and payments, exams/results/moderation/publishing, timetables, transport, library loans, payroll adjustments, reports, and settings.

The additive migration is `prisma/migrations/20260803183000_add_hotel_school_modules/migration.sql`; the platform now seeds 13 module definitions, 104 permissions, and associated operational roles. A dedicated PostgreSQL 16 database applied all 26 committed migrations successfully, then all 19 integration files / 101 real-database tests passed, including Hotel room-overlap/tenant-isolation and School fee-overpayment/tenant-isolation guards. The mocked suite passed all 32 files / 208 tests, and Prisma validation/generation, ESLint, strict TypeScript, and the 160-page Next.js production build passed.

Vercel preview builds intentionally skip database mutation and perform the full application build; production builds run `prisma migrate deploy`, the idempotent platform catalog seed, and then `next build`. This prevents feature previews from mutating shared data while ensuring promoted modules and permissions are installed in production.

The local PostgreSQL gate exposed and fixed a pre-existing integration-harness wiring error: fixtures used `TEST_DATABASE_URL`, but imported services still used the unreachable `DATABASE_URL` placeholder. `test/integration/setup/environment.ts` now validates the disposable URL before any service import and binds the shared service client to it; the safety guard caches only that already-validated URL.

That real gate also exposed and fixed existing concurrency/isolation defects: cross-tenant Installment inventory-staff assignment, concurrent Inventory stock-row creation, Procurement receive-vs-cancel, Payroll settings initialization, inactive Payroll test fixtures, and brittle Decimal string-format assertions.

Release commit `9b9ea1c` passed a fresh Vercel preview (`dpl_FzzxJmJaDwv9gNaVH2nHUwANmLeZ`) with database health and Hotel/School module-page probes before being fast-forwarded to `main`. Production deployment `dpl_FHA61GugPECZyn77FV4uVraSEUjU` reached Ready. Its logs prove the Hotel/School migration applied, 104 permissions and their role grants were seeded, 13 modules were upserted ACTIVE, and all Hotel and School routes compiled. The public `https://www.rockfrostgroup.com/api/health` endpoint returned HTTP 200 with `database: reachable`, and `/modules` returned HTTP 200 with both vertical suites present.

## 2026-08-03 — Hotel and School vertical-suite architecture

Approved and documented the complete Hotel and School expansion in
`docs/HOTEL_AND_SCHOOL_MODULES.md`. The contract covers hotel property/stay,
folio, housekeeping, food-and-beverage, guest-service, commercial, and channel
domains, plus school student/guardian, academics, attendance, fees, assessment,
timetable, transport, library, hostel, health, cafeteria, workforce, and payroll
domains. Critical state/financial/academic invariants and release gates are now
explicit.

Added Hotel and School to `src/platform/modules/registry.ts` as `coming-soon`
definitions with no navigation or permission prefix. This intentionally makes
them visible on product/acquisition surfaces while `canAccessModule()` continues
to reject tenant access. Catalog rows were added to the idempotent platform seed
so public enquiries can resolve their module IDs; this does not enable either
module for a tenant. No database migration or environment change was made. Updated README, Architecture, Module
Boundaries, SEO, Solutions metadata/copy, and this decision log to reflect the
current truth.

Validation: registry/static-source checks completed; full lint/test/build results
are recorded below when run. Pre-existing untracked `output/` and `reports/`
directories in the requested project were preserved and excluded from the
working copy. Remaining work is implementation of Release H1/S1; neither module
is represented as operational or tenant-accessible.

## 2026-07-28 — Trial enforcement, monitoring, accessibility, dependency hardening, and SEO follow-through

Implemented automatic 14-day trial expiry in
`src/platform/trials/service.ts`, invoked daily at 01:15 UTC by the
authenticated `/api/cron/expire-trials` route configured in `vercel.json`.
The idempotent sweep excludes internal platform anchors and tenants with a
current active subscription, suspends eligible organizations, disables their
modules, notifies active members, and records an atomic audit event.

Added `/api/health`, structured cron and uncaught-request logs via
`src/instrumentation.ts`, Vercel Web Analytics and Speed Insights, a
keyboard-visible skip link, focusable `main` landmarks, and reduced-motion
support. Upgraded Next.js/eslint-config-next from 16.2.9 to 16.2.12 and
NextAuth to 4.24.15; patched PostCSS/Sharp transitive versions are pinned by
overrides. `npm audit --omit=dev` reports zero vulnerabilities.

Tests added: `test/trial-expiry.test.ts`,
`test/trial-expiry-cron.test.ts`, and `test/health-route.test.ts`.
Validation: ESLint and TypeScript passed; all 208 mocked tests passed across
32 files; the Next.js 16.2.12 production build passed and generated 133 static
pages. Prisma validation initially failed because the local `DIRECT_URL` is
empty; rerun with the documented harmless placeholder values before handoff.

Documentation synchronized: README and the architecture/authentication counts
now state 78 permissions; billing and hardening docs no longer claim trial
expiry, gateways, monitoring, or accessibility are unimplemented; new
`docs/OPERATIONS_AND_MONITORING.md` is the operations runbook.

Search Console remains an external account action: the browser-control runtime
reported no available browser, so ownership verification and sitemap
submission were not falsely claimed. Reconnect a signed-in browser and finish
the exact Cloudflare TXT + Search Console workflow in `docs/SEO.md`.

No database migration is required. A 48-byte generated `CRON_SECRET` was added
to the Vercel production environment as a sensitive value. Production
deployment `dpl_DEWgpbiXTfBwAQoAzJmx6f5das37` reached `READY`; its build ran
`prisma migrate deploy` and confirmed all 25 migrations were already applied.
The `www`, `app`, and `admin` aliases resolve to the deployment. Live checks
returned HTTP 200 for the database-backed health endpoint, sitemap (17 URLs),
robots response, and public skip-link target; an unauthenticated cron request
correctly returned HTTP 401. Vercel Web Analytics was enabled through the
project API, Speed Insights is active, and the post-deploy error-log query was
clean. Prisma schema validation also passed locally with harmless placeholder
URLs because the checked-in local environment intentionally has an empty
`DIRECT_URL`. A disposable `TEST_DATABASE_URL` was unavailable, so the guarded
real-PostgreSQL integration suite was not run.

## 2026-07-26 — RF favicon and installed-app icons

Replaced the generic geometric SVG favicon with the supplied `public/rf logo.png`. The source remains unchanged; its alpha bounds were tightly cropped and the full RF mark was centered on a brand-navy rounded square. Added Next.js file-convention assets at `src/app/favicon.ico` (16/32/48), `src/app/icon.png` (32), and `src/app/apple-icon.png` (180), plus manifest icons at `public/icon-192.png` and `public/icon-512.png`. Removed the explicit root metadata icon override and the obsolete SVG assets so Next.js emits the correct size/type metadata automatically. Updated `public/manifest.webmanifest` and `docs/DESIGN_SYSTEM.md`.

Validation passed: generated dimensions and all three embedded ICO sizes verified, manifest JSON parsed successfully, ESLint, TypeScript, all 200 tests across 29 files, and the Next.js production build (133 generated routes, including `/icon.png` and `/apple-icon.png`).

Commit `389fd85` was pushed to `main` and deployed successfully as Vercel production deployment `dpl_6vhMyhC62ZYVUXTZM5m3vSBGQusD` (`READY`). The `www`, `app`, and `admin` aliases all resolve to it. Live checks returned HTTP 200 with the correct image MIME types for `/favicon.ico`, `/icon.png`, `/apple-icon.png`, and `/icon-512.png`; the one-hour post-deploy error scan was clean.

## 2026-07-26 — Concurrent owner and tenant sessions by subdomain

Implemented host-separated authentication so the same browser profile can remain signed in as a platform owner and tenant simultaneously. `admin.rockfrostgroup.com` is the platform control plane, `app.rockfrostgroup.com` is the tenant workspace, and `www.rockfrostgroup.com` remains public. NextAuth's session-token cookie is explicitly host-only, credential login rejects identities on the wrong surface, and the authenticated app layout independently repeats the host/role check. `src/proxy.ts` routes legacy and cross-surface URLs but is not relied on as the sole authorization gate.

Invitation links and payment callbacks now target `app.*`; password-reset links preserve the requesting surface; sign-out callbacks preserve the current origin; and authentication redirects allow only the three trusted origins (plus local development). Vercel project domains `admin.rockfrostgroup.com` and `app.rockfrostgroup.com` were attached. Cloudflare has unproxied `admin` and `app` CNAME records pointing to `a39ecc209697275a.vercel-dns-017.com`; Vercel reports both domains verified and configured correctly.

Validation passed: ESLint, TypeScript, Prisma schema validation, all 197 tests across 28 files, and the Next.js production build (116 routes plus Proxy).

Commit `5d346fb` was pushed to `main` and deployed successfully as production deployment `dpl_HTfRzYVUvvQALvtgsfxs1tmxe3fa` (`READY`). All three aliases resolve to that deployment. Live HTTP verification passed: `www/login` redirects to `app/login`, legacy `www/app/platform/*` redirects to `admin/app/platform/*`, both subdomain roots redirect to their own `/login`, and both login pages return HTTP 200. The one-hour post-deploy error scan was clean.

## 2026-07-26 — Immutable platform-owner/tenant identity boundary

Root cause of the reported owner-to-tenant workspace jump was a three-part identity-resolution conflict: tenant creation could attach the platform owner's existing `User` to an `Organization Owner` membership; NextAuth selected the earliest membership; and `getCurrentTenant()` preferred the `active_org` cookie. The fix establishes the active global system `Super Admin` membership as the immutable platform identity in `src/lib/auth/platform-identity.ts`. NextAuth and tenant resolution now canonicalize that identity to the internal platform anchor before any cookie/JWT fallback, tenant context hides all non-anchor memberships, and the switch action clears the organization cookie and returns the owner to the platform dashboard.

Tenant creation and invitation now reject a platform identity's email, including transaction-time rechecks. Migration `20260726050000_enforce_platform_owner_isolation` idempotently marks historical tenant memberships `REMOVED`, revokes associated pending invitations, and increments affected users' `sessionVersion`. `scripts/repair-platform-owner-isolation.ts` and `npm run db:repair-platform-owner-isolation` provide the equivalent operator repair/check.

Verification passed: the focused identity suite (31 tests), ESLint, TypeScript, Prisma schema validation, all 186 tests across 26 files, and the Next.js production build (116 generated routes). The direct local repair command could not connect to the configured Neon endpoint (`ep-crimson-star-ah27j3if-pooler.c-3.us-east-1.aws.neon.tech:5432`), so live data cleanup was delegated to the deployment migration.

Commit `5525750` was pushed to `main` and deployed successfully to production as Vercel deployment `dpl_GPDCZuk7x6bCxs4x4NDKNt3Lya9d`, aliased to `https://www.rockfrostgroup.com`. The production build connected to Neon and reported no pending migrations, confirming the cleanup migration had already been applied by the Git-triggered deployment. The deployment is `READY`; the one-hour post-deploy error-log scan was clean. Direct row-by-row verification from the local machine remains unavailable because its Neon pooler endpoint cannot be reached.

## 2026-07-26 — UI/UX and profile-thumbnail quality pass

Vetted the platform-owner and profile experience after the identity-boundary work. The small tiled control beside the account avatar was the tenant Module Launcher, which `AppShell` rendered unconditionally; platform layout now disables it. `UserMenu` previously rendered only `AvatarFallback`, so uploaded images could never appear there. It now renders `AvatarImage` when present and a clean initials fallback otherwise.

Replaced the raw profile file input with a responsive photo editor including preview, accessible picker, format/size guidance, selected filename, pending state, inline errors, and success feedback. Added authenticated `/api/account/profile` retrieval with `private, no-store` caching plus immediate refresh after upload. The image remains out of JWT cookies to avoid exceeding cookie-size limits. Added app-wide loading skeletons and a recoverable runtime error boundary. Full findings are in `docs/UI_UX_QUALITY_AUDIT_2026-07-26.md`.

Verification passed: ESLint, TypeScript, all 182 unit tests across 25 files, and the Next.js production build (116 routes). Browser-control backends were unavailable during this pass, so no claim of an automated authenticated screenshot walkthrough is made.

## 2026-07-26 — Platform-owner and tenant-workspace boundary

Fixed the underlying route/context conflict reported by the user. The shared account dropdown previously hardcoded `/app/account` and `/app/administration`, placing a platform Super Admin inside the tenant `(overview)` shell. Platform operators now use `/app/platform/account` and `/app/platform/settings`; account mutations preserve the originating account route. The tenant overview layout rejects platform operators server-side, and business-module access sends them back to `/app/platform/dashboard`.

The platform `AppShell` no longer receives the internal anchor as organization-switcher data, and its desktop/mobile logo links to the platform dashboard rather than the tenant dashboard. Tenant behavior remains unchanged for future customer users. The authoritative boundary is documented in `docs/PLATFORM_IDENTITY_BOUNDARY.md`.

## 2026-07-26 — Internal platform anchor excluded from tenant surfaces

Corrected the platform UI after the user rightly observed that the required internal authorization anchor was displayed as a tenant. Organizations carrying an active system Super Admin membership are now excluded centrally from platform tenant counts, active-member/module-adoption totals, organization lists, request/subscription selectors, and direct tenant detail/configuration routes. The clean bootstrap also marks the anchor with `metadata.isPlatformAnchor = true`. With the current clean database, every customer-tenant surface reports zero organizations while the single platform owner can still authenticate.

## 2026-07-26 — Single platform-owner identity

Superseding the two-identity bootstrap below at the user's direction, the live database was reset again and now contains exactly one user and one membership: `owner@rockfrostgroup.com`, named Rock Frost Platform Owner, with the system `Super Admin` role. There is no Organization Owner or customer-tenant login. The one remaining organization is the protected internal platform anchor required by the current membership-based authorization model, not a customer tenant.

The default login callback now targets `/app`; that server route sends platform operators to `/app/platform/dashboard` and tenant users (when real customer tenants are later onboarded) to `/app/dashboard`. Post-reset counts: 1 user, 1 internal platform organization, 1 membership, 17 roles, 78 permissions, and 11 module definitions. The new plaintext password was returned only to the user and is not recorded here.

## 2026-07-26 — Clean production platform reset

At the user's explicit request, the configured `neondb.public` database was reset with `scripts/reset-platform.ts`. All 77 application tables were truncated while `_prisma_migrations` was preserved. The canonical platform catalog was reseeded and one fresh platform anchor was created with separate Super Admin and Organization Owner identities. No demo tenants, module transactions, subscriptions, requests, notifications, or audit history were recreated.

Post-reset counts: 2 users, 1 organization, 2 memberships, 17 system roles, 78 permissions, and 11 active module definitions. Plaintext bootstrap passwords were returned directly to the user and were not written to this repository or documentation. The existing sequential catalog seed was converted to bulk permission/grant insertion so clean bootstraps complete reliably over the remote Neon connection.

## 2026-07-26 — Account, tenant, and platform settings

Implemented editable user profiles (name, phone, sign-in email), bounded profile-picture uploads, authenticated password changes, tenant logo uploads, tenant backup/recovery policy controls, and tenant-wide theme defaults. Email and password changes revoke existing sessions. Organization administrators can remove tenant access without deleting a shared user identity; self-removal and removal of the final active Organization Owner are blocked.

The platform organization-deletion recovery period is no longer a source constant. Platform operators manage it at `/app/platform/settings`; it is persisted in the platform anchor organization's metadata, so no schema migration is required. Tenant controls live at `/app/organization/settings`, linked from Administration. Detailed behavior and infrastructure boundaries are documented in `docs/ACCOUNT_AND_TENANT_SETTINGS.md`.

Verification: Prisma client generation, lint, TypeScript compilation, and the Next.js production build pass (114 routes). Commit and deployment status should be recorded below once completed.

## 2026-07-26 — Completed requests leave the operator queue

Approving and enabling an existing module now sets its `ModuleRequest` to
`COMPLETED` instead of leaving it at `APPROVED`. The platform request query
excludes `COMPLETED`, `CANCELLED`, and `REJECTED`, keeping the work pane
actionable while preserving every request and audit event in storage.
Regression coverage now asserts the completed transition.

## 2026-07-26 — Public acquisition, onboarding, billing, and subscriptions

**Implemented:** Public `/modules` cards now send visitors to a module-specific
demo or module request form. The contact form persists phone/WhatsApp,
preferred communication channel, intent, exact module, expected users,
industry, and country; validates module/phone requirements; emails the sales
address; and creates an in-app notification for every active platform Super
Admin. `/app/platform/requests` shows the enquiry with email/call/WhatsApp
actions and a direct **Create organization from inquiry** path.

Organization onboarding now prefills the customer/company fields from the
enquiry. Tenant codes are generated server-side from the organization name
with collision-safe suffixes and are no longer operator-entered. Creating the
organization still creates/invites its owner and now converts the enquiry into
a first-class `DEMO`, `ENABLE_EXISTING`, or `CUSTOM_MODULE` request.

`/app/platform/subscriptions` is now a working operator ledger. It supports
manual/offline agreements and platform-managed subscriptions, agreed
price/currency, duration, auto-renew intent, linked module requests, payment
confirmation, activation, cancellation, audit logging, and organization
notifications. Payment confirmation calculates the term end, enables the
module, and completes the linked request. Once a module has subscription
history, `getCurrentTenant()` exposes it only during a current paid `ACTIVE`
term; legacy non-subscription module activations remain compatible.

**Payment boundary:** No card/mobile-money gateway was present or selected.
`PLATFORM_MANAGED` is therefore a real lifecycle/renewal classification, but
an operator must confirm a payment reference before activation. The system
does not falsely claim online payment processing. A future signed provider
webhook should reuse `activateSubscription()`.

**Schema/migration:** Added enquiry/contact enums and fields plus the
`Subscription` model in
`20260726020000_add_acquisition_and_subscriptions`. A concurrent compatible
follow-up, `20260726030000_add_subscription_payment_gateway`, reserves
Paystack/Flutterwave provider metadata and adds server-only initialization,
verification, and signature/hash-verification adapters plus documented
optional environment variables. No checkout/callback/webhook routes call
those adapters yet, so this does not claim a working end-user gateway.
Prisma format/generate completed. The migrations were **not applied from this
workstation**:
both `DATABASE_URL` and `DIRECT_URL` currently point to the pooled endpoint;
retrying with the derived direct endpoint still returned Prisma's generic
`Schema engine error`, and a direct Prisma query confirmed that this
environment cannot reach the Neon host at all. The repository's Vercel build
runs `prisma migrate deploy` before `next build`; verify that remote migration
succeeds before treating the deployment as live. No environment file was
modified and no credential was printed.

**Validation:** `npx tsc --noEmit` passed; `npm run lint` passed; `npm run
test` passed (23 files, 164 tests); `npm run build` passed on Next.js 16.2.9,
including TypeScript and all 107 routes. Added regression coverage for
module-specific operator notifications, subscription creation/activation,
module enablement, request completion, and expired-term access denial.

**Documentation:** Added `docs/BILLING_AND_SUBSCRIPTIONS.md`; updated README,
the development roadmap, hardening plan, module registry commentary, and this
handoff. The earlier test-suite repair documentation remains immediately
below.

## 2026-07-26 — Documentation discipline and test-suite repair

**Why:** A shared-agent audit of the five commits preceding this entry found
that three included relevant documentation, while
`18221a1` (Fleet document renewal notifications) and `ed644f8`
(Installment ownership/salary-eligibility hardening) did not update an
authoritative current-state document in the same commit.

**Durable process fix:** `AGENTS.md` now requires every code/schema/config/
behavior/test change to update the relevant authoritative documentation and
`OPERATOR_HANDOFF.md`, keep tests and documented counts synchronized, record
validation results, and protect concurrent agents' work through `git status`
checks. Fleet renewal reminders are now recorded in
`docs/FLEET_MODULE_IMPLEMENTATION.md`. The Installment ownership and salary
eligibility behavior was already represented by the current code, tests, and
handoff references, but the original commit's missing same-commit handoff is
recorded here rather than rewriting history.

**Test repairs:** Updated the module-authorization coverage expectation from
76 to 77 module pages after the Fleet investor route was added. Updated the
Fleet service test's Prisma mock to execute `$transaction`, expose the
transactional `fleetPayment.create`, and assert that the verified payment
record is written; this preserves coverage of the production transaction
rather than weakening the implementation to satisfy an old mock.

**Validation:** Targeted repaired tests passed (2 files, 23 tests);
`npm run lint` passed; `npm run test` passed (22 files, 160 tests);
`npm run build` passed under Next.js 16.2.9, including TypeScript and all 107
generated routes. The guarded real-Postgres integration suite was not run
because this change only repairs unit-test expectations/mocks and does not
change application or database behavior.

## Mandatory instructions for every agent

Before making changes:
1. Read this entire file.
2. Read `docs/PRODUCT_VISION.md`, `docs/ARCHITECTURE.md`, and `docs/MODULE_BOUNDARIES.md`.
3. Read `docs/DEVELOPMENT_ROADMAP.md` to see what phase is active.
4. Check `git status`.
5. Do not follow anything under `docs/archive/` — it's retired and explicitly non-authoritative.
6. Do not undo or overwrite another agent's work unless explicitly instructed.

After making changes:
1. Run the full validation suite from `docs/TESTING_STRATEGY.md` (`npm run lint`, `npx tsc --noEmit`, `npx prisma validate`, `npx prisma generate`, `npm run test`, `npm run build`) and fix all errors. `npm run test` (Vitest) is a real, committed suite as of the 2026-07-21 hardening pass — it is not optional scaffolding; run it and fix failures like any other check.
2. Update this file: date, objective, files changed, summary, build result, known issues, next recommended step.
3. Commit only intentional changes.
4. **After pushing to `origin/main`, always check the Vercel deployment status and confirm it succeeds** (e.g. `vercel ls` to see the latest deployment's state, or `vercel --prod` to trigger and watch a fresh build live) — do not treat a clean local `npm run build` as proof the deployment is healthy. A real incident happened where Vercel's build cache reused a stale generated Prisma Client from before a schema change, causing a production build failure a clean local build did not catch (see `package.json`'s `postinstall` script and the Phase 8/9 boundary in the handoff log below for the fix). If a deployment shows `Error`, investigate and fix before considering the task done.

## Current phase

**All sixteen product phases are feature-complete (see `docs/DEVELOPMENT_ROADMAP.md`).** The project is in a dedicated **production-hardening track**. Hardening Passes 1–3 and Pass 4 Milestones A–D now cover tenant/session/IDOR controls, financial concurrency, invitations, validation, real-Postgres test infrastructure, audit logging, automatic trial expiry, health checks, structured error logging, performance telemetry, and accessibility baselines. Remaining work is external verification and continuous operations: payment-provider sandbox round trips, the Search Console account workflow, a live disposable-Postgres integration run when available, ongoing Core Web Vitals/accessibility review, and the branch-access design.

**Billing/Subscriptions is no longer a placeholder.** A prior, undocumented pass (commits `54226be`/`d5eba17`/`2312aa9`/`18221a1`/`ed644f8` — **not previously logged in this file**, a gap in itself; see the note at the end of the entry below) had already built the full acquisition pipeline (`/contact` → platform inquiry inbox → organization creation with auto-generated tenant codes and prefilled fields → `Subscription` record with a `MANUAL_OFFLINE`/`PLATFORM_MANAGED` mode) and reserved but never wired `PAYSTACK`/`FLUTTERWAVE` as gateway-provider values. This pass (below) connects that reservation to real Paystack and Flutterwave checkout, a tenant-facing billing page, and both providers' webhooks. See `docs/BILLING_AND_SUBSCRIPTIONS.md` for the full design.

## Current architecture (short version — see `docs/ARCHITECTURE.md` for full detail)

- Next.js 16 App Router under `src/app/`. Public marketing site at bare paths via `(public)`; auth UI via `(auth)`; **everything requiring sign-in lives under `/app/*`** — `app/(overview)` (organization scope), `app/fleet`, `app/installment`, `app/crm`, `app/inventory`, `app/accounting`, `app/hr`, `app/procurement`, `app/payroll`, `app/analytics`, `app/pos`, `app/projects`, `app/platform` (platform scope). See `docs/ARCHITECTURE.md`'s "Why /app exists."
- Each module (`fleet`, `installment`, `crm`, `inventory`, `accounting`, `hr`, `procurement`, `payroll`, `analytics`, `pos`, `projects`) has its own `layout.tsx` rendering `AppShell` with its own navigation array, guarded on `canAccessModule()` (module enabled for the org + a permission under that module's registered `permissionPrefix`).
- `src/platform/modules/registry.ts` is the single source of truth for every module's metadata; `src/platform/modules/dashboard-widgets.tsx` maps a module key to a real dashboard summary component — every business module except Analytics (which has no natural summary distinct from its own pages) is wired up.
- shadcn/ui (Base UI primitives) + Tailwind v4 design system — see `docs/DESIGN_SYSTEM.md`.
- **All eleven business modules are fully real.** Fleet Management (Phase 6), Installment Management (Phase 7), CRM (Phase 8), Inventory Management (Phase 9), Accounting (Phase 10), Human Resources (Phase 11), Procurement (Phase 12), Payroll (Phase 13), Analytics (Phase 14), Point of Sale (Phase 15), and Project Management (Phase 16) are complete. Billing/subscriptions is an implemented cross-platform capability rather than a twelfth tenant module. See `docs/BILLING_AND_SUBSCRIPTIONS.md`.
- **Every mutating Server Action that redirects to a list page calls `revalidatePath()` on that page immediately before the `redirect()`** — a systemic gap discovered and fixed during Phase 8 across every action file that existed at the time; every module built since (Inventory, Accounting, HR, Procurement, Payroll, POS, Projects) was written with this pattern from the start.
- **`package.json` has a `"postinstall": "prisma generate"` script** (added after Phase 9) — required because Vercel's build can reuse a cached `node_modules` (including an already-generated Prisma Client) across deployments without regenerating it, which caused a real production build failure right after Phase 8/9 shipped. **Always check deployment status after pushing** (see the "After making changes" checklist above) — this is a standing rule, checked after every phase since (Accounting through POS all confirmed `READY` via `vercel --prod`).
- **Two modules now call directly into a second module's service function as real, load-bearing behavior** (not just a UI shell): Procurement's receiving flow and POS's checkout/refund flow both call Inventory's own `recordMovement()` — receiving posts a stock `RECEIPT`, a POS sale posts an `ISSUE` and a refund reverses it with a `RECEIPT`. Both are deliberate, documented cross-module integrations (see `docs/DECISIONS.md`'s two 2026-07-20 entries, and `docs/MODULE_BOUNDARIES.md`) — the template for any future integration of this kind is the same: call the other module's public service function, never its Prisma models directly, and record the decision.
- **Analytics owns no database tables** — it's the one module built without a migration, a pure aggregation layer over every other enabled module's own summary function.
- `prisma/schema.prisma` changes since Phase 3's reconnection: `User.failedLoginAttempts`/`User.lockedUntil` (migration `20260720120000_add_login_lockout`); CRM (migration `20260720140000_add_crm_module`); Inventory (migration `20260720160000_add_inventory_module`); Accounting (migration `20260720180000_add_accounting_module`); HR (migration `20260720200000_add_hr_module`); Procurement (migrations `20260720220000_add_procurement_module` and `20260720230000_add_procurement_settings`); Payroll (migration `20260720240000_add_payroll_module`); Analytics (no migration — owns no tables); POS (migration `20260720260000_add_pos_module`); Projects (migration `20260720280000_add_projects_module`); `User.sessionVersion` (migration `20260721000000_add_user_session_version`, hardening Pass 1); `Invitation` (migration `20260721010000_add_invitations`, hardening Pass 3a). All applied via `prisma migrate deploy` — **not** `prisma migrate dev`, which detects a pre-existing drift between the live database's migration history and the local `prisma/migrations/` folder (leftover from before this rebuild) and offers to reset the entire database. That offer was declined every time; `migrate deploy` applied each migration cleanly without touching anything else. Anyone continuing this project should use `migrate deploy` (or hand-write the migration SQL and apply it that way) rather than `migrate dev` against this specific database.
- **`getCurrentTenant()` (`src/lib/tenant/index.ts`) is the single authoritative tenant-state check for the whole app** (hardening Pass 1) — it filters to `ACTIVE` memberships in `ACTIVE`/`TRIAL` organizations *before* any cookie/session-based selection logic runs, so an invalid membership/organization can never be silently selected as a fallback. It also computes `TenantContext.accessibleModuleKeys` (enabled **and** permitted, vs. `enabledModuleKeys` which is enablement-only) — anything rendering module data or "open module" links must filter on `accessibleModuleKeys`, not `enabledModuleKeys`.
- **Sessions are JWT-based (NextAuth v4) but revalidated against the database on every request**, not just at sign-in (Pass 1) — `User.sessionVersion` is embedded in the token at login and compared against the live database value on every subsequent `jwt()` callback invocation; a mismatch (or a non-`ACTIVE` user) clears the session immediately. `src/lib/auth/session-revocation.ts`'s `revokeUserSessions(userId)` bumps the version; called today from `resetPassword()` and invitation acceptance for a brand-new user. See `docs/HARDENING_PLAN.md` §2 for what this does and doesn't cover yet.
- **`npm run test` (Vitest) is a real, committed test suite** as of the 2026-07-21 hardening pass — the project's first (`docs/TESTING_STRATEGY.md` previously noted zero committed automated tests). Config at `vitest.config.ts` aliases the `server-only` package (a Next.js bundler intrinsic, not an installed npm package — resolving it requires this alias outside of Next's own build) to an empty stub at `test/stubs/server-only.ts`. Tests live in `test/*.test.ts` and mock `@/lib/db` rather than hitting the real Neon database. 101 tests across 10 files as of Pass 3c.
- **Every financial/inventory state transition that used to be a read-then-absolute-write now uses one of two atomic Prisma patterns** (hardening Pass 2, see `docs/HARDENING_PLAN.md`'s Pass 2 section for the full per-module breakdown): a **guarded `updateMany`** (the invariant — enough stock, still in the right status — lives in the `WHERE` clause, checked via the returned `count`) for anything that must reject under a failed precondition, and a plain atomic `increment`/`decrement` for anything that must always accumulate correctly regardless of concurrent writers. Any new mutating function touching `InventoryStock.quantity`, an `HirePurchaseAccount`'s `balance`/`totalPaid`, an `AccountingInvoice`'s `amountPaid`, or any `DRAFT`/`PENDING`/`OPEN`-style status field should follow one of these two patterns, not a fresh `findFirst` + JS-computed `update`.
- **`Inventory.recordMovement()` optionally accepts an existing transaction client** (`tx?: Tx`, `Tx` exported from `src/modules/inventory/service.ts`) so callers like POS's `createSale()`/`refundSale()` and Procurement's `receiveOrderLine()` can commit their own row changes and Inventory's stock movement as one all-or-nothing transaction while still calling Inventory's public service function, never its Prisma models directly (the module-boundary rule in `docs/MODULE_BOUNDARIES.md`). Omitting `tx` opens a standalone transaction exactly as before — this is backward compatible for every pre-existing caller.
- **Invitations are bound to one specific `OrganizationMember`, not an email** (hardening Pass 3a) — `src/lib/auth/invitations.ts`'s `Invitation` model stores a SHA-256 `tokenHash` (never the raw token) with a unique `membershipId`, so accepting one invitation can only ever activate that one membership. Two distinct accept paths exist: `acceptInvitationNewUser()` for a user who's never set a password, `acceptInvitationExistingUser()` for an already-active user being added to an additional organization (never touches their password; requires the currently authenticated session to already belong to that exact user). The login page (`src/app/(auth)/login/page.tsx`) now honors a `callbackUrl` query param so "log in, then come back and accept" works — it previously hardcoded the post-login destination.
- **`src/lib/auth/tokens.ts` now only handles password-reset tokens** — the invite-specific `issueInviteToken`/`consumeInviteToken` functions were removed entirely (Pass 3a), replaced by the `Invitation` model above. Don't reintroduce an email-keyed invite token; the whole point of the redesign was binding to a membership instead.
- **`src/lib/validation.ts` is the shared Zod primitives library** (hardening Pass 3b, rolled out to every remaining mutating Server Action file in Pass 3c) — `moneyAmount`/`moneyAmountNonNegative`, `positiveInt`, `percent0to100`, `email`, `shortText`/`longText`, `dateInput`, `cuid`, `escapeHtml()`, `parseWithSchema()`. Every mutating Server Action in the app now validates its FormData input through this library before calling the service layer. Use this library, don't invent a parallel one, when validating new untrusted input.
- **Every module's `service.ts` is expected to validate every foreign id a caller supplies against the organization** — Pass 1/2 fixed this for Administration/Projects/Payroll/POS/Inventory/Procurement/Accounting/Installment (`createAccount`/`updateCustomer` only); Pass 3b audited and fixed the same pattern in CRM (`ownerId`/`contactId`/`leadId`/`dealId`), HR (`managerId`/`employeeId`/`leaveTypeId`), and Fleet (`ownerId`/`assignedDriverId`/`vehicleId`); Pass 3c finished the audit for Installment's remaining functions (`recordStaffSalaryPayment`, `adjustStaffInventory`) and POS's register/warehouse setup. A new function accepting a relation id from a caller must resolve it with `findFirst({ where: { id, organizationId } })` (or equivalent) before writing — never trust a bare id.
- **Money arithmetic that produces a value written to the database, or that decides a core invariant (the ledger's debit=credit check), uses `Prisma.Decimal`, not JS `Number`** (hardening Pass 3c) — `new Prisma.Decimal(value)` from `import { Prisma } from "@prisma/client"`, with `.plus()`/`.minus()`/`.times()`/`.div()`/`.toFixed(2)`/`.greaterThan()`/etc. rather than float arithmetic and `.toFixed(2)` on a `Number`. This replaced two `0.005`-epsilon fudge-factors in Accounting that existed specifically to work around float rounding error — Decimal comparison needs no epsilon. Read-only reporting/dashboard aggregations (recomputed fresh every request, not accumulated) were deliberately left as `Number` — see `docs/HARDENING_PLAN.md`'s Pass 3c section for the exact scope and reasoning. Follow this pattern for any new derived-and-persisted monetary computation; don't introduce fresh `Number()` conversions on `Decimal`-typed fields that feed a database write.

## Files changed (Paystack + Flutterwave payment gateways for platform-managed subscriptions)

**Created:** `prisma/migrations/20260726030000_add_subscription_payment_gateway/migration.sql` (`PaymentGatewayProvider` enum, `Subscription.gatewayProvider` column, a lookup index on `(gatewayProvider, paymentReference)`); `src/lib/payments/{types,paystack,flutterwave,config,index}.ts` (gateway clients — `initializeTransaction()`/`verifyTransaction()` per provider, Paystack's HMAC-SHA512 `verifySignature()`, Flutterwave's constant-time `verifyWebhookHash()`, `isGatewayConfigured()`); `src/app/app/(overview)/organization/billing/{page.tsx,actions.ts}` (tenant-facing billing page, gated on `org.settings.manage` like the rest of Organization); `src/app/app/(overview)/organization/billing/callback/{paystack,flutterwave}/page.tsx` (post-checkout return pages); `src/app/api/payments/{paystack,flutterwave}/webhook/route.ts` (the authoritative payment-confirmation path); `docs/BILLING_AND_SUBSCRIPTIONS.md` (rewritten — see note below); `test/payments-gateway-clients.test.ts` (10 tests), `test/subscription-gateway-payment.test.ts` (8 tests).

**Modified:** `prisma/schema.prisma` (`Subscription.gatewayProvider`, new enum); `src/platform/subscriptions/service.ts` (extracted the shared `finalizeActivation()` helper out of `activateSubscription()` so the existing manual-reference path and the new gateway path can't drift apart; added `initiateGatewayPayment()` and `activateSubscriptionFromGateway()`); `.env.example` (`PAYSTACK_SECRET_KEY`/`PAYSTACK_PUBLIC_KEY`/`FLUTTERWAVE_SECRET_KEY`/`FLUTTERWAVE_PUBLIC_KEY`/`FLUTTERWAVE_WEBHOOK_HASH`); `src/platform/modules/workspace-navigation.tsx` (new "Billing" nav link); `src/app/app/(overview)/organization/page.tsx` (new "Billing" card linking to the billing page).

**Migration impact:** additive only (nullable enum column + index) — zero-downtime.

**Note on `docs/BILLING_AND_SUBSCRIPTIONS.md`:** this file already existed before this pass, describing the acquisition pipeline (contact → inquiry → organization creation → subscription record) as implemented and explicitly documenting that Paystack/Flutterwave were "reserved... not yet connected to a checkout page, callback route, or webhook route." That pipeline was real and already working (see below) — but the schema had no `PaymentGatewayProvider` enum, no `gatewayProvider` column, and no `src/lib/payments/` code before this pass, confirmed by inspecting the schema and codebase directly rather than trusting the doc. The doc was accurate about the pipeline and aspirational (ahead of the actual code) about the gateways; it's been updated in place to describe what's now actually implemented rather than left to drift further.

## Summary of what was done (Paystack + Flutterwave payment gateways)

Triggered by the user asking for the full contact→request→subscription pipeline they described, then narrowing to "let's use Paystack and Flutterwave" after a short exploratory exchange about MTN MoMo. Investigating first (per this file's own mandatory instructions) found that almost everything the user described was **already built** in undocumented commits made since the last handoff update (`54226be`, `d5eba17`, `2312aa9`, `18221a1`, `ed644f8` — flagged to the user directly as a process gap, since this file's own rules require every agent to update it): the contact form's demo/module/custom-module routing with a preferred-contact channel, the platform inquiry inbox with one-click Email/Call/WhatsApp actions, prefilled organization creation from an inquiry with an always-automatic tenant code, and a full `Subscription` model with `MANUAL_OFFLINE`/`PLATFORM_MANAGED` modes already gating `OrganizationModule` access by `getCurrentTenant()`. The only real gap was that both subscription modes were activated identically — an operator manually typing in a payment reference — with no actual online checkout for `PLATFORM_MANAGED`. Scoped this pass to exactly that gap via `EnterPlanMode`, confirmed with the user that payment should happen on a **tenant-facing billing page** (login required) rather than a public unauthenticated link, then implemented.

**Design**: extracted the existing `activateSubscription()`'s "payment confirmed → grant access" tail (enable the module, complete the linked request, notify the org, audit) into a shared `finalizeActivation()` so the pre-existing manual path and the new gateway path can never drift apart. `initiateGatewayPayment()` (called from the org's own billing page, never the platform operator surface) validates the subscription belongs to the caller's org and is a `PLATFORM_MANAGED` subscription awaiting payment, generates a reference, calls the chosen gateway's `initializeTransaction()`, and stamps the subscription with that reference + provider via a guarded `updateMany` before redirecting to the hosted checkout. `activateSubscriptionFromGateway()` is the single confirmation entrypoint both the **webhook** (authoritative — registered in each provider's dashboard) and the **browser callback page** (a UX accelerant, so the customer isn't stuck waiting on the webhook) call; it re-verifies the payment server-to-server via the gateway's own `verifyTransaction()`, checks the verified amount/currency against the subscription's stored values, and is idempotent — a subscription already `ACTIVE` by the time either caller reaches it is returned as-is rather than re-processed or rejected, since both callers can race for the same payment.

**Security choices worth calling out**: Paystack's webhook signature is verified via HMAC-SHA512 over the *raw* request body (not a re-serialized JSON.stringify, which can silently break byte-for-byte comparison) using `node:crypto`'s `timingSafeEqual`; Flutterwave's `verif-hash` header is a shared-secret string (not a signature) also compared with `timingSafeEqual`. Neither webhook route requires a signed-in session — authenticity comes entirely from the signature/hash check, since these are server-to-server calls from the gateway, not a browser. Neither route ever trusts a webhook or callback payload's own claimed amount/status; both re-verify against the provider's API before calling `activateSubscriptionFromGateway()`.

**Verified**: 18 new Vitest tests (10 for the gateway clients — amount-unit conversion for each provider, Paystack's ×100 subunit conversion specifically, signature/hash accept-and-reject cases, `isGatewayConfigured()` env-driven behavior; 8 for the service layer — `initiateGatewayPayment()` rejecting a foreign org/wrong mode/wrong status, `activateSubscriptionFromGateway()`'s idempotency on a second call and its amount/currency mismatch rejection) — full suite now 182/182 passing across 25 files (up from 101 tests when this file was last updated at Pass 4, reflecting both this pass's tests and the undocumented commits' own tests found already in the tree). Full validation suite run clean: `npm run lint`, `npx tsc --noEmit`, `npx prisma validate`, `npm run build` (118 routes, up from 113 before this pass's 5 new routes: 2 webhook API routes, the billing page, and 2 gateway callback pages).

**Honestly not verified** — stated plainly, matching this project's existing practice: this environment cannot receive an inbound webhook call or reach Paystack's/Flutterwave's real API, so neither gateway client nor either webhook route has been exercised against a real sandbox transaction. The code is written carefully against each provider's documented API shape and is `tsc`-clean, but a real Paystack **and** Flutterwave sandbox checkout — including confirming the webhook actually lands, not just the callback page — is needed before relying on this in production. Also not done in this pass: backfilling handoff entries for the five undocumented prior commits (`54226be`/`d5eba17`/`2312aa9`/`18221a1`/`ed644f8`) — flagged to the user, but reconstructing accurate "what was verified" detail for someone else's already-merged work without fabricating it was judged out of scope for this pass specifically.

**Next recommended step:** run a real Paystack and Flutterwave sandbox transaction end-to-end (checkout → callback page → confirm webhook delivery) before considering platform-managed billing production-ready; separately, backfill or otherwise reconcile this file against the five undocumented commits noted above so it stops drifting from `git log`.

---

## Files changed (Hardening Pass 3a — Invitation redesign)

**Created:** `prisma/migrations/20260721010000_add_invitations/migration.sql`; `src/lib/auth/invitations.ts`; `test/invitation-redesign.test.ts` (13 tests).

**Modified:** `prisma/schema.prisma` (`Invitation` model + `InvitationStatus` enum + back-relations on `User`/`Organization`/`OrganizationMember`); `src/lib/auth/tokens.ts` (invite-specific functions removed, password-reset untouched); `src/lib/auth/actions.ts` (`acceptInvite` rewritten to call `acceptInvitationNewUser()`, new `acceptInviteExisting`); `src/app/(auth)/invite/page.tsx` (rewritten: branches on `previewInvitation()`'s `isNewUser` for the password-setup vs. "log in to accept" path); `src/app/(auth)/login/page.tsx` (refactored to honor a `callbackUrl` query param via a `useSearchParams()`-reading component under `Suspense`, previously hardcoded to `/app/dashboard`); `src/app/app/(overview)/administration/actions.ts` (`inviteMember` uses `createInvitation()` + honest `sendEmail()` result checking, new `resendMemberInvitation`/`revokeMemberInvitation`); `src/app/app/(overview)/administration/page.tsx` (invitation status column, "Email failed" badge, Resend/Revoke buttons); `test/idor-projects-payroll-administration.test.ts` (updated stale mocks for the new `@/lib/auth/invitations` import).

**Migration impact:** additive only (`Invitation` table + enum + FKs) — zero-downtime, no existing data touched.

## Summary of what was done (Hardening Pass 3a)

Continuation of the same 2026-07-20 audit-driven hardening track, per explicit "go ahead" after Pass 2's review checkpoint, following the order recommended at that checkpoint (invitation redesign first, since it was the clearest remaining real security gap).

**The core fix**: invite tokens were previously keyed by email only (`invite:<email>` in the shared `VerificationToken` table), with no binding to which specific membership they were issued for. Confirmed real bugs: accepting one invite activated **every** `INVITED` membership the target user had (a second organization's invite could be accepted through a first organization's link); an existing active user's password was unconditionally replaced by acceptance; a later invite for the same email silently invalidated an earlier organization's still-outstanding invite. The fix adds a dedicated `Invitation` model with a **unique** `membershipId` foreign key and a SHA-256 `tokenHash` (the raw token is never persisted) — accepting resolves the invitation by its hash and activates only that one membership, full stop.

**Two accept paths, not one**: a brand-new user (never set a password) uses `acceptInvitationNewUser()`, which collects and sets a password. An already-active user being invited to an *additional* organization uses `acceptInvitationExistingUser()`, which never calls `user.update()` at all — it requires the browser's current session to already belong to that exact user id, checked server-side, not just client-side trust. The `/invite` page renders whichever form applies; for an existing user with no session yet, it links to `/login?callbackUrl=...` instead of collecting anything itself. This required fixing a real, unrelated bug found while building this: the login page hardcoded its post-sign-in redirect to `/app/dashboard`, silently ignoring any `callbackUrl` query param — refactored into a `useSearchParams()`-reading component (mirroring the pattern the page already used for its notice banner) so the return-to-invite flow actually works.

**Also added**: resend (issues a fresh token, invalidating the old one, with a 60-second cooldown to stop double-click token churn) and revoke (atomic `PENDING`→`REVOKED` claim, same guarded-`updateMany` pattern as every Pass 2 state transition) — both new buttons on the Administration page, shown only for members with a genuinely pending invitation. `sendEmail()`'s real result is now checked; a failed send sets `lastDeliveryFailed` and shows an honest error instead of the previous unconditional "Invitation sent" banner.

**Verified end-to-end via Playwright**: normal login still works after the login-page refactor (regression check); an invalid token, an expired token, and an already-accepted token each render their own distinct message; a brand-new invitee sets a password, lands on `login?activated=1`, logs in, and reaches the dashboard with the invited organization genuinely active (confirmed via the org switcher/dashboard, not just a redirect); the Administration page's Resend/Revoke buttons render and Revoke performs a real atomic state change. All test users/memberships/invitations were deleted afterward via a one-off cleanup script. The existing-user accept path was verified via Vitest (13 tests covering both accept functions, resend cooldown, and revoke's atomic claim) but not separately browser-verified — it needs a second real active account to exercise realistically, and its core invariants (never touches `user.update`, rejects a session/target mismatch) are directly asserted against the service function instead.

**Build result at the time:** Passed — `npm run test` 58/58 passing across 6 files, 101 routes (unchanged).

**Known issues at the time:** Pass 3b+ not started (Zod validation, CRM/HR/Fleet IDOR audit — since addressed, see Pass 3b below), no rate limiting on invite creation itself (still current), documented residual concurrency races from Pass 2 (still current), Installment's `updatePayment()`/`applyCreditToAccount()` races (still current), plus all previously carried-forward gaps.

**Next recommended step (at the time):** Get explicit direction before starting Pass 3b. The user replied "continue," leading directly into the Pass 3b work above.

---

## Files changed (Hardening Pass 3b — Zod validation foundation, public contact form, CRM/HR/Fleet IDOR audit)

**Created:** `src/lib/validation.ts` (shared Zod primitives); `prisma/migrations/20260721020000_add_contact_submission/migration.sql`; `test/validation.test.ts`, `test/contact-form.test.ts`, `test/idor-crm-hr-fleet.test.ts` (28 tests total).

**Modified:** `prisma/schema.prisma` (`ContactSubmission` model); `src/app/(public)/contact/{actions.ts,page.tsx}` (Zod validation, HTML escaping, persistence, per-email rate limit); `src/app/app/(overview)/administration/actions.ts` (email/name validation on invite); `src/modules/crm/service.ts` (`ownerId`/`contactId`/`leadId`/`dealId` IDOR fixes, new `NotFoundError`); `src/modules/hr/service.ts` (`managerId`/`employeeId`/`leaveTypeId` IDOR fixes, new `NotFoundError`); `src/modules/fleet/service.ts` (`ownerId`/`assignedDriverId`/`vehicleId` IDOR fixes, `recordFleetWorkAndPayPayment()` atomicity fix, new `NotFoundError`/`InvalidPaymentAmountError`); every CRM (`contacts`/`leads`/`deals`/`activities`), HR (`employees`/`leave`/`reviews`), and Fleet (`vehicles`/`insurance-roadworthy`/`maintenance`/`work-and-pay`) action file + their `page.tsx` error maps.

**Migration impact:** additive only (`ContactSubmission` table) — zero-downtime.

## Summary of what was done (Hardening Pass 3b)

Continuation of the same 2026-07-20 audit-driven hardening track, per "continue" following Pass 3a's review checkpoint. Two distinct workstreams, deliberately scoped rather than attempting a blanket retrofit of every Server Action in the app (~49 files) in one pass.

**Public contact form hardening**: the audit's most acute *remaining* finding — no email/length validation, no rate limiting, and submitted fields interpolated unescaped directly into an HTML email sent to Rock Frost staff (a real markup-injection vector into outbound mail), plus a submission silently dropped whenever `RESEND_TO_EMAIL` wasn't configured. Fixed with the new shared `src/lib/validation.ts` library, `escapeHtml()` before every field reaches the email template, and a new `ContactSubmission` model that persists every submission regardless of delivery outcome and powers a basic 60-second per-email rate limit. The same library was applied to Administration's invite form (email format + name length, previously unchecked).

**CRM/HR/Fleet cross-tenant IDOR audit**: the audit flagged these three modules as "likely present but unconfirmed" for the unchecked-foreign-id pattern fixed in Pass 1/2 — audited line-by-line and confirmed real gaps in all three. CRM: `ownerId` on contacts/leads/deals, `contactId`/`leadId`/`dealId` on deals/activities. HR: `managerId` on employees, `employeeId`/`leaveTypeId` on leave requests, `employeeId` on reviews. Fleet (the most gaps): `ownerId`/`assignedDriverId` on vehicles, `vehicleId` on documents/maintenance requests/work-and-pay contracts. **Also found while auditing, not originally in scope**: Fleet's `recordFleetWorkAndPayPayment()` had the exact same read-then-absolute-write race Pass 2 fixed everywhere else — fixed with the same atomic multi-field increment/decrement pattern, plus a positive-amount check that didn't exist before.

**Verified**: 28 new Vitest tests (validation primitives, contact-form validation/rate-limiting/escaping, CRM/HR/Fleet IDOR rejections, Fleet payment atomicity) — 86 total across 9 files. The contact form was also browser-verified end-to-end (validation, persistence, rate-limiting); outbound email delivery itself fails in this sandboxed dev environment due to no network egress to Resend — a pre-existing environment limitation confirmed unrelated to this fix, with the escaping behavior verified directly via Vitest against the constructed email body instead.

## Build result (Hardening Pass 3b)

**Passed.** `npm run lint` clean, `npx tsc --noEmit` clean, `npx prisma validate` succeeds, `npm run test` — 86/86 passing across 9 files (58 from Pass 1+2+3a + 28 new), `npm run build` succeeds — 101 routes (unchanged).

## Known issues / deliberate gaps (at the time, Pass 3b)

- **Pass 3c+ not started**: Zod validation for the ~45 remaining Server Action files (Pass 3b covered only the contact form and invite form — the two highest-risk unauthenticated/admin surfaces; every financial module already has service-layer validation from Pass 2, so this is lower urgency than it sounds), Decimal-precision arithmetic throughout Accounting/Payroll/Installment, reproducible seeding/CI. **Since addressed — see Pass 3c below.**
- **Remaining IDOR audit surface**: POS register/session setup beyond Pass 2, and Installment's ~40 functions beyond `createAccount()`/`updateCustomer()` — Installment is the largest, oldest service file in the codebase and warrants its own dedicated pass. **Since addressed — see Pass 3c below.**
- **Documented residual concurrency races from Pass 2** remain (see `docs/HARDENING_PLAN.md`) — none corrupt a primary financial figure. **Still current.**
- **Installment's `updatePayment()`/`applyCreditToAccount()`** (carried forward from Pass 2) retain the same narrower read-then-write race class fixed elsewhere. **Since addressed in Pass 4, Milestone B** — both now use `SELECT ... FOR UPDATE` row locking.
- **No rate limiting on invite creation itself** (carried forward from Pass 3a, only resend is rate-limited). **Still current.**
- **`src/app/app/(overview)/modules/page.tsx` still uses `enabledModuleKeys`** instead of `accessibleModuleKeys` (carried forward from Pass 1) — a dead-end-link UX inconsistency, not a data leak. **Still current.**
- Every gap carried forward from earlier passes remains true and is unaffected by this pass: no data-level scoping in any module, several modules not yet linked to Accounting, POS's three-fixed-line UI, Analytics' lack of time-series drilldown, Fleet's missing owner portal/file uploads, no branch-level enforcement, no public self-registration, unset `RESEND_API_KEY` (confirmed still an issue in this sandboxed environment specifically — no network egress to Resend at all), functionally inert (single-org) organization switcher. Full list in `docs/HARDENING_PLAN.md`.

**Next recommended step (at the time):** Get explicit direction before starting Pass 3c. The user replied "finish the rest," leading directly into the Pass 3c work below.

---

## Files changed (Hardening Pass 4 — real-Postgres tests, concurrency race closure, audit logging)

**Milestone A (commit `975335b`):** `test/integration/setup/{guard,db,fixtures}.ts` (new); `test/integration/tenant-isolation/*.test.ts` (new, 11 files, one per module); `prisma/seed-data.ts` (new, extracted from `prisma/seed.ts`); `scripts/test-db-migrate.ts`, `scripts/test-db-seed.ts` (new); `vitest.integration.config.ts` (new); `vitest.config.ts` (scoped non-recursive); `package.json` (`test:integration`/`test:all`/`db:test:*` scripts, `cross-env`); `.github/workflows/ci.yml` (new `integration` job with a real `postgres:16` service container); `.env.example` (`TEST_DATABASE_URL`); `src/modules/inventory/service.ts` + its action/page (found-and-fixed: `categoryId` had no cross-tenant check).

**Milestone B (commit `e5615b1`):** `src/modules/accounting/service.ts` (`recordInvoicePayment`'s remaining-balance guard now runs inside the transaction against a `SELECT ... FOR UPDATE`-locked row — this codebase's first raw SQL); `src/modules/installment/service.ts` (`applyCreditToAccount`/`recalculateAccountAfterPaymentChange` same fix); `src/modules/procurement/service.ts` (`cancelOrder()` — found and fixed a real bug: its atomic claim allowed cancelling a `PARTIALLY_RECEIVED` order, relying on a stale pre-transaction read that a concurrent receive could slip past); `src/lib/unique-retry.ts` (new — a shared retry helper for 7 different `count()`-then-format document-number generators found to be racy under real concurrency: invoice/expense/employee/sale/request/order/project numbers); `test/integration/concurrency/*.test.ts` (new, 6 files: inventory, pos, procurement, accounting, payroll, installment).

**Milestone C (commits `72b48f8`, `4a6831a`, `800178f`):** `prisma/schema.prisma` (+2 migrations — `AuditLog` gains `membershipId`/`module`/`status`/`correlationId`, `organizationId` made nullable); `src/lib/audit.ts` (new — the shared `logAuditEvent()` service); wired into `src/lib/auth/{nextauth,actions,session-revocation,invitations}.ts` (login/logout/password-reset/session-revocation/invitation-accepted), `src/app/app/(overview)/administration/actions.ts` (invitation created/resent/revoked), `src/app/app/platform/actions.ts` (module enable/disable), and one Server Action file each in Inventory/POS/Accounting/Procurement/Payroll/Installment (the financial/operational mutations); `src/app/app/(overview)/administration/audit-log/page.tsx` + `src/app/api/audit-log/export/route.ts` (new — the org-scoped viewer and its permission-gated CSV export); `src/lib/auth/permissions.ts` + `prisma/seed-data.ts` (`audit.view`/`audit.export` permission keys).

**Migration impact:** all purely additive or constraint-relaxing, zero-downtime, across three migrations this pass.

## Summary of what was done (Hardening Pass 4)

Continuation of the same 2026-07-20 audit-driven hardening track, per an explicit, highly detailed Pass 4 specification naming exact milestones (A: real-Postgres tests → B: concurrency + race closure → C: audit logging → D: observability/performance/resilience, not started) and an explicit "report and validate before continuing between milestones" instruction, which was followed.

**Milestone A** built the first real-database test layer alongside the existing mocked-`db` unit suite: a safety guard that independently refuses to run unless pointed at a database whose name contains `"test"`, differs from the app's own `DATABASE_URL`, and has an explicit `ALLOW_INTEGRATION_TESTS=1` opt-in — verified for real by running it with no test database configured and confirming a clean refusal. Eleven tenant-isolation integration tests (one per module) prove the IDOR fixes from Passes 1–3c against genuine Postgres queries, not mocks; writing them surfaced one previously-undiscovered gap (`InventoryItem.categoryId`), fixed in the same milestone.

**Milestone B** closed the two residual concurrency races the status report had explicitly flagged as accepted-but-undesirable, using `SELECT ... FOR UPDATE` row locking (this codebase's first use of raw SQL, needed because Prisma's query builder can't express a same-row field comparison any other way). Writing the real concurrency test suite surfaced two more genuine bugs neither the original audit nor earlier passes had caught: a real correctness bug in `cancelOrder()` (could cancel an order that had already received real stock, under a specific race timing) and a systemic `count()`-then-format race affecting seven different document-number generators across five modules (previously crashed the second concurrent caller with an unhandled database error instead of corrupting data, since the unique constraint still held).

**Milestone C** built a genuinely production-grade audit system rather than the pre-existing partial one (three ad hoc `auditLog.create` calls with no filtering, no permission gate beyond page-level, no module/status/correlation tracking): a shared service every mutation goes through, wired into authentication, administration, and every financial/operational mutation category the spec named, plus a real org-scoped viewer with filters and a separately-permissioned, self-auditing CSV export. Explicitly documented what wasn't wired in: three audit categories (membership suspension, role reassignment, org-status change) have no underlying Server Action in this codebase at all yet — audited nothing because there's nothing to audit, not an oversight.

**Verified across all three milestones:** `npx tsc --noEmit`, `npm run lint`, `npx prisma validate`, `npx vitest run` (101/101 passing throughout, mocks updated where the new raw-query/audit call sites required it), and `npm run build` (full production build; 103 routes by the end, up from 101) all pass clean at every milestone boundary. Every migration applied against the real Neon database via the safe `migrate diff` → hand-write → `migrate deploy` workflow, never `migrate dev`.

**Honestly not verified — stated plainly, not glossed over:** this sandbox has no local Postgres, Docker, or GitHub Actions access. The entire real-database integration and concurrency test suite (17 files) was written carefully against the actual current service.ts signatures (not from memory) and is `tsc`-clean, but has never actually been executed by me — it needs a real disposable Postgres (locally or in CI) to confirm it passes for real. The CI workflow itself has still never run on GitHub's infrastructure.

**Build result:** Passed at every milestone — `npm run test` 101/101 across 10 files (unchanged all pass), 103 routes, `vercel --prod` confirmed `READY` after each of the three milestone commits.

**Known issues at the time:** the two honestly-unverified items above; `createAccount()`'s deposit-receipt and `applyCreditToAccount()`'s receipt-number generation retain the older racy pattern (lower-frequency hot paths, deliberately deferred); `DIRECT_URL` still not set in Vercel Production (flagged separately, unrelated to Pass 4, migration-only impact); all previously carried-forward gaps from earlier passes.

**Next recommended step (at the time):** Milestone D (observability, performance, resilience/accessibility, branch-access design doc) per the original Pass 4 specification, or confirming the real-database test suite against an actual disposable Postgres first to close the "written but never executed" gap before adding more untested surface.

---

## Files changed (Hardening Pass 3c — remaining IDOR audit, full Zod rollout, Decimal hygiene, reproducible seeding/CI)

**Created:** `.env.example`; `.nvmrc`; `.github/workflows/ci.yml`; `prisma/seed.ts`; `test/pass3c-installment-pos-decimal.test.ts` (15 tests).

**Modified:** `package.json` (`engines.node`, `db:seed` script, `prisma.seed` config, `tsx` devDependency); `README.md`, `docs/ARCHITECTURE.md`, `docs/DATABASE_STRATEGY.md` (stale Phase-1-era sections replaced with current-state descriptions); every remaining mutating Server Action file across Accounting (`journal`/`expenses`/`invoices`/`settings`/`accounts`), Payroll (`settings`/`runs`/`compensation`), Procurement (`requests`/`orders`/`settings`/`vendors`), POS (`sell`/`sales`/`settings`/`registers`), Inventory (`settings`/`movements`/`warehouses`/`items`), Projects (`tasks`/`milestones`/`projects`), Fleet (`payments`/`drivers`/`owners`), Installment (`payments`/`customers`/`accounts`/`products`), `src/app/app/platform/actions.ts`, `src/app/app/(overview)/notifications/actions.ts`, plus their `page.tsx` error maps; `src/lib/tenant/actions.ts`/`src/lib/auth/actions.ts` (validation added to the previously-untouched exports only); `src/modules/installment/service.ts` (`recordStaffSalaryPayment`/`adjustStaffInventory`/`updateInstallmentSettings` validation, new `InvalidSettingsError`; Decimal-precision conversion of `createAccount`/`recordPayment`/`applyCreditToAccount`/closure-refund/reactivation/`computeProductPrice`); `src/modules/pos/service.ts` (`validateWarehouseRef()` helper, `createRegister`/`updateRegister` warehouse IDOR fix); `src/modules/payroll/service.ts` (Decimal-precision conversion of `processRun()`'s payslip computation); `src/modules/accounting/service.ts` (Decimal-precision conversion of `postJournalEntry()`'s balance check, `computeBalance()`, `recordInvoicePayment()`).

**Migration impact:** none this pass — every fix is query/validation/arithmetic-library logic, no schema changes.

## Summary of what was done (Hardening Pass 3c)

Triggered by "finish the rest" after Pass 3b's review checkpoint — an explicit instruction to complete every item Pass 3b's "Remaining work" section had listed as deliberately deferred, rather than continuing the pass-by-pass checkpoint discipline used through Pass 3b.

**Remaining IDOR audit**: line-by-line pass over the rest of `src/modules/installment/service.ts` (the largest service file in the codebase) beyond the two functions Pass 2 covered, finding real gaps in `recordStaffSalaryPayment()` (unchecked `staffId`) and `adjustStaffInventory()` (unchecked `staffId`/`productId` — an exported function with zero current callers, fixed anyway for defense-in-depth), plus a complete absence of bounds-checking in `updateInstallmentSettings()` on percentage/money fields that feed directly into admin-fee/refund/commission math. POS's `createRegister()`/`updateRegister()` gained the same warehouse-ownership check every other module's foreign-id references already had.

**Zod validation — full rollout**: parallelized across four background agents by module group (Accounting+Payroll; Procurement+POS; Inventory+Projects+misc settings; Fleet-remainder+Platform+Notifications+tenant+auth), each following the exact pattern established in Pass 3b's CRM/HR/Fleet work, converting every remaining file's ad-hoc `String()`/`parseInt()`/`parseFloat()` parsing to the shared `src/lib/validation.ts` schemas. Installment's own remaining action files (`payments`/`customers`/`accounts`/`products`) and `pos/registers/actions.ts` were done directly rather than delegated, to keep them alongside the Decimal-precision work touching the same service files. Every one of the ~45 files ended up validated; no service.ts business logic was touched by this workstream.

**Decimal-precision hygiene — bounded, not a blanket rewrite**: rather than converting all ~80 `Number(...)` call sites across Accounting/Payroll/Installment (many are read-only reporting aggregations recomputed fresh each request, with no compounding risk), this pass specifically converted the sites where a float-computed value gets written to the database or decides a core business invariant. This included removing two `0.005`-epsilon fudge-factors in Accounting (the journal debit=credit check and the invoice fully-paid check) that existed specifically to route around float rounding error — `Prisma.Decimal` comparison needs no epsilon. See `docs/HARDENING_PLAN.md`'s Pass 3c section for the full list of converted sites and the explicit reasoning for what was deliberately left as `Number`.

**Reproducible seeding/CI**: `.env.example` (every required env var documented with placeholders), `.nvmrc`/`engines.node` (Node version pin), a committed idempotent `prisma/seed.ts` (permissions/roles/modules bootstrap — verified via two real runs against the live database confirming identical output), and `.github/workflows/ci.yml` (lint → typecheck → `prisma validate` → test → build). Also fixed three stale Phase-1-era documentation files (`README.md`, `docs/ARCHITECTURE.md`, `docs/DATABASE_STRATEGY.md`) that still described a UI-only shell with no Prisma/auth/database usage — these were explicitly named in the original audit's "Documentation and public-site accuracy" findings.

**Verified**: 15 new Vitest tests covering the new Installment/POS validation and, notably, the Decimal-precision fixes specifically (a repeated-`0.1`-addition journal entry that JS float summation would get wrong, a repeating-decimal admin-fee-rate account creation, a non-clean tax-rate payroll run) — 101 total across 10 files. Full validation suite run clean: `npx tsc --noEmit`, `npm run lint`, `npx prisma validate`, `npx vitest run` (101/101), `npm run build` (101 routes, all passing).

**Build result:** Passed — `npm run test` 101/101 passing across 10 files, 101 routes (unchanged), full production build succeeds.

**Known issues (current)**:
- Documented residual concurrency races from Pass 2 remain (row-level locking or serializable isolation would be needed to fully close them — judged disproportionate).
- Installment's `updatePayment()`/`applyCreditToAccount()` retain the narrower read-then-write race class (Pass 3c improved `applyCreditToAccount()`'s arithmetic precision, not its concurrency behavior).
- `.github/workflows/ci.yml` has never executed against a real GitHub Actions run (this environment can't trigger one) — worth confirming on the next real push.
- Automated tests remain mocked-`db`, not integration tests against a real database transaction under actual concurrent load.
- No rate limiting on invite creation itself; `src/app/app/(overview)/modules/page.tsx` still uses `enabledModuleKeys` instead of `accessibleModuleKeys`; audit logging, performance, and accessibility all remain deferred — none blocking correctness/safety.

**Next recommended step:** Get explicit direction on Pass 4+ scope. Candidates per `docs/HARDENING_PLAN.md`: closing the documented residual concurrency races with real row-level locking (would need a design discussion — raw SQL `FOR UPDATE` vs. serializable transactions, since this codebase has avoided raw SQL so far), or moving on from the hardening track entirely toward Billing/Subscriptions requirements-gathering, which remains an explicit "not yet defined" placeholder.

---

## Files changed (Hardening Pass 2 — Financial/inventory transaction integrity)

**Created:** `test/pass2-financial-inventory-integrity.test.ts` (18 tests covering every fix below).

**Modified:** `src/modules/inventory/service.ts` (atomic guarded increment/decrement, warehouse tenant checks, quantity validation, optional shared `tx`, new `NotFoundError`); `src/modules/pos/service.ts` (`openSession` register IDOR fix, `createSale`/`refundSale` full-transaction atomicity, new `InvalidSaleInputError`); `src/app/app/pos/{sell,sales,registers}/actions.ts` + their `page.tsx` error maps; `src/modules/procurement/service.ts` (`createOrder`/`createRequest` vendor/request/item IDOR fixes, `receiveOrderLine` full-transaction atomicity with a guarded `receivedQuantity` increment, atomic claims on `approveRequest`/`rejectRequest`/`sendOrder`/`cancelOrder`, new `NotFoundError`); `src/app/app/procurement/{orders,requests}/actions.ts` + their `page.tsx` error maps; `src/modules/accounting/service.ts` (`postJournalEntry` account-ownership check — the central fix closing the manual-journal IDOR for every caller, atomic claims on `markInvoiceSent`/`payExpense`/`approveExpense`/`rejectExpense`, `recordInvoicePayment` atomic increment + amount validation, `voidInvoice` reversal posting, new `NotFoundError`/`InvalidPaymentError`); `src/app/app/accounting/{invoices,expenses,journal}/actions.ts` + their `page.tsx` error maps; `src/modules/payroll/service.ts` (`processRun`/`cancelRun` atomic claims, `setCompensation`/`updateSettings` validation, new `InvalidCompensationError`); `src/app/app/payroll/{compensation,runs,settings}/actions.ts` + their `page.tsx` error maps; `src/modules/installment/service.ts` (`recordPayment` atomic multi-field increment/decrement + amount validation, `createAccount`/`updateCustomer` IDOR fixes, `refreshAccountLifecycleStatuses` atomic closure-refund claim, new `NotFoundError`/`InvalidPaymentAmountError`); `src/app/app/installment/{accounts,customers,payments}/actions.ts` + their `page.tsx` error maps.

**Migration impact:** none — every Pass 2 fix is query/transaction-shape logic, no schema changes.

## Summary of what was done (Hardening Pass 2)

Continuation of the same 2026-07-20 audit-driven hardening track, per explicit "go ahead" to proceed into Pass 2 after Pass 1's review checkpoint. Covers the financial/inventory transaction-integrity rework flagged across POS, Inventory, Procurement, Accounting, and Payroll, plus Installment's core payment-recording path, along with every IDOR path the audit noted as entangled with that same code (fixing the IDOR alone without the atomicity work would have been incomplete, since both live in the same functions).

**Two recurring fixes, applied consistently across all six modules**: (1) a **guarded atomic `updateMany`** replacing every "read status, check it in JS, write a new absolute value" state transition — so a second, near-simultaneous request's `count: 0` result rejects it instead of silently double-processing (closes: double invoice-sends, double expense-payments, duplicate payroll-run processing, duplicate POS refunds, duplicate procurement receiving, duplicate installment closure-refund credits); (2) atomic `increment`/`decrement` replacing every "read a total, add to it in JS, write the new absolute total back" — so concurrent writes to the same running total (stock quantity, `amountPaid`, installment `balance`/`totalPaid`) can never lose one writer's contribution.

**Also fixed**: Accounting's `voidInvoice()` now posts a real reversing journal entry instead of only flipping status (previously permanently overstated revenue/AR for a voided-but-previously-sent invoice); several confirmed IDOR gaps where a foreign organization's id could be attached to a new record (Procurement's vendor/request/item on order/request creation, Installment's customer/staff on account creation — the staff one was a real cross-tenant **write**, since it would have consumed another organization's staff-inventory unit); input validation that was previously entirely absent (POS line quantity/price, Payroll salary/tax-rate, Accounting/Installment payment amounts).

**Deliberately not attempted this pass** (documented in `docs/HARDENING_PLAN.md` as Pass 3): full `Decimal`-precision arithmetic (the codebase still converts to JS `Number` throughout), a handful of narrower residual concurrency races that don't corrupt the primary financial figure but could affect a derived status/clamp field under precise three-way interleaving (documented per-instance in the plan), Installment's `updatePayment()`/`applyCreditToAccount()` (same race class, narrower blast radius), and a full line-by-line IDOR audit of CRM/HR/Fleet.

**Build result at the time:** Passed — `npm run test` 45/45 passing across 5 files, 101 routes (unchanged).

**Known issues at the time:** Pass 3 (invitation redesign, Zod validation, CRM/HR/Fleet IDOR audit, Decimal-precision hygiene, reproducible seeding/CI) not started (invitation redesign since resolved — see Pass 3a above), plus documented narrow residual concurrency races (still current, see `docs/HARDENING_PLAN.md`) and all previously carried-forward gaps.

**Next recommended step (at the time):** Get explicit direction before starting Pass 3, per the same review-checkpoint discipline used between Pass 1 and Pass 2. The user replied "ok, go ahead," leading directly into the Pass 3a work above.

---

## Files changed (Hardening Pass 1 — Tenant guard, session revocation, dashboard leak, top IDOR paths)

**Created:** `docs/HARDENING_PLAN.md` (full audit-derived remediation plan, all passes); `prisma/migrations/20260721000000_add_user_session_version/migration.sql`; `src/lib/auth/session-revocation.ts`; `vitest.config.ts`; `test/stubs/server-only.ts`; `test/tenant-guard.test.ts`; `test/dashboard-permission-leak.test.ts`; `test/session-revocation.test.ts`; `test/idor-projects-payroll-administration.test.ts`.

**Modified:** `prisma/schema.prisma` (`User.sessionVersion`); `src/lib/tenant/index.ts` (central guard + `accessibleModuleKeys`); `src/lib/tenant/actions.ts` (`switchOrganization` status validation); `src/app/app/layout.tsx` (redirect to `/login` on a revoked/id-less session, not just a fully-missing one); `src/lib/auth/nextauth.ts` (session revalidation in `jwt()`); `src/lib/auth/next-auth.d.ts` (`sessionVersion` typing); `src/lib/auth/actions.ts` (`resetPassword`/`acceptInvite` bump `sessionVersion`); `src/app/app/(overview)/dashboard/page.tsx` (filters on `accessibleModuleKeys`); all 11 module `layout.tsx` files + `src/app/app/(overview)/layout.tsx` (pass `accessibleModuleKeys` to `AppShell`); `src/app/app/(overview)/administration/actions.ts` (`inviteMember` role lookup scoped to org/system roles); `src/modules/projects/service.ts` (`addProjectMember`/`removeProjectMember`/`createMilestone`/`createTask` organization-scoped, new `NotFoundError`); `src/app/app/projects/{projects,milestones,tasks}/actions.ts` + their `page.tsx` error maps (updated signatures, `not-found` handling); `src/modules/payroll/service.ts` (`setCompensation` organization-scoped, new `NotFoundError`); `src/app/app/payroll/compensation/actions.ts` + `page.tsx` (`not-found` handling); `src/app/app/platform/subscriptions/page.tsx` (relabeled "Planned — requirements not yet defined"); `package.json` (`test` script, `vitest` devDependency).

## Summary of what was done (Hardening Pass 1)

Triggered by a pasted 2026-07-20 full-project audit that classified the platform as a "feature-rich internal beta" — safe for controlled/internal use, not for external multi-tenant onboarding or real financial operations, pending several confirmed blockers. Every audit claim was independently re-verified against the live codebase (not trusted blindly) before being acted on; `docs/HARDENING_PLAN.md` records the full plan, including what's deferred to Pass 2 and why.

**Central active-tenant guard**: `getCurrentTenant()` previously loaded `OrganizationMember` rows filtered only on `userId` — an `INVITED`/`SUSPENDED`/`REMOVED` membership, or a `SUSPENDED`/`CANCELLED` organization, was fully authorized, and the implicit fallback chain (`cookie → session.user.organizationId → allMemberships[0]`) could silently land on any of them. Now filters to `ACTIVE` memberships in `ACTIVE`/`TRIAL` organizations *before* any selection logic runs, so an invalid membership can never be selected, explicitly or implicitly. `switchOrganization()` got the identical fix.

**Session revocation**: sessions are NextAuth v4 JWTs with up to a 30-day lifetime; nothing previously re-checked `User.status` after sign-in. Added `User.sessionVersion`, embedded in the token at login, re-validated against the database on every subsequent request inside `jwt()` — a mismatch or a non-`ACTIVE` user clears the session immediately rather than at next natural expiry. Wired into `resetPassword()` and `acceptInvite()` (the two flows that exist today and change credentials); membership/organization-level suspension is already covered by the tenant guard re-reading the database every request, independent of the JWT.

**Dashboard/module-launcher permission leak**: the organization dashboard filtered which modules to render using only org-level enablement, never the current user's permissions — every dashboard widget fetches and renders real summary data (cash balance, payroll totals, etc.) with no permission check of its own, trusting the page to have already gated it. Added `TenantContext.accessibleModuleKeys` (enabled **and** permitted) and switched the dashboard and all twelve `AppShell` call sites to filter on it instead of `enabledModuleKeys`.

**Confirmed highest-risk IDOR paths** (the subset that doesn't require the broader financial/inventory atomicity rework, which is Pass 2): Administration's `inviteMember()` resolved a submitted `roleId` with no organization check (a foreign organization's custom role could be attached to a new membership); Projects' `addProjectMember`/`removeProjectMember`/`createMilestone`/`createTask` took bare ids with no organization validation; Payroll's `setCompensation()` upserted by a globally-unique `employeeId` with no organization check, meaning a foreign organization's compensation row could be silently overwritten. All four now resolve every foreign id through an organization-scoped lookup and throw a generic not-found error (never revealing whether the foreign record exists) on failure.

**First committed automated test suite**: `docs/TESTING_STRATEGY.md` previously stated no Jest/Vitest/committed Playwright suite existed. Added Vitest (permanent devDependency, not a temporary tool) with 27 tests across 4 files covering every fix above — mocking `@/lib/db` rather than touching the real Neon database.

**Build result at the time:** Passed — `npm run test` 27/27 passing across 4 files, 101 routes (unchanged). `vercel --prod` confirmed `READY`.

**Known issues at the time:** Pass 2 (financial/inventory atomicity + its overlapping IDOR paths) not started (still current at the time), invitation redesign not started (still current), no formal Zod validation (still current), plus all previously carried-forward gaps.

**Next recommended step (at the time):** Get explicit direction before starting Pass 2 given its size. The user replied "go ahead," leading directly into the Pass 2 work above.

---

## Files changed (Phase 16 — Projects)

**Created:** `prisma/migrations/20260720280000_add_projects_module/migration.sql`; `src/modules/projects/{service.ts,navigation.tsx,dashboard-widget.tsx}`; `src/app/app/projects/layout.tsx`, `src/app/app/projects/page.tsx`, and five route trees (`projects`, `tasks`, `milestones` each with `page.tsx` + `actions.ts`; `reports` and `settings` are read-only, `page.tsx` only).

**Modified:** `prisma/schema.prisma` (Projects models — `Project`, `ProjectMember`, `ProjectMilestone`, `ProjectTask` — and back-relations on `User`/`Organization`/`Branch`); `src/lib/auth/permissions.ts` (6 new `PROJECTS_*` keys); `src/platform/modules/registry.ts` (`projects` flipped from `coming-soon` to `available` — the last module from the original `docs/PRODUCT_VISION.md` list); `src/platform/modules/dashboard-widgets.tsx` (Projects widget registered).

**Database (via a one-off script, not committed):** seeded 6 `Permission` rows for `projects.*`, granted them to Super Admin/Organization Owner, created the "Projects Manager" system role, enabled the `projects` module for the demo organization (`Rock Frost Demo Fleet`, tenant code `rock-frost-demo-fleet`).

## Summary of what was done (Phase 16 — Projects)

Built after POS, following the user's "ok do the next" instruction — the last module remaining from the original `docs/PRODUCT_VISION.md` list. Designed four models from scratch: `Project`, `ProjectMember` (many-to-many join to `User` with an optional free-text `role`), `ProjectMilestone`, and `ProjectTask`. No cross-module service calls were needed or added — Projects is self-contained.

Two real guard-rail state transitions, matching the "genuine validation logic, not just CRUD" precedent set by HR's rating-required-before-review-completion: `completeMilestone()` throws `MilestoneStateError` if any task under it isn't `DONE`; `completeProject()` throws `ProjectStateError` if any milestone on it isn't `COMPLETED`. Both surface as an `?error=not-ready` redirect on their respective list pages.

**Verified end-to-end via Playwright**: created a project, added a member, created a milestone with two tasks under it, confirmed the milestone-completion guard correctly rejected completion while a task was still open, progressed both tasks through `TODO → IN_PROGRESS → IN_REVIEW → DONE`, confirmed the milestone then completed successfully, and confirmed the project itself completed successfully once its only milestone was `COMPLETED`. Reports and Overview pages both reflected the resulting state correctly. All four test projects created during this and earlier failed verification attempts (`PRJ-0001` through `PRJ-0004`, all named `QA Project <timestamp>`) were deleted afterward via a one-off cleanup script (cascading to their members/milestones/tasks).

**Build result at the time:** Passed — 101 routes total (95 before Phase 16; 101 after Projects's 6 new routes). Deployment confirmed `READY` via `vercel --prod`.

**Known issues at the time:** Projects' lack of data-level scoping and Accounting/HR/Payroll linkage (still current), plus every previously carried-forward gap (POS/Analytics/Procurement/Payroll/Accounting/HR/Inventory/CRM scoping and integration gaps, Fleet portal/uploads, no fuzzy duplicate-detection, no branch enforcement, no public self-registration, unset `RESEND_API_KEY`, inert organization switcher). Superseded by the audit-driven "Known issues / deliberate gaps (current)" section above, which reorganizes around the hardening-pass structure rather than per-module gaps.

**Next recommended step (at the time):** With Projects complete, every module from the original `docs/PRODUCT_VISION.md` list — plus POS, added by explicit request — was built. The user then pasted a full-project audit and requested a dedicated production-hardening pass rather than continuing with Billing/Subscriptions, leading directly into Hardening Pass 1 above.

---

## Files changed (Phase 14 — Analytics + Phase 15 — POS)

**Analytics — Created:** no migration (owns no tables); `src/modules/analytics/{service.ts,navigation.tsx}`; `src/app/app/analytics/layout.tsx`, `src/app/app/analytics/page.tsx`, and five route trees (`financial`, `sales`, `operations`, `people`, `settings`), all read-only (`page.tsx` only, no `actions.ts`).

**POS — Created:** `prisma/migrations/20260720260000_add_pos_module/migration.sql`; `src/modules/pos/{service.ts,navigation.tsx,dashboard-widget.tsx}`; `src/app/app/pos/layout.tsx`, `src/app/app/pos/page.tsx`, and five route trees (`registers`, `sell`, `sales`, `settings` each with `page.tsx` + `actions.ts`; `reports` is read-only, `page.tsx` only).

**Modified:** `prisma/schema.prisma` (POS models and back-relations on `User`/`Organization`/`Branch`/`InventoryWarehouse`/`InventoryItem`); `src/lib/auth/permissions.ts` (6 new `ANALYTICS_*` + 6 new `POS_*` keys); `src/platform/modules/registry.ts` (`analytics` flipped from `coming-soon` to `available`; new `pos` entry added from scratch — POS was not in the original `docs/PRODUCT_VISION.md` module list); `src/platform/modules/dashboard-widgets.tsx` (POS widget registered; Analytics deliberately has none); `src/app/app/(overview)/reports/page.tsx` (rewritten to point at the new Analytics module instead of claiming cross-module reporting isn't built); `docs/DECISIONS.md` (new entry documenting the POS→Inventory integration).

**Database (via one-off scripts, not committed):** seeded 6 `Permission` rows each for `analytics.*` and `pos.*`, granted them to Super Admin/Organization Owner, created the "Analytics Manager" and "POS Cashier" system roles, enabled both modules for the demo organization (`Rock Frost Demo Fleet`, tenant code `rock-frost-demo-fleet`).

## Summary of what was done (Phase 14 — Analytics)

User asked to finish with Analytics, then add POS. Analytics is structurally different from every prior module: it owns no database tables, so no migration was written. `src/modules/analytics/service.ts` calls every other enabled module's own summary function (`getAccountingSummary`, `getPayrollSummary`, `getCrmSummary`, `getInstallmentSummary`, `getFleetSummary`, `getInventorySummary`, `getProcurementSummary`, `getHrSummary`) and combines the results, gating each call on the organization's actual `enabledModuleKeys` so a disabled module is simply omitted rather than erroring. Also rewrote the pre-existing organization-scope `/app/reports` placeholder (which had claimed "cross-module reporting is not built yet" since Phase 1) to point users to the new Analytics module.

**Verified against real current data**, not synthetic test fixtures: every figure on every Analytics page (Financial, Sales & CRM, Operations, People, and the Overview) was cross-checked against each source module's own Reports page and matched exactly — since Analytics has no create actions, there was nothing to clean up afterward.

## Summary of what was done (Phase 15 — POS)

Built immediately after Analytics per the same instruction. POS was not part of the original module list in `docs/PRODUCT_VISION.md` — added as a brand-new registry entry at the user's explicit request. Designed a register → session → sale lifecycle: a register optionally links to an `InventoryWarehouse`; only one session can be open on a register at a time; a sale can only be recorded against a currently-open session (`SaleStateError` otherwise).

**Deliberate real cross-module integration** (documented in `docs/DECISIONS.md`, the same pattern as Procurement's receiving flow): completing a sale with a line linked to a real `InventoryItem`, on a register with a linked warehouse, calls Inventory's own `recordMovement()` with `type: "ISSUE"`; refunding that sale reverses it with `type: "RECEIPT"`. Stock availability for every line is checked up front via `getStockGrid()` before any movement is posted.

**Verified with real stock arithmetic**: created a warehouse and item with 20 units on hand, opened a register session, sold 3 units (confirmed stock dropped to exactly 17 on Inventory's own Stock page), refunded the sale (confirmed stock returned to exactly 20), and confirmed the Reports page correctly excluded the refunded sale from the completed-sales totals while counting it separately under refunds. All test fixtures — including the Inventory warehouse/item created solely for this test — deleted afterward.

**Build result at the time:** Passed — 95 routes total (83 before Phase 14; 89 after Analytics's 6 new routes; 95 after POS's 6 new routes). Both deployments confirmed `READY` via `vercel --prod`.

**Known issues at the time:** POS's/Analytics's lack of data-level scoping and Accounting linkage (still current), POS sales limited to three fixed UI line slots (still current), POS's theoretical stock-availability race window (still current), plus all previously carried-forward gaps.

**Next recommended step (at the time):** Get explicit direction on what came after POS — the only remaining candidate from the original `docs/PRODUCT_VISION.md` list was Projects. The user also asked, separately, whether a full ERP system or a cloud-hosting change was warranted — answered inline in conversation (short version: this platform already functions as a modular ERP once Projects ships; the current Vercel + Neon stack scales fine for growth, the main levers being plan tier and Postgres connection pooling, not a re-architecture). The user then said "ok do the next," leading directly into the Phase 16 work above.

---

## Summary of what was done (Phase 12 — Procurement)

User asked to build Procurement and Payroll after HR ("lets proceed with with procurement and payroll"). Designed a request→order→receive flow with a genuine cross-module integration: receiving an order line linked to a real `InventoryItem` calls Inventory's own `recordMovement()` to post an actual stock `RECEIPT` (documented in `docs/DECISIONS.md`). An order's status is derived from its lines' received-vs-ordered quantities on every receipt; approving a request and creating an order that references it auto-converts the request.

## Summary of what was done (Phase 13 — Payroll)

Built immediately after Procurement. `PayrollCompensation` references `HrEmployee` by id rather than modifying `HrEmployee` itself. `processRun()` computes gross/tax/net for every eligible employee and completes the run inside one transaction. Deliberately not integrated with Accounting in this pass.

**Build result at the time:** Passed — 83 routes total (71 before Phase 12; 77 after Procurement; 83 after Payroll). Both deployments confirmed `READY` via `vercel --prod`.

**Known issues at the time:** Procurement's/Payroll's lack of data-level scoping (still current), neither yet linked to Accounting (still current), Procurement orders single-line only in the UI (still current), plus all previously carried-forward gaps.

**Next recommended step (at the time):** Get explicit direction on what followed Payroll — candidates were Projects or Analytics. The user asked to finish with Analytics then add POS, leading directly into the Phase 14/15 work above.

---

## Files changed (Phase 10 — Accounting + Phase 11 — HR)

**Accounting — Created:** `prisma/migrations/20260720180000_add_accounting_module/migration.sql`; `src/modules/accounting/{service.ts,navigation.tsx,dashboard-widget.tsx}`; `src/app/app/accounting/layout.tsx`, `src/app/app/accounting/page.tsx`, and six route trees (`accounts`, `invoices`, `expenses`, `journal`, `reports`, `settings`), each with `page.tsx` + `actions.ts`.

**HR — Created:** `prisma/migrations/20260720200000_add_hr_module/migration.sql`; `src/modules/hr/{service.ts,navigation.tsx,dashboard-widget.tsx}`; `src/app/app/hr/layout.tsx`, `src/app/app/hr/page.tsx`, and five route trees (`employees`, `leave`, `reviews`, `settings` each with `page.tsx` + `actions.ts`; `reports` is read-only, `page.tsx` only).

**Modified:** `prisma/schema.prisma` (Accounting + HR models and back-relations on `User`/`Organization`/`Branch`); `src/lib/auth/permissions.ts` (6 new `ACCOUNTING_*` + 6 new `HR_*` keys); `src/platform/modules/registry.ts` (`accounting` and `hr` both flipped from `coming-soon` to `available`); `src/platform/modules/dashboard-widgets.tsx` (both widgets registered); `package.json` (`postinstall` script added — see architecture note above).

**Database (via one-off scripts, not committed):** seeded 6 `Permission` rows each for `accounting.*` and `hr.*`, granted them to Super Admin/Organization Owner, created the "Accounting Manager" and "HR Manager" system roles, enabled both modules for the demo organization (`Rock Frost Demo Fleet`, tenant code `rock-frost-demo-fleet`).

## Summary of what was done (Phase 10 — Accounting)

User asked to build Accounting and HR after Inventory, and to add a standing rule to always check Vercel deployment status after pushing (added above and to persistent memory). Immediately before this, a real Vercel build failure was reported and fixed: a stale generated Prisma Client (predating the CRM/Inventory schema) caused `Module has no exported member 'CrmActivityType'` on production — fixed with the `postinstall` script described above, verified by wiping the local generated client and confirming a fresh install+build succeeds, then confirmed on an actual `vercel --prod` deployment (`READY`).

For Accounting, designed a genuinely functioning minimal double-entry ledger rather than a UI over disconnected records: `AccountingAccount`/`AccountingJournalEntry`/`AccountingJournalLine` are the real source of truth for balances, and `AccountingInvoice`/`AccountingExpense` post journal entries at realistic lifecycle points (sent/paid) via a shared `postJournalEntry()` transaction helper, validated for balance. Five default accounts (Cash, AR, AP, Revenue, General Expenses) are created lazily per organization.

**Verified with real bookkeeping arithmetic**: created a custom expense account and a linked expense category, then ran invoice send (correctly posted AR 500.00 / Revenue 500.00) → invoice full payment (correctly posted Cash 500.00, zeroed AR) → expense approve → expense pay (correctly posted the custom account 200.00, reduced Cash to 300.00) → a manual balanced journal entry (Cash +50 / Revenue +50) — Reports page correctly computed revenue 550.00, expenses 200.00, net income 350.00, matching hand-calculated expectations exactly. All test fixtures deleted afterward.

## Summary of what was done (Phase 11 — HR)

Built immediately after Accounting per the same instruction. `HrEmployee` uses a self-relation for manager/reports (mirroring an org chart), with a status lifecycle (`ONBOARDING` → `ACTIVE` ⇄ `ON_LEAVE` → `TERMINATED`). Deliberately did not build a separate onboarding checklist/workflow — chose to treat onboarding as an employee status plus an "Activate" action, matching the project's own established precedent for not fabricating UI around a concept with nothing real behind it yet.

**Verified end-to-end**: created a manager employee and activated them, created a second employee reporting to that manager (confirming the manager select only offers ACTIVE/ON_LEAVE employees), cycled it through ACTIVE → ON_LEAVE → ACTIVE, submitted a 3-day leave request (confirmed `daysBetween()` computed exactly 3 for a 3-calendar-day inclusive range) and approved it, submitted and rejected a second request, created a review with no rating and confirmed the "Complete" action correctly refuses it (`error=incomplete`), then created a second review with a rating and confirmed "Complete" succeeds and shows COMPLETED with the rating. Reports page correctly aggregated headcount by department. All test fixtures deleted afterward.

**Build result at the time:** Passed. `npm run lint` clean, `npx tsc --noEmit` clean, `npx prisma validate` succeeds, `npm run build` succeeds — 71 routes total (58 before Phase 10; 65 after Accounting's 7 new routes; 71 after HR's 6 new routes). Accounting's deployment confirmed live via `vercel --prod` (`READY`) before starting HR.

**Known issues at the time:** Accounting's/HR's lack of data-level scoping (still current, see above), Accounting not yet linked to Fleet/Installment (still current), HR no attendance/timesheet tracking (still current), Inventory's/CRM's carried-forward gaps, owner-facing maintenance approval portal (Fleet), file/photo upload for maintenance requests (Fleet), fuzzy duplicate-detection on create, hard deletes for financial records, branch-level access enforcement, public self-registration, unset `RESEND_API_KEY`, inert organization switcher.

**Next recommended step (at the time):** Get explicit direction on which module followed HR — candidates were Procurement, Projects, or Analytics. The user asked for Procurement and Payroll together, leading directly into the Phase 12/13 work above.

---

## Files changed (Phase 9 — Inventory Management)

**Created:** `prisma/migrations/20260720160000_add_inventory_module/migration.sql`; `src/modules/inventory/{service.ts,navigation.tsx,dashboard-widget.tsx}`; `src/app/app/inventory/layout.tsx`, `src/app/app/inventory/page.tsx`, and six route trees (`items`, `warehouses`, `stock`, `movements`, `reports`, `settings`) — `stock` is read-only (no `actions.ts`), the other five each have `page.tsx` + `actions.ts`.

**Modified:** `prisma/schema.prisma` (Inventory models + back-relations on `User`/`Organization`/`Branch`); `src/lib/auth/permissions.ts` (6 new `INVENTORY_*` keys); `src/platform/modules/registry.ts` (`inventory` flipped from `coming-soon` to `available`); `src/platform/modules/dashboard-widgets.tsx` (Inventory widget registered).

**Database (via one-off scripts, not committed):** seeded 6 `Permission` rows for `inventory.*`, granted them to Super Admin/Organization Owner, created the "Inventory Manager" system role, enabled the `inventory` module for the demo organization (`Rock Frost Demo Fleet`, tenant code `rock-frost-demo-fleet` — note this is *not* `demo`, worth remembering if a future script needs to target it directly).

## Summary of what was done (Phase 9 — Inventory Management)

User chose "Inventory" as the next module after CRM (via an AskUserQuestion offering Inventory / Accounting / HR-Payroll). Like CRM, no inventory-shaped models existed in the schema (Installment's `HirePurchaseStaffInventory` is a narrow per-staff-member unit counter, not a general warehouse/stock system, so it wasn't reused). Designed five new models from scratch — `InventoryCategory`, `InventoryWarehouse`, `InventoryItem`, `InventoryStock` (a per item×warehouse quantity row), and `InventoryMovement` (an audit-trail row for every receipt/issue/adjustment/transfer) — migrated via the established safe `migrate diff` + manual migration folder + `migrate deploy` workflow (confirmed purely additive).

The one function with real logic, `recordMovement()`, runs the stock-quantity update and the audit-trail row inside a single `db.$transaction`: `RECEIPT` adds to one warehouse, `ISSUE` subtracts (rejecting if insufficient), `ADJUSTMENT` applies a signed delta (rejecting if it would go negative), and `TRANSFER` subtracts from a source warehouse and adds to a distinct destination warehouse in the same transaction (rejecting insufficient stock or a same-warehouse transfer). Built all six pages (Items, Warehouses, Stock, Movements, Reports, Settings) plus an overview page and dashboard widget, following the exact pattern established by Fleet/Installment/CRM. Every action file was written with the `revalidatePath()`-before-`redirect()` pattern from the start — no repeat of Phase 8's discovery needed.

**Verified with real arithmetic, not just "no error thrown"**: created a test item (cost price 10.50, reorder point 5) and two warehouses, then ran a full receipt → transfer → issue → adjustment sequence via Playwright, confirming exact quantities at every step — 20 received into Warehouse A, correctly 12/8 after an 8-unit transfer to Warehouse B, correctly 5 in B after a 3-unit issue, correctly 10 in A after a −2 adjustment — and confirmed a subsequent over-large issue (999 units) was rejected with `error=insufficient-stock` and left stock unchanged. Reports page correctly computed total stock value as 157.50 (15 total units × 10.50) and correctly showed zero low-stock items (15 > reorder point of 5). All test fixtures (item, both warehouses, two lead — categories) deleted afterward via a one-off cleanup script.

**Build result at the time:** Passed. `npm run lint` clean, `npx tsc --noEmit` clean, `npx prisma validate` succeeds, `npm run build` succeeds — 58 routes (up from 51; 7 new Inventory routes).

**Known issues at the time:** Inventory's lack of data-level scoping and cross-module linkage (both still current, see above), CRM's lack of data-level scoping (still current), owner-facing maintenance approval portal (Fleet), file/photo upload for maintenance requests (Fleet), fuzzy duplicate-detection on create, hard deletes for financial records, branch-level access enforcement, public self-registration, unset `RESEND_API_KEY`, inert organization switcher.

**Next recommended step (at the time):** Get explicit direction on which module followed Inventory — candidates were Accounting, HR/Payroll, Procurement, Projects, or Analytics. The user asked for Accounting and HR (HRM) together, plus the standing deployment-check rule now in the "Mandatory instructions" section, leading directly into the Phase 10/11 work above.

---

## Files changed (Phase 8 + revalidatePath fix)

**Created:** `prisma/migrations/20260720140000_add_crm_module/migration.sql`; `src/modules/crm/{service.ts,navigation.tsx,dashboard-widget.tsx}`; `src/app/app/crm/layout.tsx`, `src/app/app/crm/page.tsx`, and six route trees (`contacts`, `leads`, `deals`, `activities`, `reports`, `settings`), each with `page.tsx` + `actions.ts`.

**Modified:** `prisma/schema.prisma` (CRM models + back-relations on `User`/`Organization`/`Branch`); `src/lib/auth/permissions.ts` (6 new `CRM_*` keys); `src/platform/modules/registry.ts` (`crm` flipped from `coming-soon` to `available`); `src/platform/modules/dashboard-widgets.tsx` (CRM widget registered); all 18 mutating action files across Fleet (`vehicles`, `owners`, `drivers`, `maintenance`, `insurance-roadworthy`, `payments`, `work-and-pay`), Installment (`customers`, `products`, `staff`, `accounts`, `payments`, `settings`), and CRM (`contacts`, `leads`, `deals`, `activities`, `settings`) — each gained a `revalidatePath()` call before every `redirect()` to a list page.

**Database (via one-off scripts, not committed):** seeded 6 `Permission` rows for `crm.*`, granted them to Super Admin/Organization Owner, created the "CRM Manager" system role, enabled the `crm` module for the demo organization.

## Files changed (post-Phase-7 gap-fixing pass)

**Created:**
- `prisma/migrations/20260720120000_add_login_lockout/migration.sql` — adds the two `User` columns above.
- `src/lib/auth/verify-password.ts` — `verifyCurrentPassword()`, step-up re-authentication helper (bcrypt-compares a re-entered password against the acting user's own hash).

**Modified:**
- `src/lib/auth/nextauth.ts` — `authorize()` checks `lockedUntil`, increments `failedLoginAttempts` on a wrong password, locks for 15 minutes after 5 failures, resets both on success.
- `src/lib/auth/actions.ts` — added `getAccountLockStatus(email)`, a pre-check the login page calls *before* `signIn()` (see the NextAuth gotcha below).
- `src/app/(auth)/login/page.tsx` — calls the pre-check first; shows "Too many failed attempts" only when it reports locked, otherwise the existing generic invalid-credentials message.
- `src/modules/installment/service.ts` — `getStaffPerformanceReport` now computes `commissionEarned` (from `commissionEnabled`/`commissionPercentage`) and folds it into `netPosition`; `createAccount` now applies `administrationFeePercent` as a one-time fee added to `targetAmount` and enforces `minimumDeposit` via an optional `initialDeposit` (recorded as a real first payment in the same transaction); `getInstallmentSummary` now returns `nextPayrollDate`/`daysUntilPayroll` from `payrollDay`; added `applyCreditToAccount()` (new — GLV has no reference implementation for this) and `MinimumDepositError`/`CreditNotApplicableError`.
- `src/app/app/installment/{products,staff,accounts,payments,reports,settings}/page.tsx` and their `actions.ts` — wired the above into the UI; Settings dropped its "reserved for future use" section since every field is now either wired to a calculation or a genuine UI default (`defaultDailyCollection` was the last one, wired as the new-product daily-amount default). Credit refund/void and account reactivation now go through a password-confirmation `EntityDialog` instead of a single click.

## Summary of what was done (Phase 8 + revalidatePath fix)

User chose "CRM" as the next module (per the previously-agreed "fix the gaps, when done get started with the next module, and lets have billing and subscription done last" instruction). Unlike Fleet/Installment, no CRM-shaped models existed in the schema — designed `CrmLeadSource`/`CrmContact`/`CrmLead`/`CrmDeal`/`CrmActivity` from scratch, migrated via the established safe `migrate diff` + manual migration folder + `migrate deploy` workflow (confirmed purely additive — no DROP statements). Built the full module: org-scoped service layer, six permission keys, a new "CRM Manager" system role, and all six pages (Contacts, Leads, Deals, Activities, Reports, Settings) plus an overview page and dashboard widget, following the exact pattern established by Fleet (Phase 6) and Installment (Phase 7).

**Major bug found during CRM's own browser verification, then found to be systemic**: moving a deal to the next pipeline stage correctly updated the database (confirmed via direct query) but the browser kept showing the pre-move stage after the action's `redirect()` landed on the same `?saved=1` URL a second time — a Next.js Router Cache staleness issue, not a server-side bug. Fixed by adding `revalidatePath()` before the `redirect()` in the affected CRM action. Then audited every other action file in the project (`grep -rL "revalidatePath"`) and found the exact same gap in **all 13 other mutating action files** across Fleet and Installment — meaning this bug had been present, silently, since Phase 6. Fixed all 18 total action files (7 Fleet + 6 Installment + 5 CRM), re-verified with a full Playwright pass: created a contact, created and converted a lead to a deal (confirming the new contact appeared correctly on the Contacts page too), moved the resulting deal through two pipeline stages in a row with a fresh page navigation after each move, logged an activity, and added a lead source — every step showed correct, non-stale data. All Playwright test-artifact records were deleted afterward via a one-off cleanup script.

**Build result at the time:** Passed. `npm run lint` clean, `npx tsc --noEmit` clean, `npx prisma validate` succeeds, `npm run build` succeeds — 51 routes (up from 44; 7 new CRM routes). Playwright installed temporarily for browser verification, then removed surgically. Dev server stopped afterward.

**Known issues at the time:** CRM's lack of data-level scoping (still current, see above), owner-facing maintenance approval portal (Fleet), file/photo upload for maintenance requests (Fleet), fuzzy duplicate-detection on create, hard deletes for financial records, branch-level access enforcement, public self-registration, unset `RESEND_API_KEY`, inert organization switcher — all still current except where superseded above (Inventory's own equivalent gaps are listed in the current "Known issues" section).

**Next recommended step (at the time):** Get explicit direction on which module followed CRM — candidates were Inventory, Accounting, HR/Payroll, Procurement, Projects, or Analytics. The user chose Inventory, leading directly into the Phase 9 work above.

## Summary of what was done (post-Phase-7 gap-fixing pass)

User said "fix the gaps, when done get started with the next module, and lets have billing and subscription done last" after the Phase 7 report.

**Scoped the "gaps" list deliberately rather than attempting literally everything flagged**: fixed the real security gap (login rate limiting — required the session's first schema change since Phase 3) and every Installment feature GLV's own settings fields implied should exist (commission, administration fee, minimum deposit, payroll-day visibility, credit application), plus GLV's step-up re-authentication pattern. Explicitly **not** attempted, and said so rather than silently dropping them: an owner-facing Fleet maintenance-approval portal (would require adding an entirely new authenticated user type — a much bigger initiative than a gap fix), file/photo upload for maintenance requests (needs a storage-provider decision first), fuzzy duplicate-detection on create, hard deletes for financial records, and branch-level access enforcement (still low-value with only one branch in the whole platform).

**Real bug found and fixed while verifying the rate-limiting feature**: NextAuth v4's credentials provider collapses every `authorize()` outcome — including a thrown `Error` with a custom message — to the fixed string `"CredentialsSignin"` (confirmed by reading `node_modules/next-auth/core/routes/callback.js` directly). The original implementation tried to smuggle a `"locked:15"` message through a thrown Error, which silently never reached the client — every failed attempt, locked or not, showed the same generic "Invalid email or password." Fixed by adding a separate pre-check (`getAccountLockStatus`) the login page calls *before* attempting `signIn()` at all, sidestepping NextAuth's fixed error contract entirely rather than fighting it. Re-verified end-to-end: 5 wrong passwords locks the account, and a **6th attempt using the correct password** is still correctly rejected with "Too many failed attempts. Try again in 15 minutes" — proving the lock check runs before password verification, not just after another failure.

**Commission/administration-fee/minimum-deposit verified with real arithmetic, not just "no error thrown"**: set a 10% administration fee and a 500 minimum deposit via Settings, then created a real account for an existing demo customer — a 3-Seater Sofa Set (base price 3680.00) correctly became a 4048.00 target amount (3680 × 1.10), and a 600 initial deposit correctly left a 3448.00 balance (4048 − 600). A second attempt with only a 100 deposit was correctly rejected before any account was created. Settings were reverted to 0/0 afterward and the test account removed, so the org's real configuration is unchanged from before this pass — the fee/deposit mechanism works, but isn't left "on" for the organization without their own decision to enable it.

**Field-staff scoping verified end-to-end for the first time** (flagged as unverified in the Phase 7 report): created a temporary field-staff test user with the "Hire Purchase Staff" role (not Manager) and a `HirePurchaseStaff` row linked via `userId`, assigned to one isolated test customer. Confirmed they saw *only* that one customer on `/app/installment/customers` (not the four real ones) and were correctly denied `/app/installment/reports` (the role has no `hirepurchase.reports.view`). All test fixtures (user, org membership, staff row, customer) were deleted afterward.

**Cleaned up the pre-existing test data flagged in the Phase 7 report**: deleted the 5 "Test Customer Playwright" and 1 "Debug Customer" records (and their cascade-deleted accounts/payments), restoring the staff-inventory units their fake accounts had consumed first so the demo org's stock levels stay accurate. The 4 legitimate demo customers were untouched.

**Verification:** full validation suite (lint, `tsc --noEmit`, `prisma validate`, `prisma migrate status`, `npm run build`) passes clean — still 44 routes (this pass changed logic inside existing routes, not the route tree). Playwright installed **temporarily** for all of the above, then removed surgically via `npm uninstall playwright` (confirmed via `git diff --stat package.json package-lock.json`, no output). Stopped this project's own dev-server processes afterward, confirmed by command-line inspection first.

**Build result at the time:** Passed. `npm run lint` clean, `npx tsc --noEmit` clean, `npx prisma validate` succeeds, `npx prisma migrate status` reports up to date, `npm run build` succeeds — 44 routes (unchanged from Phase 7).

**Known issues at the time:** owner-facing maintenance approval portal (Fleet), file/photo upload for maintenance requests (Fleet), fuzzy duplicate-detection on create, hard deletes for financial records, branch-level access enforcement, public self-registration, unset `RESEND_API_KEY`, inert organization switcher (single-org demo data), administration fee/minimum deposit set to 0 for the demo org — all still current except where superseded above (CRM's own equivalent gaps are listed in the current "Known issues" section).

**Next recommended step (at the time):** Get explicit direction on what came after this pass — candidates were billing/subscriptions or an additional module (CRM, Inventory, Accounting, HR, Payroll, Procurement, Projects, Analytics). The user chose CRM, leading directly into the Phase 8 work above.

---

## Handoff log

### 2026-07-21 — Claude Code — Hardening Pass 3b (Zod validation foundation, public contact form, CRM/HR/Fleet IDOR audit)

See "Files changed (Hardening Pass 3b...)," "Summary of what was done (Hardening Pass 3b)," "Build result (Hardening Pass 3b)," "Known issues / deliberate gaps (current)," and "Next recommended step" above — kept in the current-state sections rather than duplicated here, since this is the most recent entry. Full plan and Pass 3c+ scope in `docs/HARDENING_PLAN.md`.

### 2026-07-21 — Claude Code — Hardening Pass 3a (invitation redesign)

See "Files changed (Hardening Pass 3a...)" and "Summary of what was done (Hardening Pass 3a)" above, plus the "at the time" Build result/Known issues/Next recommended step notes appended.

### 2026-07-21 — Claude Code — Hardening Pass 2 (financial/inventory transaction integrity)

See "Files changed (Hardening Pass 2...)" and "Summary of what was done (Hardening Pass 2)" above, plus the "at the time" Build result/Known issues/Next recommended step notes appended.

### 2026-07-21 — Claude Code — Hardening Pass 1 (tenant guard, session revocation, dashboard leak, top IDOR paths)

See "Files changed (Hardening Pass 1...)" and "Summary of what was done (Hardening Pass 1)" above, plus the "at the time" Build result/Known issues/Next recommended step notes appended.

### 2026-07-20 — Claude Code — Phase 16 (Projects)

See "Files changed (Phase 16 — Projects)," "Summary of what was done (Phase 16 — Projects)," plus the "at the time" Build result/Known issues/Next recommended step notes appended.

### 2026-07-20 — Claude Code — Phase 14 (Analytics) + Phase 15 (POS)

See "Files changed (Phase 14 — Analytics + Phase 15 — POS)," "Summary of what was done (Phase 14 — Analytics)," "Summary of what was done (Phase 15 — POS)," plus the "at the time" Build result/Known issues/Next recommended step notes appended.

### 2026-07-20 — Claude Code — Phase 12 (Procurement) + Phase 13 (Payroll)

See "Summary of what was done (Phase 12 — Procurement)" and "Summary of what was done (Phase 13 — Payroll)" above, plus the "at the time" Build result/Known issues/Next recommended step notes appended.

### 2026-07-20 — Claude Code — Phase 10 (Accounting) + Phase 11 (HR) + Vercel postinstall fix

See "Files changed (Phase 10 — Accounting + Phase 11 — HR)" and "Summary of what was done (Phase 10 — Accounting)"/"Summary of what was done (Phase 11 — HR)" above, plus the "at the time" Build result/Known issues/Next recommended step notes appended.

### 2026-07-20 — Claude Code — Phase 9 (Inventory Management)

See "Files changed (Phase 9 — Inventory Management)" and "Summary of what was done (Phase 9 — Inventory Management)" above, plus the "at the time" Build result/Known issues/Next recommended step notes appended to that summary.

### 2026-07-20 — Claude Code — Phase 8 (CRM) + revalidatePath router-cache fix

See "Files changed (Phase 8 + revalidatePath fix)" and "Summary of what was done (Phase 8 + revalidatePath fix)" above, plus the "at the time" Build result/Known issues/Next recommended step notes appended to that summary.

### 2026-07-20 — Claude Code — Post-Phase-7 gap-fixing pass

See "Files changed," "Summary," "Build result," "Known issues," and "Next recommended step" above — kept in the current-state sections rather than duplicated here, since this is the most recent entry.

### 2026-07-20 — Claude Code — Phase 7 (Installment Management Migration)

**Files changed:** Created `src/modules/installment/service.ts` (the org-scoped service layer — settings, staff/customer/receipt code generation, products, staff, customers, accounts, payments, credits, the lifecycle sweep, procurement, and reports), `src/modules/installment/dashboard-widget.tsx`, and eight route trees under `src/app/app/installment/` (`products`, `staff`, `customers`, `accounts`, `payments`, `collections`, `reports`, `settings`). Rewrote `src/app/app/installment/page.tsx`.

**Summary:** Spawned an Explore agent against the GLV reference implementation (`C:\Users\andre\glv-management-system`) to extract its *actual* behavior before writing any code — the key finding, confirmed by GLV's own operator doc, was that several of its settings fields (commission, payroll day, administration fee, minimum deposit) are stored and editable but never read by any calculation. Migrated only what GLV actually validates: installment scheduling, payment allocation with overpayment credits, a 3-hour payment edit window with full recalculation, code generation, atomic inventory consumption, the lifecycle sweep, closure refunds, reactivation, procurement readiness, and the report aggregates. Deliberately left commission/admin-fee/minimum-deposit/credit-application/step-up-auth unimplemented, matching GLV's own real (non-)behavior — all later revisited and built in the gap-fixing pass above. Discovered real pre-existing Installment demo data with no UI ever built to show it, including some clearly-test-artifact customer records ("Test Customer Playwright" ×5, "Debug Customer" ×1) flagged for the user rather than deleted unilaterally — later cleaned up in the gap-fixing pass once the user confirmed via "fix the gaps."

**Build result:** Passed. Lint/tsc/prisma/build all clean — 44 routes (up from 36).

**Known issues:** Commission/admin-fee/minimum-deposit/credit-apply/step-up-auth all unimplemented (matching GLV), field-staff scoping unverified in browser, pre-existing test customer records not yet cleaned up, no rate limiting. All resolved in the gap-fixing pass entry above.

**Next recommended step (at the time):** Get explicit approval before continuing — which the user then gave ("fix the gaps, when done get started with the next module, and lets have billing and subscription done last"), leading directly into the gap-fixing pass above.

### 2026-07-20 — Claude Code — Phase 5 (Module Framework) + Phase 6 (Fleet Management)

**Files changed:** Created `src/platform/modules/dashboard-widgets.tsx`, `src/modules/fleet/service.ts`, `src/modules/fleet/dashboard-widget.tsx`, `src/components/forms/entity-dialog.tsx`, and nine Fleet route trees (`vehicles`, `owners`, `drivers`, `maintenance`, `insurance-roadworthy`, `payments`, `work-and-pay`, `reports`, `settings`). Modified `src/types/module.ts` (`permissionPrefix`), `src/platform/modules/registry.ts`, `src/lib/auth/permissions.ts` (`canAccessModule` reads the registry), `src/app/app/(overview)/dashboard/page.tsx`, `src/app/app/fleet/page.tsx`.

**Summary:** Phase 5 consolidated the permission-prefix concept onto `ModuleDefinition` and added dashboard-widget registration. Phase 6 built Fleet Management completely on top of already-existing `Fleet*` Prisma models — discovered real pre-existing Fleet demo data with no UI ever built to show it. Designed permissions per page against the actual seeded `ROLE_PERMISSIONS`: viewing needs only module access, mutating needs that area's specific `.manage` permission, Reports gated separately on `.reports.view`. One real bug found via testing: the module-toggle `Switch` had no local state and mishandled rapid consecutive clicks — fixed with `useState`.

**Build result:** Passed. Lint/tsc/prisma/build all clean — 36 routes (up from 27).

**Known issues:** No owner-facing maintenance approval portal, no branch-level enforcement, no photo upload for maintenance. All either resolved or explicitly carried forward in the Phase 7 entry above.

**Next recommended step (at the time):** Get explicit approval before Phase 7 — which the user then gave ("continue" then "get it started"), leading directly into the work above.

### 2026-07-20 — Claude Code — Phase 4 (Platform Workspace)

**Files changed:** Created `src/lib/auth/permissions.ts`, `src/lib/tenant/actions.ts`, `src/components/navigation/organization-switcher.tsx`, `src/app/app/(overview)/administration/actions.ts`, `src/app/app/(overview)/notifications/actions.ts`, `src/app/app/platform/actions.ts`, `src/app/app/platform/organizations/module-toggle.tsx`. Rewrote `src/lib/tenant/index.ts` (added `enabledModuleKeys`/`memberships`, `active_org` cookie support), `src/platform/modules/workspace-navigation.tsx` (became `getWorkspaceNavigation(tenant)`), `src/components/layout/app-shell.tsx`/`module-launcher.tsx`, all four scope layouts (platform/fleet/installment/overview — each now guards access), and every Platform Workspace + Administration/Organization/Notifications page with real data.

**Summary:** Reconciled a real data drift found before writing any UI: the `Module` table had a legacy `layaway` code that didn't match the `installment` registry key, five modules mismarked `ACTIVE` with no real pages, three registry modules missing from the DB, and an orphaned `pos` row — all fixed with explicit user approval (direct DB writes are gated by the auto-mode permission classifier; the user added a scoped `Bash(node ./_*.mjs)` allow-rule to their own settings for this). Built the full authorization layer (`src/lib/auth/permissions.ts`): platform access gated on the literal "Super Admin" role name (not a permission, since Organization Owner holds every permission but must never reach Platform), module access gated on a permission *prefix* (not a single `.view` permission, to accommodate Investor's `fleet.investor.view` without `fleet.view`). Wired every Platform Workspace page to real data including a working invite-a-member flow and a live per-org module enable/disable toggle. One real bug found via testing: the module toggle `Switch` had no local state and mishandled rapid consecutive clicks — fixed with `useState`.

**Build result:** Passed. Lint/tsc/prisma/build all clean — 27 routes (unchanged count from Phase 3).

**Known issues:** No branch-level access enforcement, no action-level in-page permission checks (Fleet/Installment had no real pages yet), no rate limiting, organization switcher functionally inert (single-org demo data). All either resolved or explicitly carried forward in the Phase 5/6 entry above.

**Next recommended step (at the time):** Get explicit approval before Phase 5 — which the user then gave ("continue with phase 5 and 6"), leading directly into the work above.

### 2026-07-19 — Claude Code — Phase 3 (Authentication)

**Files changed:** Created `src/lib/db.ts` (Prisma singleton), `src/lib/auth/{nextauth.ts,next-auth.d.ts,session.ts,tokens.ts,actions.ts}`, `src/app/api/auth/[...nextauth]/route.ts`, `src/lib/tenant/index.ts` (first version), `src/app/app/{layout.tsx,page.tsx}`, `src/components/session-provider.tsx`, `src/lib/email.ts`, `src/app/(auth)/{reset-password,invite}/page.tsx`, `src/app/(public)/contact/actions.ts`. Rewrote `src/app/(auth)/login/page.tsx`, `src/app/(auth)/forgot-password/page.tsx`, `src/components/navigation/user-menu.tsx`.

**Summary:** Reconnected to the existing Neon database (no schema changes) and built NextAuth v4 credentials-based authentication with JWT sessions, replacing every placeholder from Phase 1/2: real login, real session data in `UserMenu`, real sign-out, and `/app/*` route protection where none existed before. Built password reset and invite acceptance on NextAuth's previously-unused `VerificationToken` model (single-use, prefixed identifiers, distinct TTLs). Wired the contact form to real email delivery (Resend) with graceful degradation. One real bug found via browser verification: Base UI requires `DropdownMenuLabel` inside a `<DropdownMenuGroup>` (unlike Radix) — fixed.

**Build result:** Passed. Lint/tsc/prisma/build all clean — 27 routes (up from 24).

**Known issues:** No admin-facing "send invite" UI, no permission/role enforcement beyond org membership, no rate limiting. All addressed or explicitly carried forward in the Phase 4 entry above.

**Next recommended step (at the time):** Get explicit approval before Phase 4 — which the user then gave ("start phase 4"), leading directly into the Phase 4 work above.

### 2026-07-19 — Claude Code — Phase 2 (Public Website + `/app` restructure)

**Files changed:** Moved (git history preserved) `src/app/(workspace)/(overview)/*` → `src/app/app/(overview)/*`, `src/app/(workspace)/fleet/*` → `src/app/app/fleet/*`, `src/app/(workspace)/installment/*` → `src/app/app/installment/*`, `src/app/(platform)/platform/*` + layout → `src/app/app/platform/*`; removed the now-empty `(workspace)`/`(platform)` folders. Created `src/app/(public)/{solutions,modules,industries,company,contact}/page.tsx`. Modified `public-header.tsx` (full nav), homepage CTAs, `logo.tsx` (optional `href`), `app-shell.tsx`, `user-menu.tsx` and dashboard links (`/app`-prefixed), all navigation configs and `registry.ts` (`/app`-prefixed hrefs), and `docs/{ARCHITECTURE,MODULE_BOUNDARIES,DEVELOPMENT_ROADMAP,AUTHENTICATION_AND_AUTHORIZATION}.md` + `README.md`.

**Summary:** Caught a real structural collision before writing any Phase 2 content: the planned public `/modules` marketing page would have collided with Phase 1's authenticated `/modules` module launcher at the identical bare URL. Fixed by moving every authenticated route under a literal `/app` URL segment before starting Phase 2 content. Directory-level renames failed with Windows "Permission denied" (likely an editor file-handle lock); worked around by moving files individually via `git mv`. Built five new marketing pages (Solutions, Modules, Industries, Company, Contact) with honestly-scoped copy — no fabricated metrics or claims. Found and fixed two real Server→Client prop-boundary bugs via browser verification (not caught by `tsc`/lint/build): the Contact page's `<Select>` showed a raw value instead of its label (Base UI doesn't auto-derive labels from `SelectItem` children like Radix does), and a first fix attempt (a `children` formatter function) produced an unrelated-looking error ("Encountered a script tag...") traced back to the same root cause as Phase 1's icon bug — a function crossing the Server→Client boundary. Fixed via `Select`'s `items` prop instead of a callback.

**Build result:** Passed. Lint/tsc/prisma/build all clean — 24 routes (up from 19).

**Known issues:** No database/auth/business logic yet (by design), contact form UI-only until Phase 3, no route guards yet. All resolved or superseded in the Phase 3 entry above.

**Next recommended step (at the time):** Get explicit approval before Phase 3 — which the user then gave ("continue"), leading directly into the Phase 3 work above.

### 2026-07-19 — Claude Code — Phase 1 (Foundation and Design System, clean rebuild)

**Objective:** Per an explicit, detailed rebuild instruction, retire the entire previous Rock Frost Business Suite implementation and rebuild Phase 1 (Foundation and Design System) from scratch, per the instruction's own safety rule and scope gate.

**Files changed:** Removed the entire previous `app/`, `components/`, `lib/` implementation (full history preserved, also snapshotted on branch `archive/pre-redesign-rfbs`) plus 5 unused create-next-app boilerplate icons and 3 now-broken seed scripts (archived, not deleted). Archived all previous docs under `docs/archive/previous-implementation/` with an OBSOLETE banner. Created the full `src/` foundation: root layout with ThemeProvider/TooltipProvider/Toaster, `(public)` homepage, `(auth)` login/forgot-password (UI only), `(workspace)`/`(platform)` route groups (later restructured under `/app` in Phase 2 — see above), 24 shadcn/ui components, `AppShell`/navigation/`EmptyState` components, the module registry and type system. New authoritative docs: `DECISIONS.md`, `PRODUCT_VISION.md`, `ARCHITECTURE.md`, `MODULE_BOUNDARIES.md`, `DESIGN_SYSTEM.md`, `DEVELOPMENT_ROADMAP.md`, `DATABASE_STRATEGY.md`, `AUTHENTICATION_AND_AUTHORIZATION.md`, `TESTING_STRATEGY.md`.

**Summary:** Root cause of the rebuild: the previous implementation had no enforced module-boundary concept — Fleet and Installment navigation/dashboard chrome bled into each other (a hardcoded "Fleet Operations" / "Rock Frost Fleet Control" heading rendered on every page regardless of module, a flat unsectioned sidebar). Backed up first (branch + push + private env-var/asset migration note) per the instruction's safety rule, then rebuilt with module isolation as a structural property: each module gets its own nested route-group `layout.tsx` rendering a shared `AppShell` with its own navigation array — no shared conditional-sidebar logic that could drift. Chose shadcn/ui on Base UI primitives (documented in `DECISIONS.md`); got the `asChild`-vs-`render` prop distinction wrong initially (Base UI, not Radix), which produced two real bugs caught only by actually building and running the app: a hard build failure from passing Lucide icon component references as props across a Server→Client boundary (fixed by pre-rendering icons as JSX elements instead), and a Base UI accessibility warning on `Button`s rendered as `Link`s (fixed with `nativeButton={false}`).

**Build result:** Passed. Lint/tsc/prisma/build all clean — 19 static routes. Verified visually in a real browser (Playwright, temporary) with zero console errors across every route plus the module-launcher dialog.

**Known issues:** See Phase 2 entry above — the "no database/auth/business-logic yet" and "form component not added" gaps carried forward unchanged into Phase 2 and are documented there.

**Next recommended step (at the time):** Report per the instruction's required final-report format and get explicit approval before continuing — which the user then gave ("proceed to the next phase"), leading directly into the Phase 2 work above.
## 2026-07-26 — Tenant login copy, GLV staff lifecycle, and subscription-state indication

Removed the tenant-login cross-surface notice while preserving the platform
owner notice. Audited Installment staff management against the original GLV
project and added deactivation plus password-and-`DELETE`-confirmed permanent
deletion. Customer, installment-account, or salary-payment history blocks
deletion and directs the administrator to deactivate the profile; linked
Business Suite membership accounts are deliberately preserved.

Tenant application pages now identify the workspace as Trial, Subscribed, or
inactive. Trial display uses the documented 14-day window from organization
creation. Both manual and gateway subscription activation now promote the
organization from `TRIAL` to `ACTIVE`, keeping the badge consistent with paid
access.

Important files: `src/app/(auth)/login/page.tsx`,
`src/app/app/layout.tsx`, `src/app/app/installment/staff/{page,actions}.tsx`,
`src/modules/installment/service.ts`,
`src/platform/subscriptions/service.ts`,
`test/subscription-{workflow,gateway-payment}.test.ts`,
`docs/{INSTALLMENT_GLV_PARITY,BILLING_AND_SUBSCRIPTIONS}.md`, and `README.md`.
No schema migration or environment change is required.

Validation: `npm run lint` passed; the affected suite passed 17/17; the full
`npm run test` suite passed 197/197 across 28 files; and `npm run build`
compiled, type-checked, and generated all 116 pages successfully. The initial
affected-test run exposed two stale transaction mocks after organization
activation was added; both tests were updated to assert the new state
transition. Remaining risk: the 14-day trial is currently indicated but is not
automatically expired; operators must suspend or convert it after the window.
## 2026-07-26 — Complete public-site technical SEO foundation

Replaced the stale static sitemap and permissive robots file with Next.js
metadata routes. The sitemap now contains only real public pages and dedicated
landing pages for all eleven business modules; `/app`, `/api`, login, password,
and invitation routes are excluded from crawling and also emit `noindex`.

Added a single canonical SEO configuration, unique page titles/descriptions,
canonical URLs, Open Graph and Twitter cards, a generated 1200×630 sharing
image, Organization/WebSite/SoftwareApplication/Breadcrumb JSON-LD, stronger
internal footer/module links, and truthful module-focused search content.
Removed stale public copy that said completed modules were still forthcoming.

Important files: `src/lib/seo.ts`, `src/app/{robots,sitemap,opengraph-image}.tsx`,
`src/components/seo/json-ld.tsx`,
`src/app/(public)/modules/[moduleKey]/page.tsx`, all six existing public pages,
the public/auth/application layouts, `public/manifest.webmanifest`,
`test/seo.test.ts`, and `docs/SEO.md`. Static `public/robots.txt` and
`public/sitemap.xml` were removed to prevent competing output. No schema or
environment changes are required.

External owner action remains required: verify the `rockfrostgroup.com` Domain
property in Google Search Console using Google's account-specific Cloudflare
TXT record, submit `https://www.rockfrostgroup.com/sitemap.xml`, and request
indexing for priority pages. Exact steps are in `docs/SEO.md`. Technical SEO
can be made complete, but no implementation can truthfully guarantee a
specific Google ranking.

Validation before release: `npm run lint` passed; the new SEO tests passed
3/3; the full `npm run test` suite passed 200/200 across 29 files; and
`npm run build` compiled, type-checked, generated 130 pages, and statically
prerendered all eleven module landing pages. A local production-server probe
confirmed HTTP 200 responses, unique titles, canonical tags, JSON-LD,
generated robots/sitemap output, and `noindex, nofollow, nocache` on login.
Production verification is completed after deployment.

## 2026-08-10 — School customer-readiness foundation (in progress)

Started the coordinated School production-readiness program with separate
backend/data and UI lanes. The backend tranche adds explicit, append-only
student lifecycle events; terminal student transitions close active enrollment
history; reusable campus/year/term/class fee structures issue at most one
invoice per eligible active student; and repeated bulk issuance safely skips
students already billed. Attendance correction windows and campus receipt
prefixes are now enforced rather than merely stored. Invoice/receipt number
allocation is serialized per organization during the affected transactions.

The coordinated UI lane rewrites all fourteen School routes with labelled
controls, responsive record tables, prerequisite guidance, explicit read-only
states, success/error feedback, search/filter surfaces, structured grading
scale editing, and reachable student-lifecycle and bulk-fee actions. Stable
service rejection codes now reach customer-readable UI messages, bulk issuance
reports issued/skipped counts, and student state claims reject concurrent stale
transitions. `AGENTS.md` now makes validated push, deployment, and post-deploy
verification part of the repository definition of done; CI also runs on
`agent/**` release branches so database gates finish before `main` promotion.

Important files: `prisma/schema.prisma`, migration
`20260810103000_school_customer_readiness_foundation`,
`src/modules/school/service.ts`, `src/app/app/school/actions.ts`,
`test/integration/tenant-isolation/school.test.ts`, and
`docs/SCHOOL_CUSTOMER_READINESS.md`. No environment variable was added.

Local validation: Prisma format/generate passed; Prisma validate passed with
the documented harmless `DIRECT_URL` placeholder because local `DIRECT_URL` is
intentionally empty; strict TypeScript and ESLint passed; the mocked suite
passed 34 files / 213 tests. New real-database School coverage is written but
has not run because this checkout has no disposable `TEST_DATABASE_URL`.
The combined Next.js production build passed and generated all 160 pages.
Authenticated browser verification and the guarded disposable-database
migration/full integration suites remain release gates and will run through
the release branch/preview workflow before production promotion.

Release-gate follow-up: installed a local PostgreSQL 16.14 test runtime on
port 55432, created the guard-compliant disposable `rockfrost_test` database,
and applied all 28 migrations successfully. The first full integration run
passed School 7/7 but exposed a pre-existing Payroll first-use settings race.
`src/modules/payroll/service.ts` now retries the organization-unique settings
upsert after a create collision so the loser re-enters the update path. The
final validation passed ESLint (excluding the unrelated concurrent `.scratch/`
workspace), TypeScript, 34 unit files / 213 tests, 19 integration files / 107
real-PostgreSQL tests, and the optimized Next.js build with all 160 pages. The
disposable database is for release validation only and contains no
production/customer data.

Production release: commits `4ed658d` and `2957562` were fast-forwarded to
`main` and pushed. Vercel production deployment
`dpl_CwELTKmUEUyEFgrccRtnqDMpwG9o` reached Ready after the production migration
and build. Live verification returned HTTP 200 with a reachable database from
`www.rockfrostgroup.com/api/health`, HTTP 200 from the customer and platform
login surfaces, and the unauthenticated School route correctly returned HTTP
307 to `https://app.rockfrostgroup.com/login`. No customer data was used during
release validation.

### 2026-08-10 — Invitation login and password-reset diagnosis

Production read-only inspection confirmed the latest accepted invitation had
matching Invitation/User email values, an ACTIVE user, an ACTIVE membership,
and a saved password hash. The failed credential attempts used a different
email address, so authentication correctly found no account and the
enumeration-safe reset flow correctly sent no email. The onboarding UX now
redirects accepted invitees to login with the exact invited email prefilled,
credential lookup trims/lowercases email input, and password setup/reset no
longer silently trims password values. Added an accessible login password
visibility toggle and regression coverage for exact password preservation and
canonical-email handoff. Concurrent icon changes under `public/` and
`src/app/` were pre-existing and intentionally left untouched. Validation:
ESLint passed; 34 unit files / 214 tests passed; TypeScript passed through the
optimized Next.js build; and the build generated all 160 pages. No schema or
database-service behavior changed, so the guarded integration suite was not
required for this authentication/UI-only release.

### 2026-08-10 — Claude Code release-rule clarification

`CLAUDE.md` already imported the root `AGENTS.md`; it now also states the
production release requirement explicitly so Claude Code has an unambiguous
definition of done: validate, document, commit, push, deploy, and verify while
preserving concurrent work. This is instruction/documentation-only; validation
was limited to `git diff --check` and inspection of the resulting files.

### 2026-08-10 — Profile-photo Server Action 413 fix

Vercel production logs showed one confirmed runtime error: `POST /app/account`
returned HTTP 413 because Next.js's 1 MB Server Action body limit was smaller
than the existing 1 MiB profile-photo allowance once multipart overhead was
included. `next.config.ts` now provides a bounded 2 MB Server Action envelope;
the application still enforces the existing 1 MiB/type limit server-side, and
`profile-photo-form.tsx` now rejects oversized selections immediately with an
actionable message. No database schema or stored-data migration changed.
Validation passed: ESLint; 35 unit files / 217 tests; standalone TypeScript;
and the optimized Next.js 16.2.12 build with all 160 pages. The initial
top-level `serverActions` configuration was rejected by this installed Next.js
type definition and was corrected to the version-documented
`experimental.serverActions.bodySizeLimit` before release.
# 2026-08-13 - Production subscription pricing catalogue

- Added `src/lib/pricing.ts` as the authoritative GHS catalogue for all fifteen modules, including monthly and annual prices, included seats, additional-seat guidance, seven popular bundles, and the enterprise starting price.
- Added the public `/pricing` route and linked it from the public header, footer, and sitemap. The page explains annual savings, seat treatment, exclusions, bundles, and quote paths without claiming that quoted implementation services are included.
- Updated the platform-owner subscription form to prefill the catalogue amount and included seats based on the selected module and duration. Defaults remain editable for real negotiated agreements. No schema or environment change is required.
- Tests added/updated: `test/pricing-catalogue.test.ts` and `test/seo.test.ts`. Validation passed: `npx.cmd tsc --noEmit`; focused tests 2 files / 7 tests; ESLint clean; full mocked suite 54 files / 310 tests; Next.js 16.2.12 production build compiled and generated all 191 static pages, including `/pricing`.
- No schema migration, integration-database run, or new environment variable is required because this release changes catalogue/UI defaults only. Remaining release work: commit, push, deploy, and post-deploy verification.
- Released as commit `3cf04e4` on `main`. Vercel production deployment `dpl_EBwZnFT7bSw9WfTuehgp2SoyZb7d` reached Ready and was aliased to the production domains. Post-deploy checks: `https://www.rockfrostgroup.com/pricing` returned HTTP 200 with the expected pricing title/heading; `https://app.rockfrostgroup.com/api/health` returned HTTP 200 with `database: reachable`; the deployment error-log scan returned no errors.
# 2026-08-13 - Premium company positioning and responsible-technology page

- Rebuilt `/company` as a premium corporate profile for Rock Frost Technologies, expanding the public offer beyond the Business Suite to business platforms, e-commerce, web/product engineering, integrations, cloud modernization, and technology advisory.
- Added selected-work descriptions for Rock Frost Business Suite, HR Network / Connect, Blend & Beam, and other commissioned solutions. Blend & Beam links to its public domain; HR Network / Connect is described without an unverified external URL.
- Added a responsible-technology section referencing Ghana's Data Protection Act, 2012 (Act 843) and the Data Protection Commission. Copy explicitly avoids claiming that software alone guarantees compliance or that Rock Frost holds an unverified certification; customers retain controller/governance and sector-specific obligations.
- Added `test/company-page.test.ts`; no schema or environment changes.
- Validation: `npx.cmd tsc --noEmit` passed; focused company/SEO tests 2 files / 5 tests passed; ESLint clean; full mocked suite 55 files / 312 tests passed; Next.js 16.2.12 production build compiled and generated all 191 static pages.
- Released as commit `38a1284` on `main`. Vercel production deployment `dpl_FXK8a2GSuRZMda5AvKUJbgrkPwKB` reached Ready. Live verification: `/company` returned HTTP 200 with the new premium heading, Blend & Beam portfolio entry, and Act 843 compliance copy; `/api/health` returned HTTP 200 with the database reachable; the deployment error-log scan returned no errors.
# 2026-08-13 - Unified premium public-site redesign

- Added `PublicHero` and public-layout design tokens for a consistent editorial headline scale, plain eyebrow treatment, atmospheric blue-white background, translucent panels, and softly tinted sections.
- Applied the shared visual language to the homepage, Company, Solutions, Modules, all module landing pages, Industries, Pricing, Contact, and the customer showcase. Authenticated application surfaces are deliberately unchanged.
- Removed the outlined Company-page eyebrow badge. Replaced the four-cell statistics box with a compact premium proof panel focused on specialized modules, secure architecture, and continuous delivery/support; avoided the unsupported `24/7 cloud availability target` claim.
- Added `test/public-design-system.test.ts` and extended the Company page test. No schema or environment changes.
- Validation: TypeScript clean; focused visual-system/company/SEO tests 3 files / 8 tests passed; ESLint clean; full mocked suite 56 files / 315 tests passed; Next.js 16.2.12 production build compiled and generated all 191 static pages.
- Released as commit `be24832` on `main`. Vercel production deployment `dpl_TonVC2727Q23Dqt6QqBRz7FjMweq` reached Ready after compiling the same commit; its build reported no pending database migrations. Post-deploy checks: `/company` and `/` returned HTTP 200 with their expected redesigned hero copy, `/api/health` returned HTTP 200 with `database: reachable`, and the deployment log completed without a build or deployment error.
# 2026-08-13: compliance readiness and sensitive export controls

- Scope: introduced the independent `org.data.export` permission for organization JSON and Excel downloads, preserved `org.settings.manage` for protected restore, logged each successful data export with format and active-module scope, added `private, no-store` response controls, and neutralized spreadsheet formula prefixes in audit CSV exports.
- Important files: `src/lib/auth/permissions.ts`, `prisma/seed-data.ts`, organization backup routes and UI, `src/app/api/audit-log/export/route.ts`, `test/active-module-backup-routes.test.ts`, `test/sensitive-export-security.test.ts`, and `docs/COMPLIANCE_AND_ASSURANCE.md`.
- Database and environment: no schema migration. The existing idempotent platform seed must run during deployment so the new permission is created and included in all-permissions roles. No new environment variable.
- Compliance truth: the evidence register explicitly does not claim DPC or GRA approval, SOC 2 or ISO certification, or an independent penetration test. Tamper-evident audit storage, privacy case workflow, enterprise SSO, and evidenced recovery drills remain separate gated work.
- Validation: `git diff --check` passed; focused Vitest passed 2 files and 6 tests; `npx tsc --noEmit` passed; `npm run lint` passed; full Vitest passed 59 files and 321 tests; `npm run build` passed and generated 191 pages. The real-Postgres integration suite was not run locally because `TEST_DATABASE_URL` is not configured; the GitHub CI integration job remains the required disposable-Postgres gate. There is no schema migration in this release.
- Release: implementation commit `09f7503` pushed to `origin/main`. Vercel production deployment `dpl_9HVgTFyWRP1BXHoqwEMfn3AVbHu6` built that exact commit and reached Ready. Build logs show 34 migrations with none pending, 127 permissions upserted, 127 grants each for Super Admin and Organization Owner, 15 active modules seeded, TypeScript passed, and all 191 pages generated. Post-deploy `https://app.rockfrostgroup.com/api/health` returned 200 with `Cache-Control: no-store`; an unsigned organization-backup request returned 401; the Vercel error-log scan for the deployment found no errors. GitHub CLI was not authenticated locally, so GitHub Actions status could not be read from this environment.
- Pre-existing files preserved: `Rock-Frost-Project-Status-Report.pdf`, `output/`, and `tmp/` remain untracked and untouched.
# 2026-08-14: consolidated HR and Payroll plus Inventory and Procurement products

- Scope: replaced separate customer-facing HR and Payroll purchases with Human Resources & Payroll, and separate Inventory and Procurement purchases with Inventory & Procurement. Internal routes, permission namespaces, data models, audit identifiers, and backup scope keys remain intact for backward compatibility.
- Entitlements: an enabled assignment or current subscription for either a primary or legacy companion key expands to the complete product group. Subscription expiry is evaluated at product-group level so an enabled companion row cannot bypass an expired paid term. Existing Payroll-only and Procurement-only customers keep access. New pricing, requests, subscriptions, sitemaps, launchers, owner controls, and public pages expose only the thirteen primary products.
- HR and Payroll: both route trees now use one permission-filtered People and Payroll navigation. A Payroll administrator can create the minimal HR employee record from Compensation before assigning salary, so Payroll can operate without a separate HR administrator role.
- Billing and administration: combined products count a member once when their role has either internal permission prefix. Platform product adoption, activation counts, organization toggles, and module cards group companion records rather than double-counting them.
- Inventory and Procurement interface: Claude commit `c66026c` was reviewed and integrated as `a7f8589`. Both route trees now render one permission-aware navigation, `/app/inventory` provides the combined operational overview, settings cross-link cleanly, and linked purchase-order lines cannot be marked received without selecting a warehouse. Non-stock purchase lines remain valid without a warehouse.
- Schema and environment: no Prisma schema migration and no new environment variable. The idempotent production seed updates the two primary module display names while keeping legacy module rows.
- Validation: focused integration passed 5 files and 61 tests. Full ESLint passed. The complete mocked suite passed 61 files and 354 tests. The optimized Next.js 16.2.12 build compiled, passed TypeScript, and generated 189 pages. `git diff --check` passed. No disposable-database integration run is required because this release has no schema or migration change. Push, deployment, and production verification are recorded in the follow-up release line below.
- Operations: added `/.claude/` to Git ignore and `.claude/**` to ESLint global ignores. This prevents local agent worktree copies from being committed or recursively linted.
- Production verification found that component-level redirects for `/modules/payroll` and `/modules/procurement` returned an HTML redirect marker inside an HTTP 200 response. They were replaced with `next.config.ts` permanent redirects, which execute before filesystem routing and return HTTP 308 for browsers and search engines. Focused SEO and product tests passed 2 files and 7 tests after the correction; the final deployment was rebuilt and rechecked.
- Release: final application commit `9c135ad` was pushed to `origin/main`. Vercel production deployment `dpl_8PoD9ufcUZT5bRbtu7ynTbTjD3DG` reached Ready and received the `app`, `www`, `admin`, apex, and Vercel production aliases. Live checks confirmed `/api/health` returned HTTP 200 with `database: reachable`; `/modules/hr` and `/modules/inventory` returned HTTP 200; `/modules/payroll` returned HTTP 308 to `/modules/hr`; `/modules/procurement` returned HTTP 308 to `/modules/inventory`; unsigned `/app/inventory` returned HTTP 307 to `/login`; and the deployment error-log scan found no errors.
- Pre-existing files preserved: `Rock-Frost-Project-Status-Report.pdf`, `output/`, `tmp/`, and Claude's `.claude/` worktree metadata remain untracked and untouched by the release commit.

# 2026-08-15: consent-managed analytics and Google indexing readiness

- Privacy scope: added a global cookie-preferences interface with equal Essential only and Accept optional analytics actions. Vercel Web Analytics and Speed Insights no longer mount before affirmative optional consent. The first-party preference is site-wide, `SameSite=Lax`, `Secure` on HTTPS, and expires after 180 days. A permanent Cookie settings footer action reopens the choice.
- Public policy: added the indexable `/cookie-policy` route explaining essential cookies, optional analytics, retention, preference changes, and the boundary between website preferences and tenant operational data.
- Search scope: added `/cookie-policy` to `robots.txt` and the XML sitemap, updated the sitemap date and documented count to 21 canonical URLs, and added optional `GOOGLE_SITE_VERIFICATION` metadata support. The value must be the real Google-provided token. Google Domain property verification still requires the owner to add Google's DNS TXT value, then submit the sitemap and request indexing in Search Console.
- Important files: `src/components/privacy/*`, `src/lib/cookie-consent.ts`, `src/app/layout.tsx`, `src/app/(public)/cookie-policy/page.tsx`, `src/app/sitemap.ts`, `src/app/robots.ts`, `.env.example`, `docs/SEO.md`, `docs/COMPLIANCE_AND_ASSURANCE.md`, and `docs/OPERATIONS_AND_MONITORING.md`.
- Schema and environment: no schema migration. `GOOGLE_SITE_VERIFICATION` is optional and has no runtime effect when unset. No Google verification value was invented or committed.
- Validation: focused Vitest passed 2 files and 6 tests; ESLint passed; the complete mocked suite passed 63 files and 361 tests; the Next.js 16.2.12 production build compiled, passed TypeScript, and generated 193 routes; `git diff --check` passed. No disposable-database integration run is required because this change has no schema or database behavior.
- External boundary: code cannot complete private Google Search Console ownership, DNS verification, sitemap submission, or URL inspection without the owner's Google and DNS access. Those steps remain explicitly unclaimed until Google confirms them.
- Pre-existing files preserved: `Rock-Frost-Project-Status-Report.pdf`, `output/`, and `tmp/` remain untracked and untouched.
- Release: implementation commit `2df6366` was pushed to `origin/main`. Vercel production deployment `dpl_MDDrDLus7iX49taUpb18kdMHogFm` reached Ready and received the `www`, `app`, `admin`, apex, and production aliases. Live verification confirmed `/cookie-policy` returned HTTP 200 with its canonical title, `/sitemap.xml` returned HTTP 200 with 21 URLs including `/cookie-policy`, `/robots.txt` returned HTTP 200 with the policy allowed, and `/api/health` returned HTTP 200 with the database reachable. The deployment error-log scan found no errors.

# 2026-08-16: Windows desktop activation fetch-binding fix (0.2.1 to 0.2.2)

- Scope: this branch fixes production desktop device activation, which failed for every customer with `Failed to execute 'fetch' on 'Window': Illegal invocation`. Worked in an isolated git worktree on branch `agent/claude-desktop-fetch-binding-fix`, checked out from `main` at `f63d179`. The shared main working tree and its pre-existing untracked files (`Rock-Frost-Project-Status-Report.pdf`, `output/`, `tmp/`) were not touched.
- Root cause: `apps/desktop/src/sync/sync-client.ts` stored WebView2's native `fetch` as a bare reference (`this.fetchFn = options.fetchFn ?? fetch`) and invoked it as `this.fetchFn(...)`. WebView2's `fetch` is receiver-sensitive and requires `window`/`globalThis` as the call receiver; calling it as a `SyncClient` method makes `this` the client instance instead, which WebView2 rejects with `Illegal invocation` before any network request is attempted. This is the same class of bug already fixed for `setInterval`/`clearInterval` in `apps/desktop/src/security/device-lock.ts`.
- Why activation details were not the cause: the throw happens synchronously inside the local `fetch` call, before a request is ever constructed. A correct activation code, module selection, and passcode do not matter to this failure path.
- Activation code consumption: not consumed on this failure. The server's `POST /api/desktop/activate` handler (`src/app/api/desktop/activate/route.ts`) only claims the single-use code when it receives and parses an actual HTTP request; because the fetch call throws before dispatching anything, the server handler never runs for a failed local invocation.
- Fix: `this.fetchFn = options.fetchFn ?? globalThis.fetch.bind(globalThis)`, bound once in the constructor. Caller-supplied `fetchFn` overrides (used throughout the existing desktop test suite) are left untouched.
- Audit: searched all of `apps/desktop/src` for other retained receiver-sensitive native references (`fetch`, timers, storage, `navigator`). Found only this one instance; every other usage already calls through the correct receiver at the call site.
- Important files: `apps/desktop/src/sync/sync-client.ts`, `apps/desktop/src/sync/sync-client.test.ts` (new), `apps/desktop/package.json`, `apps/desktop/package-lock.json`, `apps/desktop/.env.example`, `apps/desktop/src-tauri/tauri.conf.json`, `apps/desktop/src-tauri/Cargo.toml`, `apps/desktop/src-tauri/Cargo.lock`, `docs/OFFLINE_DESKTOP.md`, `apps/desktop/README.md`, `apps/desktop/CLAUDE_HANDOFF.md`.
- Version: desktop client `0.2.1` to `0.2.2` across `package.json`, `package-lock.json`, `tauri.conf.json`, `Cargo.toml`, `Cargo.lock`, and `.env.example`. No schema or environment-variable changes.
- Validation from `apps/desktop/`: `npm run typecheck` passed; `npm run lint` passed; `npm test` passed 13 files and 73 tests, including 7 new `sync-client.test.ts` tests that reproduce the exact `Illegal invocation` failure against the pre-fix code and pass only with the fix applied; `npm run build` passed (Vite, 1,634 modules, 258.80 kB bundle); `cargo check` passed; `npm run tauri:build` passed and produced both the NSIS and MSI `0.2.2` installers. Root `test/editorial-punctuation.test.ts` passed with no em dash in any changed source file. `git diff --check` passed. The Rust `cargo check`/`tauri:build` steps reused the main worktree's already-built OpenSSL cache via a shared `CARGO_TARGET_DIR`, because this worktree's local `perl` lacks the `Locale::Maketext::Simple` module needed to build `openssl-sys` from source; this is a local environment gap, not a code defect.
- Installers built (not installed anywhere): NSIS `apps/desktop/src-tauri/target/release/bundle/nsis/Rock Frost Business Suite_0.2.2_x64-setup.exe` (3,480,987 bytes, SHA-256 `469b6d98b7ec2e40ab058fada21a6b2055f81ffb39855a51a48e20909345bf2d`) and MSI `apps/desktop/src-tauri/target/release/bundle/msi/Rock Frost Business Suite_0.2.2_x64_en-US.msi` (4,763,648 bytes, SHA-256 `0c2ea2dc58b52760fb2e3033cfd949792a14aa644761efc01b0dbecc7a4066d6`). No updater `.sig` was generated for `0.2.2`: `TAURI_SIGNING_PRIVATE_KEY` is not set in this environment (it is configured only as a GitHub Actions secret per `docs/OFFLINE_DESKTOP.md`), so the updater artifact step failed with `A public key has been found, but no private key`; the release workflow will generate the signed `.sig` when this branch is merged and released. Windows Authenticode signing remains pending as before; public distribution stays enabled.
- Real-world verification performed: the packaged release exe was launched directly (not installed) and stayed running past a five-second startup smoke check, with no blank window and no startup timeout. Real-world verification not performed: clicking Activate against the live production backend with a real activation code was not tested, because this environment has no native WebView2 UI-automation tool and no safe production credentials or fresh activation code were available to invent. This remains an honest manual verification step for whoever installs and signs off on the built package.
- Remaining risks: (1) the `0.2.2` updater `.sig` still needs to be generated by the signed release workflow before this version can be pushed through the in-app updater; (2) real end-to-end activation against production has not been manually confirmed; (3) Windows Authenticode signing is still pending, so Windows may show an Unknown publisher/SmartScreen warning on the unsigned installers built here.
- Release: implementation committed to `agent/claude-desktop-fetch-binding-fix` and pushed to `origin`. Not merged to `main`. Not deployed. Per the task that created this branch, a separate agent (Codex) will inspect the branch, reconcile any concurrent work, merge it, deploy the server-side documentation release, install the correct Windows package with authorization, and perform the final production activation test.
- Pre-existing files preserved: `Rock-Frost-Project-Status-Report.pdf`, `output/`, and `tmp/` remain untracked and untouched by this branch.

# 2026-08-16: Windows desktop CSP connect-src fix, found via live install testing (0.2.2 to 0.2.3)

- Scope: `0.2.2` was built and installed on this machine and manually tested by the operator. Activate device no longer threw `Illegal invocation`, but failed with a new error, `Failed to fetch`. This is a second, previously-hidden defect in the same activation path, found only because the first fix let the request actually reach the network layer. Continued work on the same isolated worktree and branch, `agent/claude-desktop-fetch-binding-fix`.
- Root cause: the packaged app's Content-Security-Policy (`apps/desktop/src-tauri/tauri.conf.json`'s `app.security.csp`, duplicated in `apps/desktop/index.html`) restricted `connect-src` to `'self' ipc: https://ipc.localhost` and never allowed the real sync API origin. WebView2 enforces CSP like a browser; a `fetch()` to a disallowed origin is blocked before the request leaves the renderer and rejects with a generic `TypeError: Failed to fetch`, which is indistinguishable in the UI from an actual network outage.
- Diagnosis performed before concluding this was CSP and not connectivity: `Test-NetConnection app.rockfrostgroup.com -Port 443` succeeded from this machine, ruling out DNS/firewall/internet problems; confirmed no `apps/desktop/.env` override exists, so the app used the documented default origin `https://app.rockfrostgroup.com`; the CSP string was the only remaining explanation for a well-formed, correctly-bound `fetch()` being rejected.
- Also corrected: `apps/desktop/.env.example` documented a non-existent origin, `https://api.rockfrostgroup.com`; it now matches the real production origin used everywhere else in this repository, `https://app.rockfrostgroup.com`.
- Fix: added `https://app.rockfrostgroup.com` to `connect-src` in both `apps/desktop/src-tauri/tauri.conf.json` and `apps/desktop/index.html`.
- Important files: `apps/desktop/src-tauri/tauri.conf.json`, `apps/desktop/index.html`, `apps/desktop/.env.example`, `apps/desktop/src/packaging/bundled-assets.test.ts`, desktop version manifests, `docs/OFFLINE_DESKTOP.md`, `apps/desktop/README.md`, `apps/desktop/CLAUDE_HANDOFF.md`.
- Version: desktop client `0.2.2` to `0.2.3` across `package.json`, `package-lock.json`, `tauri.conf.json`, `Cargo.toml`, `Cargo.lock`, and `.env.example`. No schema or environment-variable changes.
- Validation from `apps/desktop/`: added a case to `bundled-assets.test.ts` that parses the built `dist/index.html`'s CSP meta tag and asserts `connect-src` includes the real API origin; confirmed it fails against the pre-fix built output and passes after rebuilding with the fix. `npm run typecheck` passed (after fixing a `noUncheckedIndexedAccess` violation the new test introduced); `npm run lint` passed; `npm test` passed 13 files and 74 tests; `npm run build` passed; `cargo check` passed; `npm run tauri:build` passed and produced NSIS and MSI `0.2.3` installers; `git diff --check` passed.
- Installers built (not installed by these commands): NSIS `apps/desktop/src-tauri/target/release/bundle/nsis/Rock Frost Business Suite_0.2.3_x64-setup.exe` (3,481,355 bytes, SHA-256 `e19ba33a4d92c50749e59fef7fa5d44f71021133f83d2414044c1244b082e0c6`) and MSI `apps/desktop/src-tauri/target/release/bundle/msi/Rock Frost Business Suite_0.2.3_x64_en-US.msi` (4,763,648 bytes, SHA-256 `4d413e06ff26c16de7923b7c92a8b9f1432fb3189069f4edb884d24b3b3259ba`). No updater `.sig`: `TAURI_SIGNING_PRIVATE_KEY` is still not set in this environment, same disclosed gap as `0.2.2`.
- Installation on this machine: with the operator's explicit authorization, silently installed `0.2.3` over the previously-installed `0.2.2` (NSIS `/S`, exit code 0), confirmed via the Windows uninstall registry key that `DisplayVersion` now reads `0.2.3`, and confirmed the installed exe launches and stays running past a five-second smoke check.
- Real-world verification performed: installed-app startup smoke test only, as above. Real-world verification not performed: clicking Activate against the live production backend with a real activation code, for the same reason as the prior entry (no native WebView2 UI-automation tool in this environment). The operator's prior test used activation code `NH7ZZ-WAE2G`, generated before this fix and already past its 10-minute expiry by the time `0.2.3` was installed; a fresh code is needed to retest.
- Remaining risks: (1) end-to-end activation against production with a fresh code has still not been manually confirmed by an automated check, only by human retest; (2) the `0.2.3` updater `.sig` still needs generating by the signed release workflow; (3) Windows Authenticode signing remains pending, so Windows may show an Unknown publisher/SmartScreen warning; (4) this CSP defect existed since the CSP was first authored and was never previously exercised in production because activation never worked at all before today, so there is no way to know from this session alone whether any other production code path also silently depends on an API origin CSP does not allow. The activation and sync contract are the only network calls this desktop client makes (see `apps/desktop/src/sync/sync-client.ts`'s own docstring), so no other path is expected to be affected, but this has not been independently re-audited beyond that.
- Release: implementation committed to `agent/claude-desktop-fetch-binding-fix` and pushed to `origin`, alongside the `0.2.2` fetch-binding fix already on that branch. This commit (`ac1ffb1`) was subsequently pushed as a fast-forward directly onto `origin/main` with the operator's explicit authorization; see the CORS fix entry immediately below for the combined deployment record.
- Pre-existing files preserved: `Rock-Frost-Project-Status-Report.pdf`, `output/`, and `tmp/` remain untracked and untouched by this branch.

# 2026-08-16: Desktop API CORS fix, third defect found via live testing chain

- Scope: after the `0.2.1` to `0.2.2` fetch-binding fix (commit `e9f8cc1`) was merged to `main` and deployed, and after the `0.2.3` CSP `connect-src` fix above (commit `ac1ffb1`) was built and installed locally, the operator's live retest of Activate device still failed with `Failed to fetch`. This is a third, independent defect in the same activation path, on the server side rather than the desktop client, found through the same escalating live-test loop as the previous two. Worked on a new isolated branch, `agent/claude-desktop-cors-fix`, checked out from `origin/main` at `e9f8cc1`.
- Diagnosis: `curl -i -X OPTIONS https://app.rockfrostgroup.com/api/desktop/activate -H "Origin: https://tauri.localhost" -H "Access-Control-Request-Method: POST"` returned `204 No Content` with no `Access-Control-Allow-Origin` header. Vercel runtime logs for the project confirmed the real desktop app's own attempts (`OPTIONS /api/desktop/activate 204` at the exact times the operator clicked Activate) never produced a matching `POST` afterward: the browser's CORS check on the preflight response was failing silently before the browser would even attempt the real request, independent of the CSP fix.
- Root cause: none of the five desktop sync-contract routes (`activate`, `sync/push`, `sync/pull`, `sync/conflicts/{conflictId}/resolve`, `deactivate`) ever set any `Access-Control-*` header or defined an `OPTIONS` handler. Next.js auto-generates a bare `OPTIONS` response (`Allow` header only) for routes without one, which satisfies the HTTP method check but not the browser's CORS policy. This was never exercised before a cross-origin desktop client existed: the website itself only ever calls its own API same-origin.
- Fix: added `src/lib/offline-sync/desktop-cors.ts` (`DESKTOP_APP_ORIGIN = "https://tauri.localhost"`, matching the desktop app's default Tauri 2 Windows WebView2 origin; `withDesktopCors()` and `desktopPreflightResponse()`) and applied it to all five routes: each now exports `OPTIONS`, and every existing return point (success and every error path) is wrapped in `withDesktopCors(...)`. `Access-Control-Allow-Origin` is scoped to the exact desktop origin, not a wildcard, so no other cross-origin caller gains access to these endpoints.
- Important files: `src/lib/offline-sync/desktop-cors.ts` (new), `src/app/api/desktop/activate/route.ts`, `src/app/api/desktop/sync/push/route.ts`, `src/app/api/desktop/sync/pull/route.ts`, `src/app/api/desktop/sync/conflicts/[conflictId]/resolve/route.ts`, `src/app/api/desktop/deactivate/route.ts`, `test/desktop-cors.test.ts` (new), `docs/OFFLINE_DESKTOP.md`.
- Schema and environment: no schema migration, no new environment variable.
- Validation: added `test/desktop-cors.test.ts` (3 tests, DB-free: exercises route handlers directly, covering the preflight response for all five routes and that `Access-Control-Allow-Origin` is present on error responses too, not only success). Confirmed by stashing the fix that these tests fail against the pre-fix routes (the imported `OPTIONS` exports do not exist there). `npx tsc --noEmit` passed; `npx eslint` on the changed files passed; the full mocked suite passed 69 files and 379 tests (up from the prior 68 files / 376 tests baseline, plus the 3 new tests); `npm run build` passed; `git diff --check` passed. No disposable-database integration run is required: `authenticateOfflineDevice` rejects a missing/malformed bearer token before touching the database, so the new tests do not need one, and no schema or query changed.
- Release: this branch was merged with the `0.2.3` CSP fix branch, pushed to `origin/main` with the operator's explicit authorization, and deployed. `curl -X OPTIONS` against production confirmed `Access-Control-Allow-Origin: https://tauri.localhost` was present; a subsequent real-app retest by the operator still failed. See the following correction entry.
- Pre-existing files preserved: `Rock-Frost-Project-Status-Report.pdf`, `output/`, and `tmp/` remain untracked and untouched by this branch.

# 2026-08-16: Desktop CORS fix correction, hardcoded origin did not match the real app

- Scope: the previous CORS fix (commit `b34501f`, merged and deployed) was verified live with `curl` and appeared correct, but the operator's real retest against the actual desktop app still failed with `Failed to fetch`. Vercel runtime logs confirmed the real app's `OPTIONS /api/desktop/activate` reached the new deployment and still never produced a following `POST`.
- Root cause of the correction: `desktop-cors.ts` set `Access-Control-Allow-Origin` to a single hardcoded guessed value, `https://tauri.localhost`, regardless of what `Origin` header the request actually carried. The `curl` verification only proved the header was present; it did not prove the header's value matched the real desktop app's actual origin, because the `curl` command itself supplied `Origin: https://tauri.localhost` and the server echoed that same hardcoded constant back unconditionally, which would look identical whether or not it matched anything. `Access-Control-Allow-Origin` must exactly equal the request's real `Origin` for the browser to accept it; a mismatched hardcoded value fails silently client-side with `Failed to fetch`, indistinguishable from every prior cause of that message.
- Fix: `withDesktopCors()` and `desktopPreflightResponse()` now take the incoming `Request`, read its `Origin` header, and echo that value back only when it matches the general shape of a Tauri WebView2 origin (`/^https:\/\/[a-z0-9-]+\.localhost$/i`), with `Vary: Origin` set alongside it. An `Origin` that does not match is logged (`console.warn`) and receives no `Access-Control-Allow-Origin`, so no public website can gain access: forging that header shape requires the request to genuinely originate from something already running on the local machine under a `*.localhost` hostname, which the public internet cannot spoof.
- Important files: `src/lib/offline-sync/desktop-cors.ts`, all five desktop sync-contract routes (each `OPTIONS`/`withDesktopCors` call site now threads the request through), `test/desktop-cors.test.ts`, `docs/OFFLINE_DESKTOP.md`.
- Validation: extended `test/desktop-cors.test.ts` to 5 tests, adding a case proving a second, different desktop-shaped origin is also correctly reflected (not just the one specific value the old test happened to check) and a case proving a non-desktop origin gets no `Access-Control-Allow-Origin` at all. `npx tsc --noEmit` passed; `npx eslint` on the changed files passed; the full mocked suite passed 69 files and 381 tests; `npm run build` passed.
- Remaining verification gap: the exact `Origin` string the real desktop app sends was not directly confirmed (no server log currently recorded it, and no native WebView2 devtools access was available in this environment to inspect it directly). This fix accepts the correct shape rather than a single guessed literal specifically because that exact value could not be confirmed; if the real origin does not match `https://<host>.localhost` at all (an unexpected shape, not just a different host), this fix would not resolve it either, and the new `console.warn` log line is intended to surface that possibility in Vercel's runtime logs on the next real attempt.
- Pre-existing files preserved: `Rock-Frost-Project-Status-Report.pdf`, `output/`, and `tmp/` remain untracked and untouched by this branch.

# 2026-08-16: Desktop CORS fix, second correction, real origin uses http not https

- Scope: the pattern-matching CORS fix (commit `aa5dfcd`) was deployed, but the operator's next live retest still failed with `Failed to fetch`. This entry's own diagnostic `console.warn` line, added in the previous fix specifically to surface this possibility, worked exactly as intended: it logged the real rejected `Origin` in production.
- Diagnosis, this time with the exact value confirmed rather than guessed: Vercel runtime logs for the operator's retest showed `Desktop CORS: Origin did not match the expected desktop app pattern { origin: 'http://tauri.localhost' }`. The real desktop app sends plain HTTP, not HTTPS, for its own page origin, unlike the `https://asset.localhost` and `https://ipc.localhost` helper origins Tauri also uses (visible in the app's own CSP). The previous fix's pattern, `/^https:\/\/[a-z0-9-]+\.localhost$/i`, required `https` and rejected this real, legitimate origin outright.
- Fix: widened `DESKTOP_ORIGIN_PATTERN` in `src/lib/offline-sync/desktop-cors.ts` to `/^https?:\/\/[a-z0-9-]+\.localhost$/i`, accepting both schemes. No other logic changed.
- Important files: `src/lib/offline-sync/desktop-cors.ts`, `test/desktop-cors.test.ts`, `docs/OFFLINE_DESKTOP.md`.
- Validation: updated `test/desktop-cors.test.ts` to use the confirmed real origin `http://tauri.localhost` as its primary test value (previously an unconfirmed `https://tauri.localhost` guess) and extended the "different origin" case to assert both `http://tauri.localhost` and `https://tauri.localhost` are each correctly reflected. `npx tsc --noEmit` passed; `npx eslint` on the changed files passed; the full mocked suite passed 69 files and 381 tests; `npm run build` passed.
- Confidence: this is now based on a directly observed production log value, not a guessed shape, closing the specific gap called out as unresolved in the immediately preceding entry.
- Pre-existing files preserved: `Rock-Frost-Project-Status-Report.pdf`, `output/`, and `tmp/` remain untracked and untouched by this branch.

# 2026-08-16: Offline desktop expansion, milestone 1: adapter registry foundation

- Scope: the operator asked for a full redesign of the offline desktop client to reach real parity with the web app for POS and School (approved plan in `C:\Users\andre\.claude\plans\quizzical-dancing-crescent.md`), explicitly including genuinely high-risk actions offline (refunds, payment edits, exam publishing, settings), on the explicit understanding that server-side reconnect re-validation (not client trust) remains the safety mechanism. Fleet, Installment, and Inventory stay exactly as they are, out of scope. This is milestone 1 of 11: foundational server-side architecture, zero behavior change, on the 4 existing modules only. Worked in an isolated worktree/branch, `agent/claude-offline-registry-foundation`, checked out from `origin/main` at `55cc4e8`.
- What changed: `src/lib/offline-sync/adapters.ts` was a single flat `if/else` chain covering all 5 existing offline entity types; it does not scale to the ~33 new entity types the approved plan requires. Replaced it with a registry (new `src/lib/offline-sync/registry.ts`, `resolveHandler(entityType, operation)`) and one handler file per module (new `src/lib/offline-sync/modules/{fleet,installment,inventory,pos}.adapters.ts`), each a mechanical extraction of the corresponding original branch with identical permission-check order, identical zod payload schemas, and identical calls into the same `@/modules/<module>/service` functions the web UI itself calls. `adapters.ts` is now a thin dispatcher. Error classes (`OfflineMutationDeniedError`, `OfflineMutationConflictError`) moved to a new `src/lib/offline-sync/errors.ts` to avoid a circular import between `adapters.ts` and the new module files; `adapters.ts` re-exports both for the 4 existing call sites that import them from there.
- Deliberately deferred to milestone 4: widening `contract.ts`'s `operation` (currently `z.literal("CREATE")`) and `baseVersion` (currently `z.literal(0)`) types, which the approved plan lists as foundational. Checking the existing tests first found this would break two hard assertions: `test/offline-sync-contract.test.ts` explicitly asserts `baseVersion: 2` is rejected, and `test/offline-sync-security.test.ts` explicitly asserts `contract.ts` contains the literal substring `operation: z.literal("CREATE")`. Since milestone 1's own stated goal is zero behavior change on the 4 existing modules, `contract.ts` was left untouched this milestone; the type widening happens naturally in milestone 4, where POS's `pos.register` edit is the first real UPDATE case, and that milestone will update these two assertions deliberately alongside it.
- The registry itself does add one new capability used starting in milestone 4: an `OfflineAdapterHandler` can declare `operation: "UPDATE"` and a `loadCurrentVersion` function, and the dispatcher in `adapters.ts` checks `baseVersion` against it, converting a stale or deleted-record case into an `OfflineConflict` (`STALE_VERSION`/`ENTITY_DELETED`). This code path is unreachable today since no handler declares `operation: "UPDATE"` yet and `contract.ts` still rejects any `operation` other than `"CREATE"` at the schema boundary before it would ever reach the dispatcher, so it does not change current behavior; it exists now so milestone 4 does not need to touch the dispatcher again.
- Test coverage: strengthened `test/offline-sync-security.test.ts`'s existing "forbids high-risk mutation operations" check, which previously scanned only `adapters.ts`, to also scan every file under the new `src/lib/offline-sync/modules/` directory for the same forbidden substrings (`refundSale`, `recordFleetWorkAndPayPayment`, `HOSPITAL_`, `PHARMACY_`) - otherwise this refactor would have silently stopped covering anything once the real logic moved out of `adapters.ts` into the new per-module files. Added `test/offline-sync-registry.test.ts` (9 tests, DB-free): registry resolution, full dispatch success path, permission-denied path (before payload parsing), invalid-payload path, unsupported-operation path, unexpected-error wrapping into `SERVER_STATE_CHANGED`, a handler throwing `OfflineMutationDeniedError` directly from `apply()`, the new UPDATE/`baseVersion`/`loadCurrentVersion` branch (stale, deleted, and successful cases), and a check that all 5 original entity-type/operation pairs are still registered after the refactor.
- Validation: `npx tsc --noEmit` passed; `npx eslint` on the changed files passed; the full mocked suite passed 70 files and 390 tests (up from the prior 69 files / 381 tests, plus the 9 new registry tests, with every pre-existing test passing unmodified except the one security-test strengthening described above); `npm run build` passed; `git diff --check` passed. No disposable-database integration run was performed: `TEST_DATABASE_URL` is not configured in this environment, matching every prior release in this repository's history, and this milestone has no schema change and calls the exact same service-layer functions with the exact same arguments as before, so no new integration-tested code path is introduced.
- Schema and environment: none. No Prisma migration in this milestone.
- Documentation: added a "Server-side adapter architecture" section to `docs/OFFLINE_DESKTOP.md` explaining the registry pattern for whoever builds milestones 4 to 10 on top of it.
- Remaining risks: none specific to this milestone beyond the general risk inherent in a large multi-milestone project (11 milestones total per the approved plan) - this milestone alone changes no externally-observable behavior and adds no new capability a client can invoke yet.
- Release: this milestone was merged to `main` and deployed with the operator's authorization. Post-deploy checks confirmed `/api/health` returned HTTP 200, the `POST /api/desktop/activate` CORS preflight still returned `Access-Control-Allow-Origin: http://tauri.localhost`, and the Vercel error-log scan found no errors.
- Pre-existing files preserved: `Rock-Frost-Project-Status-Report.pdf`, `output/`, and `tmp/` remain untracked and untouched by this branch.

# 2026-08-16: Offline desktop expansion, milestone 2: server snapshot decomposition

- Scope: milestone 2 of 11 in the approved plan (`C:\Users\andre\.claude\plans\quizzical-dancing-crescent.md`). Rewrote `buildOfflineSnapshot` (`src/lib/offline-sync/service.ts`) from one nested JSON blob per module into a flat, per-entity row list, on the existing 4 modules only, with equivalent information content, not new content. At the operator's request, subsequent milestones will continue accumulating on this same branch, `agent/claude-offline-registry-foundation`, with pushes to `main` batched rather than one per milestone.
- Why now, and why milestone 3 (desktop client plumbing) is being done immediately after this one rather than deployed separately: the desktop client currently expects the old nested `{snapshot: {fleet: {...}, ...}}` shape. Deploying only this server-side change to `main` before the client catches up would leave any already-activated desktop device unable to parse a real pull response. No confirmed successful activation exists yet as of this session, which makes the practical risk low right now, but milestones 2 and 3 are being kept together in the same push-to-`main` batch on principle, so server and client wire formats never diverge in what actually reaches production.
- What changed: new `src/lib/offline-sync/snapshot-builders/{types,fleet,installment,inventory,pos}.ts`. Each builder owns exactly the row-level scoping the original nested-blob code already had (driver-assigned vehicles, installment staff-ownership scope via `resolveInstallmentAccessScope`, POS-only users' warehouse-by-open-session restriction and omitted cost prices) - moved, not changed. `buildOfflineSnapshot` now only decides which builders run for a device's `authorizedModuleKeys` and flattens their results with `Promise.all` + `flatMap`.
- Row shape: `{entityType, entityId, version, payload}`. `version` is `Math.floor(updatedAt.getTime())` for models with an `updatedAt` column (`fleet.vehicle`, `fleet.driver_profile`, `fleet.work_and_pay_contract`, `installment.account`, `inventory.item`, `inventory.stock`), or `0` for models without one (`inventory.warehouse`, `pos.session` - neither `InventoryWarehouse` nor `PosSession` has an `updatedAt` column in the schema, confirmed by reading `prisma/schema.prisma` directly rather than assumed). A `0` version is not a safety gap: nothing consumes it as an authoritative staleness signal for those two entity types today, and any subsequent mutation against them is still fully re-validated server-side regardless of what version the client thought it had.
- Two intentionally preserved quirks from the original code, not silently fixed: `fleet.work_and_pay_contract` rows are not counted toward the response's `truncated` flag (the original nested response never tracked truncation for that collection, only for vehicles), and `pos.session` rows are never truncated either (original used a fixed `take: 10` with no truncation tracking). Both are called out explicitly in code comments so a future milestone does not "fix" them as an unrelated side effect.
- Important files: `src/lib/offline-sync/service.ts`, `src/lib/offline-sync/snapshot-builders/*.ts` (new), `docs/OFFLINE_DESKTOP.md`.
- Validation: added `test/offline-snapshot-builders.test.ts` (10 tests, mocked `@/lib/db` and `@/modules/installment/access` following the existing `test/pass2-financial-inventory-integrity.test.ts` mocking convention): row shape and id/updatedAt-promoted-out-of-payload correctness per module, the driver-profile-omitted-when-absent case, truncation-flag equivalence to the original (including the two preserved quirks above), inventory-manage-vs-POS-only scoping (cost price presence, warehouse restriction), and `buildOfflineSnapshot`'s own composition logic (only the right builders run for a given `authorizedModuleKeys`, rows flatten correctly, `truncated` aggregates with OR across builders). `npx tsc --noEmit` passed with zero changes needed; `npx eslint` on the changed files passed; the full mocked suite passed 71 files and 400 tests (up from 70/390, plus the 10 new tests, zero regressions); `npm run build` passed; `git diff --check` passed.
- No disposable-database integration run was performed: `TEST_DATABASE_URL` is not configured in this environment, matching every prior release in this repository. The mocked builder tests above directly assert the Prisma `where`/`select` clauses passed to each mocked call, which is the same scoping logic a real-Postgres test would exercise; a milestone-11 hardening pass integration test extending `test/integration/tenant-isolation/*.test.ts` to the snapshot builders specifically remains the eventual real-database confirmation, per the approved plan's testing strategy.
- Schema and environment: none. No Prisma migration.
- Pre-existing files preserved: `Rock-Frost-Project-Status-Report.pdf`, `output/`, and `tmp/` remain untracked and untouched by this branch.

# 2026-08-16: Offline desktop expansion, milestone 3: desktop plumbing catch-up

- Scope: milestone 3 of 11 in the approved plan. Kept on the same `agent/claude-offline-registry-foundation` branch as milestones 1 to 2 (batched, per the operator's instruction), because deploying milestone 2's server-side row-list snapshot format without this client-side update would leave any already-activated desktop device unable to parse a real pull response.
- What changed: `apps/desktop/src/sync/sync-engine.ts`'s `pullSnapshot()` now iterates `response.rows` and calls `db.upsertCachedRecord` once per row (module key derived from the row's own `entityType` prefix), instead of one blob per module keyed `entityType: "<module>.snapshot"`. This is the change that makes `db.listCachedRecords(moduleKey, entityType)` return real, individually queryable pulled entities for the first time - previously it only ever returned locally-queued, not-yet-synced records, since nothing decomposed a pull into per-entity rows. Sync-cursor updates are still driven by `enabledModuleKeys` (same as before), independent of whether a given pull actually returned any rows for that module.
- Contract mirror updated to match: `apps/desktop/src/contract/sync-contract.ts`'s `OfflineSnapshot`/`SyncPullResponse.snapshot` replaced with `OfflineSnapshotRow`/`SyncPullResponse.rows`, matching the server's shape from milestone 2 exactly.
- Also widened, ahead of any code actually using it: `MutationOperation` from the literal `"CREATE"` to `"CREATE" | "UPDATE"`, and every `baseVersion: 0` literal type (`MutationEnvelope`, `QueuedMutationRecord`, `EnqueueMutationInput`, `RecordOfflineMutationInput`) to `number`. `mutation-queue.ts`'s `toMutationEnvelopes` now passes through `record.baseVersion`/`record.operation` instead of hardcoding `0`/`"CREATE"`. This is a pure type change with zero runtime behavior difference today: every one of the 4 existing module adapters still explicitly passes `operation: "CREATE", baseVersion: 0`, and the server's own `contract.ts` (deliberately left unwidened until milestone 4, per the milestone 1 entry) still only accepts that literal combination at the wire level regardless of what the desktop's local types now permit. Widening the desktop side now means it does not need to change again when the first real UPDATE case (a POS register edit, milestone 4) ships.
- Important files: `apps/desktop/src/sync/sync-engine.ts`, `apps/desktop/src/sync/mutation-queue.ts`, `apps/desktop/src/contract/sync-contract.ts`, `apps/desktop/src/db/schema.ts`, `apps/desktop/src/modules/offline-mutation-recorder.ts`, `apps/desktop/README.md`.
- Validation from `apps/desktop/`: updated `src/sync/sync-engine.test.ts` for the row-list format (asserts multiple rows across different entity types each become their own individually queryable `CachedRecord`, and that sync cursors are still set per enabled module even when a pull returns zero rows for it). `npm run typecheck` passed; `npm run lint` passed; `npm test` passed 13 files and 75 tests (up from 74, zero regressions in the pre-existing 74); `npm run build` passed. Root `test/editorial-punctuation.test.ts` passed with no em dash in any changed file. `git diff --check` passed.
- Schema and environment: none.
- Remaining risk carried into milestone 4: none of this milestone's changes are reachable by any client yet either, since `contract.ts`'s server-side schema still rejects anything other than `operation: "CREATE"`/`baseVersion: 0` at the wire level - the desktop's widened local types are inert until milestone 4 actually produces an UPDATE mutation.
- Pre-existing files preserved: `Rock-Frost-Project-Status-Report.pdf`, `output/`, and `tmp/` remain untracked and untouched by this branch.

# 2026-08-16: Offline desktop expansion, milestone 4: POS server adapters

- Scope: milestone 4 of 11 in the approved plan. All 7 POS offline actions (register create/edit, session open/close, sale, refund, both settings), server-side only, no desktop UI yet. Kept on the same batched `agent/claude-offline-registry-foundation` branch. This is the first milestone that actually widens the wire contract (`contract.ts`'s `operation`/`baseVersion`, deliberately left unwidened in milestones 1-3) and includes the project's first Prisma migration.
- Schema and environment: one migration, `prisma/migrations/20260816120000_add_pos_register_updated_at/migration.sql` - adds `updatedAt DateTime @updatedAt` to `PosRegister` (`prisma/schema.prisma`), the one model in scope that was missing the column every other optimistic-concurrency target already had. Purely additive (`ALTER TABLE ... ADD COLUMN ... DEFAULT CURRENT_TIMESTAMP`), backfills existing rows, no data loss, no other schema change. No new environment variable.
- **Migration verification gap, disclosed rather than glossed over**: this environment has no `TEST_DATABASE_URL` configured, so the migration has not been run locally against the guarded disposable test database `docs/TESTING_STRATEGY.md` requires before a schema change deploys. `.github/workflows/ci.yml`'s `integration` job triggers automatically on `push` to any `agent/**` branch (confirmed by reading the workflow file directly) and runs `npm run db:test:migrate` followed by the real-Postgres integration suite against a genuinely disposable Postgres service container - this is the actual gate for this migration, not a local run. Do not merge to `main` or deploy until that CI run is confirmed green; this will be checked and reported before any merge/deploy recommendation.
- Contract widening: `operation` is now `z.enum(["CREATE", "UPDATE"])` (was `z.literal("CREATE")`); `baseVersion` is now `z.number().int().min(0)` (was `z.literal(0)`). `OFFLINE_ENTITY_TYPES` gained the 6 new POS entity types: `pos.register`, `pos.session_open`, `pos.session_close`, `pos.sale_refund`, `pos.settings_receipt_footer`, `pos.settings_sale_prefix`. `activationSchema`'s `moduleKeys` cap stays at 4 (School is not added until its own later milestone).
- Design decisions worth recording:
  - **Event vs. edit**: `pos.session_open`, `pos.session_close`, and `pos.sale_refund` are modeled as `CREATE`-of-an-event (a client-generated correlation `entityId`, the real target id carried inside the payload - e.g. `sessionId`/`saleId`), not as an `UPDATE` against the target. There is no pre-existing local row to hold a `baseVersion` against before the server assigns the real target its id from a prior pull. Safety is the same service-layer guard every offline action already relies on: `openSession`'s one-open-session-per-register check, `closeSession`'s status check, and `refundSale`'s existing atomic `COMPLETED -> REFUNDED` claim (verified by reading `src/modules/pos/service.ts` directly - this guard already existed online and needed no changes for offline reuse).
  - **`pos.register` is the one genuine `UPDATE`**: `entityId` is the real register id, `baseVersion` is the cached `PosRegister.updatedAt`. A stale edit conflicts as `STALE_VERSION`; an edit against a deleted register (register deletion does not currently exist in `src/modules/pos/service.ts`, so this is a defensive path, not an exercised one today) conflicts as `ENTITY_DELETED`.
  - **`pos.settings_receipt_footer`/`pos.settings_sale_prefix` also `UPDATE`**, using a fixed `entityId: "default"` sentinel (one settings/config row per organization, already uniquely scoped by `organizationId`, so no further per-row id is meaningful). A missing settings/config row is treated as version `0` ("never configured"), not `ENTITY_DELETED`: `PosSettings` is get-or-create on first read (`getSettings` in `service.ts`), so absence is a legitimate baseline. The sale-number prefix has no dedicated column - it lives in `OrganizationModule.configuration` JSON (`getSaleNumberPrefix`/`updateSaleNumberPrefix`), so its version comes from that assignment row's own `updatedAt` instead of `PosSettings.updatedAt`.
  - **Sale-history naming collision avoided deliberately**: the expanded snapshot builder now pulls real sale history (needed for a future refund-target-selection UI), but names those rows `pos.sale_record`, not `pos.sale` - `pos.sale` is already the mutation entity type for creating a new sale, and reusing it for pulled history rows would collide two different meanings (a queued new sale vs. a read-only past one) under the same cache key shape.
  - **`refundSale` is a deliberate, approved exception** to the existing high-risk-action exclusion pattern, not an oversight: the operator explicitly chose full POS parity including refunds, with server-side re-validation (not client trust) as the safety mechanism. `test/offline-sync-security.test.ts`'s forbidden-string check was updated to allow `refundSale` specifically in `pos.adapters.ts` while still forbidding it (and Fleet's `recordFleetWorkAndPayPayment`, Hospital, Pharmacy) everywhere else, so an accidental future import into an out-of-scope module is still caught.
- Snapshot content expansion (`snapshot-builders/pos.ts`): now pulls registers (org-wide reference list, matching the warehouse-visibility precedent from milestone 2), sessions (org-wide for `pos.sessions.manage` holders, own-sessions-only otherwise - mirrors `listSessions()`'s own web-app scope), recent sales with lines (org-wide, bounded to 200, matching `listSales()`'s existing web-app cap), and one settings row per org (receipt footer plus sale-number prefix, the latter visible to any POS-authorized user since it is receipt-visible, not settings-editing-gated). `versionOf` (the timestamp-as-version helper) moved from `snapshot-builders/types.ts` to a new shared `src/lib/offline-sync/version.ts`, since both snapshot builders and the adapter registry's `loadCurrentVersion` checks now need it; `types.ts` re-exports it so the 3 existing builder files needed no import changes.
- Important files: `prisma/schema.prisma`, `prisma/migrations/20260816120000_add_pos_register_updated_at/migration.sql`, `src/lib/offline-sync/contract.ts`, `src/lib/offline-sync/version.ts` (new), `src/lib/offline-sync/modules/pos.adapters.ts`, `src/lib/offline-sync/snapshot-builders/{types,pos}.ts`, `docs/OFFLINE_DESKTOP.md`, `apps/desktop/README.md`.
- Validation: added `test/offline-pos-adapters.test.ts` (14 tests, exercised through the real `applyOfflineMutation` dispatcher, not a fake registry handler, since these entity types are now genuinely wired) covering permission gating per action, the `pos.register` `UPDATE` staleness/deletion checks, the session-open/close event pattern (payload carries the real target id, not the mutation's own `entityId`), refund permission and conflict-on-already-refunded, and both settings updates' version sourcing. Extended `test/offline-snapshot-builders.test.ts`'s POS section for the new content and session-visibility scoping. Updated `test/offline-sync-contract.test.ts` (the `baseVersion: 2` rejection assertion no longer holds now that `baseVersion` is a real number, replaced with `-1`/`1.5` rejection plus a new UPDATE-acceptance case) and `test/offline-sync-security.test.ts` (the exact-substring check for `operation: z.literal("CREATE")` updated to the new enum text; the `refundSale` forbidden-string check narrowed to exclude `pos.adapters.ts` specifically, as described above). `npx tsc --noEmit` passed; `npx eslint` on the changed files passed; the full mocked suite passed 72 files and 416 tests (up from 71/400, zero regressions in any pre-existing test beyond the two deliberately-updated assertions); `npm run build` passed; `git diff --check` passed; root `test/editorial-punctuation.test.ts` passed.
- Remaining risk: the migration's CI verification (see above) has not yet been confirmed at the time of this entry. No desktop client code or UI exists yet for any of these 7 actions - that is milestone 5.
- Pre-existing files preserved: `Rock-Frost-Project-Status-Report.pdf`, `output/`, and `tmp/` remain untracked and untouched by this branch.

# 2026-08-17: Offline desktop expansion, milestone 5: POS desktop UI

- Scope: milestone 5 of 11 in the approved plan. A real, six-tab offline POS terminal on the desktop client, replacing the generic one-button demo view for POS specifically (Fleet/Installment/Inventory keep using it, unchanged). Kept on the same batched `agent/claude-offline-registry-foundation` branch.
- What changed, desktop client:
  - `apps/desktop/src/contract/sync-contract.ts`: `OfflineEntityType` gained the 6 new POS mutation types plus the 3 pulled-only reference types (`pos.session`, `pos.sale_record`, `pos.settings`), matching milestone 4's server contract exactly.
  - `apps/desktop/src/modules/pos/types.ts`: payload interfaces for all 7 mutation types and record interfaces for the 4 pulled row shapes, each field matching the server's zod schema / snapshot builder payload exactly (cross-checked against `src/lib/offline-sync/modules/pos.adapters.ts` and `snapshot-builders/pos.ts` directly).
  - `apps/desktop/src/modules/pos/adapter.ts`: expanded from 1 function to 7, each a thin wrapper around the existing `recordOfflineMutation` (queue write + optimistic cache write together, unchanged pattern).
  - New `apps/desktop/src/modules/pos/pos-data.ts` (`usePosSnapshot` hook, reads all 4 pulled POS entity types via `db.listCachedRecords` into one shared shape), `pos-summary.ts` (pure `computePosSummary`, shared by Overview and Reports so the two never define "today"/"all-time" differently), `local-stock-overlay.ts` (non-authoritative in-memory low-stock hint for the Sell screen, per the approved plan's Inventory-coupling resolution - never enforced, never sent to the server).
  - New `apps/desktop/src/modules/pos/screens/{PosModuleShell,PosOverviewScreen,PosRegistersScreen,PosSellScreen,PosSalesHistoryScreen,PosReportsScreen,PosSettingsScreen,shared}.tsx`. `AppShell.tsx` now routes `selectedModule === "pos"` to `PosModuleShell` instead of `ModuleDetailView`; `ModuleDetailView.tsx`'s dead `pos` demo branch was removed and its prop type narrowed to `Exclude<OfflineModuleKey, "pos">` so it can no longer be called with a module it no longer handles.
  - `apps/desktop/src/conflict/conflict-policy.ts`: added `pos.sale_refund`, `pos.register`, `pos.settings` to `PROTECTED_ENTITY_TYPE_PREFIXES` (the "requires explicit review, never auto-resolved" UI badge list; `requiresExplicitResolution` already unconditionally returns `true` for every conflict regardless of this list, so this is a UI-clarity addition, not a behavior gate).
- A real design gap found and fixed while building the Settings screen, server-side: the single pulled `pos.settings` row had only one `version` field (from `PosSettings.updatedAt`), but it backs two independently-versioned mutation targets - the receipt footer (versioned by `PosSettings.updatedAt`) and the sale-number prefix (versioned by a *different* row's `updatedAt`, the `OrganizationModule` assignment, per milestone 4's own adapter). Sending the row's version as the prefix's `baseVersion` would have failed nearly every offline prefix edit as a false `STALE_VERSION` conflict, since the two timestamps are unrelated. Fixed in `src/lib/offline-sync/snapshot-builders/pos.ts`: fetches the `OrganizationModule` assignment row alongside everything else and adds a `saleNumberPrefixVersion` field to the settings row's payload, so the two settings each carry their own correct `baseVersion`. This is a server-side change discovered and made during desktop-UI work, not a separate milestone.
- Sell-screen design constraint, disclosed rather than worked around: `pos.session_open` is modeled as an event (client-generated correlation id; the server assigns the session's real id), and `createSale` requires that real `sessionId`. A session opened while offline therefore cannot be sold against until it has synced at least once. The Sell screen only lists sessions present in the last-pulled `pos.session` rows for this reason, and shows an explicit "needs to sync before you can sell against it" notice for one just opened offline, rather than silently failing a queued sale at sync time. Documented in `docs/OFFLINE_DESKTOP.md`'s new "Desktop client: POS" section and `apps/desktop/README.md`.
- Item picker: the Sell screen reads `inventory.item`/`inventory.stock` cached rows directly (a POS-only device already receives these narrowly-scoped rows per milestone 2's inventory snapshot builder - no new server change needed) for a catalog dropdown with a live low-stock hint, falling back to a free-text line for anything not in the catalog, matching `createSale`'s payload shape (`itemId` optional).
- Important files: `apps/desktop/src/contract/sync-contract.ts`, `apps/desktop/src/modules/pos/{types,adapter,pos-data,pos-summary,local-stock-overlay}.ts`, `apps/desktop/src/modules/pos/screens/*.tsx` (new), `apps/desktop/src/shell/{AppShell,ModuleDetailView}.tsx`, `apps/desktop/src/conflict/conflict-policy.ts`, `src/lib/offline-sync/snapshot-builders/pos.ts`, `docs/OFFLINE_DESKTOP.md`, `apps/desktop/README.md`.
- Validation: added `apps/desktop/src/modules/pos/{pos-summary,local-stock-overlay}.test.ts` (10 tests total) for the two new pure-logic modules, following this repo's existing convention of unit-testing logic modules directly rather than the React screens themselves (no existing `*Screen.test.tsx` precedent anywhere in `apps/desktop/src`; Playwright browser verification remains the plan's stated mechanism for UI-bearing milestones, not yet run in this entry). Updated `apps/desktop/src/conflict/conflict-policy.test.ts` for the 3 new protected-prefix entries. Updated `test/offline-snapshot-builders.test.ts` for the new `saleNumberPrefixVersion` payload field and its `organizationModule` mock. `apps/desktop`: `npm run typecheck` passed; `npm run lint` passed; `npm test` passed 15 files and 89 tests (up from 13/79, zero regressions); `npm run build` passed. Root: `npx eslint` passed; the full mocked suite passed 72 files and 416 tests (same count as milestone 4 - the snapshot-builder change edited existing assertions rather than adding new tests); `npm run build` passed; `test/editorial-punctuation.test.ts` passed. No `cargo check`/`tauri:build` this milestone: no `src-tauri` changes.
- Remaining risk: manual/Playwright browser verification of the 6 screens against a live activated device has not been performed in this session (no running desktop instance or test device available in this environment) - the validation above is typecheck/lint/unit-test/build only. The Sell screen's session-must-sync-first constraint is a real UX limitation, not a defect, but has not been exercised end-to-end against the live API. Milestones 6-10 (School) remain undone.
- Pre-existing files preserved: `Rock-Frost-Project-Status-Report.pdf`, `output/`, and `tmp/` remain untracked and untouched by this branch.

# 2026-08-17: Offline desktop expansion, milestone 6: School foundational slice

- Scope: milestone 6 of 11 in the approved plan - the first School milestone. Campus, academic year, and term: the reference data every later School milestone (students, enrollment, attendance, fees, exams) hangs off of, so deliberately the smallest possible slice, matching the plan's stated reason for shipping it first ("where School's scoping risk surfaces first, cheaply"). Kept on the same batched `agent/claude-offline-registry-foundation` branch (still not pushed).
- Research approach: read `src/app/app/school/actions.ts` (97 lines) and `src/modules/school/service.ts` (380 lines) in full - the entire School module's Server Actions and business logic in two files - plus every `SchoolCampus`/`SchoolAcademicYear`/`SchoolTerm`/... model in `prisma/schema.prisma` in one pass. This was deliberately more than milestone 6 alone needs: having the complete School surface (all 26 actions, all 23 models) in context now means milestones 7-10 will not need to re-derive it from scratch, even though each still ships and is validated as its own separate, reviewable increment per the plan's stated milestone rationale.
- What changed, server:
  - `src/lib/offline-sync/contract.ts`: `OFFLINE_SUPPORTED_MODULES` gained `"school"`; `activationSchema`/`activationCodeRequestSchema`'s `moduleKeys` cap raised `.max(4)` to `.max(5)`; `OFFLINE_ENTITY_TYPES` gained `school.campus`, `school.academic_year`, `school.term`.
  - New `src/lib/offline-sync/modules/school.adapters.ts`: 3 CREATE handlers (`school.campuses.manage` for campus, `school.academics.manage` for academic year and term), each calling the same `createSchoolCampus`/`createSchoolAcademicYear`/`createSchoolTerm` the web UI calls. All three are CREATE-only: there is no edit action for a campus, academic year, or term anywhere in `src/app/app/school/actions.ts` today, so no UPDATE variant was invented.
  - New `src/lib/offline-sync/snapshot-builders/school.ts`: pulls every campus (active only), academic year, and term for the organization - unlike Fleet/Installment/POS, no per-user ownership narrowing exists at this layer yet, matching how the web app's own academic-setup screens work (read access is not permission-gated the way write access is).
  - `src/lib/offline-sync/adapters.ts` and `service.ts`: registered `schoolOfflineAdapters` and wired `buildSchoolSnapshot` into `buildOfflineSnapshot`'s `authorizedModuleKeys` branches, following the exact pattern the other 4 modules already use.
  - No Prisma migration: `SchoolCampus` already has `updatedAt`; `SchoolAcademicYear` and `SchoolTerm` do not, so their rows use version `0`, the same established convention as `inventory.warehouse`/`pos.session` from earlier milestones (not a safety gap - any subsequent mutation is re-validated server-side regardless).
- What changed, desktop client:
  - `apps/desktop/src/contract/sync-contract.ts`: `OfflineModuleKey` gained `"school"`; `OfflineEntityType` gained the 3 new entity types.
  - New `apps/desktop/src/modules/school/{types,adapter,school-data}.ts` and `screens/{SchoolModuleShell,SchoolAcademicSetupScreen}.tsx` - structured like POS's equivalent files (a tab-bar shell over a shared snapshot hook) so each later School milestone adds a tab rather than a new top-level component. One tab ships now: Academic setup, with create-and-list sections for all three entity types.
  - `AppShell.tsx` now routes `selectedModule === "school"` to `SchoolModuleShell` (before `ModuleDetailView`'s fallback, same pattern as POS); `ModuleDetailView.tsx`'s `DemoModuleKey` narrowed further to exclude `"school"` alongside `"pos"`.
  - `ModuleLauncher.tsx` and `DeviceActivationScreen.tsx`'s module-tile/checkbox lists both gained a School entry.
  - Refactor discovered while building School's screens: `Field`/`inputStyle`/`selectStyle`/`ErrorText`/`SyncBadge`/`formatMoney`/`formatRelativeTime` lived in `apps/desktop/src/modules/pos/screens/shared.tsx`, which School's new screen would have had to import from - a module importing from another module's folder. Moved to `apps/desktop/src/components/form-fields.tsx` (alongside the existing `Button.tsx`/`Card.tsx` primitives) and updated all 6 POS screens' imports; `shared.tsx` deleted. No behavior change, just the right home for now-genuinely-shared code.
- Important files: `src/lib/offline-sync/{contract,adapters,service}.ts`, `src/lib/offline-sync/modules/school.adapters.ts` (new), `src/lib/offline-sync/snapshot-builders/school.ts` (new), `apps/desktop/src/contract/sync-contract.ts`, `apps/desktop/src/modules/school/**` (new), `apps/desktop/src/components/form-fields.tsx` (new, moved from `modules/pos/screens/shared.tsx`), `apps/desktop/src/shell/{AppShell,ModuleDetailView,ModuleLauncher,DeviceActivationScreen}.tsx`, `docs/OFFLINE_DESKTOP.md`, `apps/desktop/README.md`.
- Validation: added `test/offline-school-adapters.test.ts` (9 tests, exercised through the real `applyOfflineMutation` dispatcher) covering permission gating for all 3 actions, invalid-payload rejection, and that the service layer's own date-ordering/not-found errors surface as conflicts rather than crashes. Extended `test/offline-snapshot-builders.test.ts` with a School section (row shape/versioning, active-only campus scoping) and a `buildOfflineSnapshot` composition case for `authorizedModuleKeys: ["school"]`. Root: `npx tsc --noEmit` passed; `npx eslint` passed; the full mocked suite passed 73 files and 428 tests (up from 72/416, zero regressions, all new tests additive); `npm run build` passed. `apps/desktop`: `npm run typecheck` passed; `npm run lint` passed; `npm test` passed 15 files and 89 tests (unchanged count - this milestone added no new desktop-side pure-logic modules to unit-test, only UI/wiring, consistent with the no-`*Screen.test.tsx`-precedent noted in the milestone 5 entry); `npm run build` passed. No `cargo check`/`tauri:build`: no `src-tauri` changes. No disposable-database integration run: `TEST_DATABASE_URL` is not configured in this environment, matching every prior milestone; no schema migration this milestone either, so there is no new integration-tested code path.
- Remaining risk: manual/Playwright browser verification against a live activated device has not been performed (same disclosed gap as milestone 5). Milestones 7-10 (students/guardians/classes/enrollment/attendance, fees, exams, timetable/library/transport/payroll/settings) remain undone; School's offline scope today is limited to the 3 foundational entity types above, nothing else in the module works offline yet.
- Pre-existing files preserved: `Rock-Frost-Project-Status-Report.pdf`, `output/`, and `tmp/` remain untracked and untouched by this branch.

# 2026-08-17: Offline desktop expansion, milestone 7: School students, guardians, classes, subjects, enrollment, attendance

- Scope: milestone 7 of 11 in the approved plan, the heaviest remaining School milestone per the plan's own risk note (capacity checks, attendance close-window, cross-entity references). 8 new entity types: `school.student` (CREATE), `school.student_status_transition` (UPDATE - the module's second genuine UPDATE case after `pos.register`), `school.guardian`, `school.guardian_link`, `school.class`, `school.subject`, `school.enrollment`, `school.attendance` (all CREATE). Kept on the same batched `agent/claude-offline-registry-foundation` branch.
- What changed, server:
  - `src/lib/offline-sync/contract.ts`: `OFFLINE_ENTITY_TYPES` gained the 8 new types.
  - `src/lib/offline-sync/modules/school.adapters.ts` expanded from 3 to 11 handlers. `school.student_status_transition`'s `loadCurrentVersion` queries `db.schoolStudent.findFirst` for the cached `updatedAt`, the same pattern `pos.register`'s UPDATE handler established in milestone 4. Every other new handler is CREATE, calling the exact `@/modules/school/service` function the web UI calls (`createSchoolStudent`, `createSchoolGuardian`, `linkSchoolGuardian`, `createSchoolClass`, `createSchoolSubject`, `enrollSchoolStudent`, `recordSchoolAttendance`) - the service layer's own checks (class capacity in `enrollSchoolStudent`, the attendance correction window and future-date rejection in `recordSchoolAttendance`, the status state machine in `transitionSchoolStudent`) are reused unchanged, not reimplemented.
  - `src/lib/offline-sync/snapshot-builders/school.ts` expanded to also pull students, guardians, guardian links (`SchoolStudentGuardian`, its own row type since the model has no `updatedAt` and isn't naturally nested), classes and subjects (active only), active-only enrollments, and recent attendance (bounded to 500 rows via a dedicated `RECENT_ATTENDANCE_TAKE`, separate from the general collection cap, since attendance volume grows far faster than any other School collection - one row per student per class day).
- Design decision worth recording - **a referenced entity must already be synced before it can be referenced offline**: `school.student`, `school.guardian`, and `school.class` are CREATE-only entity types where the server assigns the real id (matching every other offline CREATE in this project - the client's id is a local placeholder, never the server's eventual real one). Enrollment, attendance, guardian-linking, and the student status transition all reference another entity's real id. This is the same constraint POS's Sell screen already applies to session selection (milestone 5), now much more central to School's workflow since students/guardians/classes are typically created and then immediately referenced in the same session. Addressed the same way: each screen's picker filters to already-synced rows only, with a visible explanation, rather than letting a doomed-to-conflict selection through silently.
- **A related latent gap found and fixed in milestone 5's POS work while reasoning through this same class of problem**: `PosSellScreen.tsx`'s `eligibleRegisters` (the "open a session" register picker) never filtered out registers still pending their own offline create, unlike the session/sale flows it sits next to. A register created offline and immediately selected to open a session against would have failed the session-open at sync time as a not-found, safely but avoidably. Fixed alongside this milestone's own picker filtering, same one-line fix pattern (`!r.hasPendingLocalChange`).
- What changed, desktop client:
  - `apps/desktop/src/contract/sync-contract.ts`: `OfflineEntityType` gained the 8 new types.
  - `apps/desktop/src/modules/school/{types,adapter,school-data}.ts` expanded with payload/record types and `createStudent`/`updateStudentStatus`/`createGuardian`/`linkGuardian`/`createClass`/`createSubject`/`enrollStudent`/`recordAttendance`.
  - `SchoolAcademicSetupScreen.tsx` gained Classes and Subjects sections (same `school.academics.manage` permission as academic year/term, so grouped in the same tab rather than a new one). New `SchoolStudentsScreen.tsx` (students with status-transition control, guardians, guardian links), `SchoolEnrollmentScreen.tsx`, `SchoolAttendanceScreen.tsx`, wired into `SchoolModuleShell.tsx` as 3 new tabs (Students & guardians, Enrollment, Attendance).
- Important files: `src/lib/offline-sync/{contract,modules/school.adapters,snapshot-builders/school}.ts`, `apps/desktop/src/contract/sync-contract.ts`, `apps/desktop/src/modules/school/**`, `apps/desktop/src/modules/pos/screens/PosSellScreen.tsx` (the register-picker fix), `docs/OFFLINE_DESKTOP.md`, `apps/desktop/README.md`.
- Validation: extended `test/offline-school-adapters.test.ts` from 9 to 26 tests covering permission gating for all 8 new actions, the student status transition's staleness/not-yet-synced (`ENTITY_DELETED`) conflict paths, and that class-capacity/attendance-window/state-machine errors surface as conflicts rather than crashes. Extended `test/offline-snapshot-builders.test.ts` with the 7 new row types (shape, versioning, active-only scoping for campuses/classes/subjects/enrollments). Root: `npx tsc --noEmit` passed; `npx eslint` passed; the full mocked suite passed 73 files and 446 tests (up from 428, zero regressions). `apps/desktop`: `npm run typecheck` passed; `npm run lint` passed; `npm test` passed 15 files and 89 tests (unchanged - no new desktop pure-logic modules this milestone, only UI/wiring and the one adapter/dispatcher pattern already unit-tested server-side); `npm run build` passed. Root `npm run build` also passed. No `cargo check`/`tauri:build`: no `src-tauri` changes. No disposable-database integration run: `TEST_DATABASE_URL` is not configured in this environment, matching every prior milestone; no schema migration this milestone either.
- Remaining risk: manual/Playwright browser verification against a live activated device has not been performed (same disclosed gap as milestones 5-6). Milestones 8-10 (fees, exams, timetable/library/transport/payroll/settings) remain undone. `medicalNotes` (free-text, potentially health-adjacent) is now included in the offline `school.student` snapshot payload under the same encrypted-local-storage policy as every other cached field - no new field-level redaction was added, matching this project's existing trust model, but worth the operator's awareness given the field's sensitivity.
- Pre-existing files preserved: `Rock-Frost-Project-Status-Report.pdf`, `output/`, and `tmp/` remain untracked and untouched by this branch.

# 2026-08-17: CI security gate fix - deepmerge-ts high-severity advisory

- Scope: unrelated to the offline desktop expansion. Milestones 2-7 were pushed to `main` (fast-forward, `45f2d4e..84050b7`) and confirmed via CI: `validate` (lint/typecheck/test/build) and `integration` (real disposable Postgres, all 37 migrations including milestone 4's `PosRegister.updatedAt`, 26 files / 136 tests) both passed. The `security` job's `npm audit --audit-level=high` step failed on a newly-disclosed high-severity advisory (GHSA-ggr8-5vv4-36mx, stack exhaustion merging recursive object graphs) in `deepmerge-ts@7.1.5`, a transitive dependency of `@prisma/config` (used only by Prisma's own CLI tooling - schema/config loading, not runtime request handling). Not caused by any of milestones 2-7: no `package.json`/`package-lock.json` change occurred in any of them, and this repository's own Prisma versions (`prisma`/`@prisma/client` at `^6.19.3`) were already current.
- Diagnosis: `npm audit`'s own suggested `npm audit fix --force` would have **downgraded** `prisma` to `6.12.0` (the last version predating `@prisma/config`'s dependency on `deepmerge-ts` at all) - not an acceptable direction, since it discards months of upstream fixes to chase a lower-severity indirect issue.
- Fix: added `"deepmerge-ts": "^8.0.0"` to `package.json`'s existing `overrides` block (already used for `exceljs`'s `uuid` and pinned `postcss`/`sharp` versions - an established pattern in this repository, not a new mechanism). `npm install` resolved `deepmerge-ts` to `8.0.1` without changing the installed `prisma`/`@prisma/client`/`@prisma/config` versions at all (`npm ls deepmerge-ts` confirms `prisma@6.19.3 > @prisma/config@6.19.3 > deepmerge-ts@8.0.1`).
- Important files: `package.json`, `package-lock.json`.
- Validation: `npm audit --audit-level=high` (the exact command the CI gate runs) now exits 0 with "found 0 vulnerabilities". `npx tsc --noEmit` passed; `npx eslint` passed; the full mocked suite passed 73 files and 446 tests (unchanged from the milestone 7 entry - no test-affecting change); `npm run build` passed, including the `postinstall` `prisma generate` step, confirming Prisma's config-loading path (the actual code that depends on `deepmerge-ts`) still works correctly with the overridden version. No disposable-database integration run locally (as with every prior entry); pushing this and re-checking the CI `integration` job serves as that confirmation, since it exercises the same `prisma generate`/migrate path this override touches.
- Remaining risk: none specific to this fix. `apps/desktop/` has its own separate `package.json` with no dependency on `prisma` or `deepmerge-ts` at all, so it needed no corresponding change or re-validation.
- Pre-existing files preserved: `Rock-Frost-Project-Status-Report.pdf`, `output/`, and `tmp/` remain untracked and untouched by this branch.

# 2026-08-17: Offline desktop expansion, milestone 8: School fees

- Scope: milestone 8 of 11 in the approved plan, its own milestone given financial-integrity risk (per the plan's explicit rationale). 4 new entity types: `school.fee_invoice` (ad-hoc single-student invoice, CREATE), `school.fee_payment` (CREATE), `school.fee_structure` (CREATE), `school.fee_structure_issuance` (CREATE, bulk fan-out event). Kept on the same batched `agent/claude-offline-registry-foundation` branch, pushed once already (through milestone 7 plus the CI dependency fix) and confirmed green on `main`.
- What changed, server:
  - `src/lib/offline-sync/contract.ts`: `OFFLINE_ENTITY_TYPES` gained the 4 new mutation types.
  - `src/lib/offline-sync/modules/school.adapters.ts` expanded to 15 handlers. All 4 new ones gated by `school.fees.manage`, calling `createSchoolFeeInvoice`, `recordSchoolFeePayment` (payload's `invoiceId` split out before the call, matching the pos.settings adapters' destructuring pattern), `createSchoolFeeStructure`, and `issueSchoolFeeStructure` respectively - the same service functions the web UI calls, no reimplemented logic.
  - **`school.fee_structure_issuance` is the bulk fan-out design called out in the approved plan**: modeled as a CREATE of an issuance *event* (payload only carries `feeStructureId`), not N individual invoice mutations. The eligible-student set is computed fresh at sync time from live enrollment data - the offline mutation is an instruction ("issue this structure now"), never a client-side snapshot of who to bill. Safety is double-covered: the ledger's `(organizationId, mutationId)` uniqueness prevents a retried push from re-running the whole fan-out, and `issueSchoolFeeStructure`'s own existing per-student dedup (skips anyone already invoiced for that structure) prevents a duplicate bill even if two devices queue the same issuance while both offline.
  - `src/lib/offline-sync/snapshot-builders/school.ts` expanded to pull fee invoices and active fee structures. **Fee invoice rows are named `school.fee_invoice_record`, not `school.fee_invoice`** - the same `pos.sale`/`pos.sale_record` naming split, for the same reason: most invoices come from the bulk fan-out, which has no per-invoice client mutation at all, so the mutation type and the pulled-reference type cannot honestly be the same thing under one cache key. Each pulled invoice row embeds its own `payments` array directly (mirrors `pos.sale_record`'s embedded `lines`), so the desktop can compute an outstanding balance without a separate per-payment cache read.
- What changed, desktop client:
  - `apps/desktop/src/contract/sync-contract.ts`: `OfflineEntityType` gained the 5 new types (4 mutations plus `school.fee_invoice_record`).
  - `apps/desktop/src/modules/school/{types,adapter,school-data}.ts` expanded with payload/record types and `createFeeInvoice`/`recordFeePayment`/`createFeeStructure`/`issueFeeStructure`.
  - New `apps/desktop/src/modules/school/fee-utils.ts` (`computeFeeInvoiceOutstanding`, a pure function mirroring `recordSchoolFeePayment`'s own outstanding-balance formula for display/form-guardrail purposes only - the server independently recomputes and enforces this at sync time). New `SchoolFeesScreen.tsx` (fee structures with an Issue button, ad-hoc invoice creation, and per-invoice payment recording), wired into `SchoolModuleShell.tsx` as a 5th tab.
  - **Recording a payment structurally requires an already-synced invoice**, not just by UI convention: the Fees screen's invoice list and payment picker read only from `school.fee_invoice_record` cached rows, and a just-created ad-hoc invoice (cached under the different `school.fee_invoice` entity type until synced) simply never appears there - no explicit "pending, cannot pay yet" filtering was needed, unlike milestone 7's student/guardian/class pickers, because the two entity types are disjoint by construction here.
  - `apps/desktop/src/conflict/conflict-policy.ts`: added a `school.fee_` prefix to `PROTECTED_ENTITY_TYPE_PREFIXES` (covers all 5 fee-related entity types in one prefix), matching when POS added its own sensitive-category prefixes in its own UI milestone (5) rather than waiting for the milestone-11 blanket `school.` hardening pass.
- Important files: `src/lib/offline-sync/{contract,modules/school.adapters,snapshot-builders/school}.ts`, `apps/desktop/src/contract/sync-contract.ts`, `apps/desktop/src/modules/school/{types,adapter,school-data,fee-utils}.ts` (new/expanded), `apps/desktop/src/modules/school/screens/SchoolFeesScreen.tsx` (new), `apps/desktop/src/conflict/conflict-policy.ts`, `docs/OFFLINE_DESKTOP.md`, `apps/desktop/README.md`.
- Validation: extended `test/offline-school-adapters.test.ts` from 26 to 36 tests covering permission gating for all 4 new actions, the fee-payment invoiceId-destructuring call shape, and that the balance-exceeded/inactive-structure service errors surface as conflicts rather than crashes. Extended `test/offline-snapshot-builders.test.ts` with fee invoice (embedded payments, `fee_invoice_record` naming, no `fee_invoice` row ever produced) and active-only fee structure coverage. Added `apps/desktop/src/modules/school/fee-utils.test.ts` (5 tests: no payments, discount, non-refunded payment, refunded payment ignored, floor at 0). Root: `npx tsc --noEmit` passed; `npx eslint` passed; the full mocked suite passed 73 files and 458 tests (up from 446, zero regressions). `apps/desktop`: `npm run typecheck` passed; `npm run lint` passed; `npm test` passed 16 files and 97 tests (up from 89); `npm run build` passed. Root `npm run build` also passed. No `cargo check`/`tauri:build`: no `src-tauri` changes. No disposable-database integration run: `TEST_DATABASE_URL` is not configured in this environment, matching every prior milestone; no schema migration this milestone either.
- Remaining risk: manual/Playwright browser verification against a live activated device has not been performed (same disclosed gap as milestones 5-7), including the bulk-issuance fan-out's real behavior against a large eligible-student set. Milestones 9-10 (exams, timetable/library/transport/payroll/settings) remain undone.
- Pre-existing files preserved: `Rock-Frost-Project-Status-Report.pdf`, `output/`, and `tmp/` remain untracked and untouched by this branch.

# 2026-08-18: Offline desktop expansion, milestone 9: School exams

- Scope: milestone 9 of 11 in the approved plan. 4 new entity types: `school.exam` (CREATE, shared between the mutation and the pulled-reference row - no bulk exam-creation path exists, so there is no dual-source split here unlike fees), `school.exam_result` (CREATE, upsert server-side by `examId_studentId`, same pattern as `school.attendance`), `school.exam_moderation_submit` and `school.exam_publish` (both CREATE events, not UPDATEs - `SchoolExam` has no `updatedAt` column, so there is no natural version to check a `baseVersion` against, the same reasoning that made `pos.session_open`/`pos.session_close` events rather than edits). Kept on the same batched `agent/claude-offline-registry-foundation` branch, pushed twice already (through milestone 8) and confirmed green on `main` both times.
- Grading-scale dependency reconsidered from the original plan text: the plan's milestone list flagged "depends on Settings being in the snapshot" for exams, written before the School service layer had been read in full. Having since read `recordSchoolExamResult` directly (milestone 6's research pass covered the entire School service file up front): the grading-scale-to-letter-grade derivation is entirely server-side (`resolveGradeFromScale` in `src/modules/school/service.ts`), applied only when the client's `grade` field is omitted. The offline client does not need `SchoolSettings` in its snapshot for correctness - it can simply leave `grade` blank and let the server derive it, same as it already lets the server derive receipt numbers, invoice numbers, and admission numbers. `SchoolSettings` is deferred to milestone 10's settings screen, where it is actually needed (to edit it, not merely to preview a grade).
- What changed, server:
  - `src/lib/offline-sync/contract.ts`: `OFFLINE_ENTITY_TYPES` gained the 4 new types.
  - `src/lib/offline-sync/modules/school.adapters.ts` expanded to 19 handlers. `school.exam_publish` is gated by `school.exams.publish`, a different permission from every other exam action's `school.exams.manage` - matching the web app's own `publishExamAction` exactly. `publishSchoolExam` returns a `$transaction` tuple (`[BatchPayload, SchoolExam]`); the handler destructures the second element.
  - `src/lib/offline-sync/snapshot-builders/school.ts` expanded to pull exams with their results embedded directly in each row (mirrors `school.fee_invoice_record`'s embedded `payments`) - there is no bulk, exam-independent way to create a result, so embedding needed no dual-source naming split the way fees did.
- What changed, desktop client:
  - `apps/desktop/src/contract/sync-contract.ts`: `OfflineEntityType` gained the 4 new types.
  - `apps/desktop/src/modules/school/{types,adapter,school-data}.ts` expanded with payload/record types and `createExam`/`recordExamResult`/`submitExamForModeration`/`publishExam`.
  - New `SchoolExamsScreen.tsx`: an exam list (create form, status, result count, contextual Submit-for-moderation/Publish buttons gated by the exam's own status) and a result-recording form. The result form's student picker reuses the exact class-then-enrolled-student filtering pattern `SchoolAttendanceScreen.tsx` (milestone 7) already established, and its exam picker excludes `PUBLISHED` exams (matching `recordSchoolExamResult`'s own status guard) and pending-not-yet-synced exams (matching the milestone 7/8 "must sync first" picker-filtering discipline). Wired into `SchoolModuleShell.tsx` as a 6th tab.
- Important files: `src/lib/offline-sync/{contract,modules/school.adapters,snapshot-builders/school}.ts`, `apps/desktop/src/contract/sync-contract.ts`, `apps/desktop/src/modules/school/{types,adapter,school-data}.ts`, `apps/desktop/src/modules/school/screens/SchoolExamsScreen.tsx` (new), `docs/OFFLINE_DESKTOP.md`, `apps/desktop/README.md`.
- Validation: extended `test/offline-school-adapters.test.ts` from 36 to 47 tests covering permission gating for all 4 new actions (including that `school.exams.manage` alone is insufficient for publish), and that out-of-range-marks/no-results/not-in-moderation service errors surface as conflicts rather than crashes. Extended `test/offline-snapshot-builders.test.ts` with exam-with-embedded-results coverage. Root: `npx tsc --noEmit` passed; `npx eslint` passed; the full mocked suite passed 73 files and 470 tests (up from 458, zero regressions). `apps/desktop`: `npm run typecheck` passed; `npm run lint` passed; `npm test` passed 16 files and 97 tests (unchanged - no new desktop pure-logic modules this milestone); `npm run build` passed. Root `npm run build` also passed. No `cargo check`/`tauri:build`: no `src-tauri` changes. No disposable-database integration run: `TEST_DATABASE_URL` is not configured in this environment, matching every prior milestone; no schema migration this milestone either.
- Remaining risk: manual/Playwright browser verification against a live activated device has not been performed (same disclosed gap as milestones 5-8). Milestone 10 (timetable, library, transport, payroll adjustments, settings screen) remains undone - it is the last planned milestone.
- Pre-existing files preserved: `Rock-Frost-Project-Status-Report.pdf`, `output/`, and `tmp/` remain untracked and untouched by this branch.

# 2026-08-18: Offline desktop expansion, milestone 10: School timetable, library, transport, payroll adjustments, settings

- Scope: milestone 10 of 11 in the approved plan, and the last School feature milestone - School now has the full offline parity approved for this expansion, with no remaining online-only School actions. 8 new entity types: `school.timetable_entry` (CREATE), `school.library_book` (CREATE), `school.library_loan` (CREATE, a borrow), `school.library_loan_return` (CREATE event - `SchoolLibraryLoan` has no `updatedAt` column, same reasoning that made `school.exam_moderation_submit`/`publish` events rather than edits), `school.transport_route` (CREATE), `school.transport_assignment` (CREATE, idempotent server-side via `assignSchoolTransport`'s own upsert on the route/student pair, the same guarantee `school.guardian_link` already relies on), `school.payroll_adjustment` (CREATE), and `school.settings` (UPDATE - the module's second genuine UPDATE after `school.student_status_transition`, but keyed by the campus's own id rather than the student's, since settings are per-campus; `loadCurrentVersion` returns `0` rather than `null` for a campus that has never had settings configured, matching `pos.settings_receipt_footer`/`sale_prefix`'s "never configured is not deleted" convention). Kept on the same batched `agent/claude-offline-registry-foundation` branch; the branch was pushed and confirmed green on CI (`integration`, `validate`, `security` all passed, run 32099361145) immediately before this milestone started.
- What changed, server:
  - `src/lib/offline-sync/contract.ts`: `OFFLINE_ENTITY_TYPES` gained the 8 new types.
  - `src/lib/offline-sync/modules/school.adapters.ts` expanded to 27 handlers, permission-gated per the web app's own `src/app/app/school/actions.ts` mapping (`school.timetables.manage`, `school.library.manage`, `school.transport.manage`, `school.payroll.manage`, `school.settings.manage`). `school.transport_route`'s `fee` field uses `z.number().min(0)` (allows zero, matching the web action's own schema), not the `moneyAmountPositive` string pattern used for invoice/exam amounts that must be strictly positive - the same distinction the existing `discount` field already established.
  - `src/lib/offline-sync/snapshot-builders/school.ts` expanded to pull timetable entries, active library books, all loans, active transport routes and assignments, payroll adjustments, and one settings row per campus. `school.settings` rows are keyed by `campusId`, not a synthetic row id, so the pulled row's entity id lines up with the UPDATE adapter's own `entityId` convention.
- What changed, desktop client:
  - `apps/desktop/src/contract/sync-contract.ts`: `OfflineEntityType` gained the 8 new types.
  - `apps/desktop/src/modules/school/{types,adapter,school-data}.ts` expanded with payload/record types and `createTimetableEntry`/`createLibraryBook`/`borrowLibraryBook`/`returnLibraryBook`/`createTransportRoute`/`assignTransport`/`createPayrollAdjustment`/`updateSettings`.
  - 5 new screens: `SchoolTimetableScreen.tsx`, `SchoolLibraryScreen.tsx` (books + loans, with a Return button gated to already-synced `BORROWED`/`OVERDUE` loans), `SchoolTransportScreen.tsx` (routes + assignments), `SchoolPayrollScreen.tsx`, and `SchoolSettingsScreen.tsx` (School's second UPDATE screen, with a repeatable grading-scale band editor). All follow the established picker-filtering discipline (`!hasPendingLocalChange`) for any field referencing another entity's real id. Wired into `SchoolModuleShell.tsx`, bringing it to 11 tabs - the full 14-page School surface.
  - `apps/desktop/src/conflict/conflict-policy.ts`: the narrow `"school.fee_"` prefix was widened to a blanket `"school."` prefix in `PROTECTED_ENTITY_TYPE_PREFIXES`, per the plan's explicit instruction - every School conflict, not just fee ones, now requires explicit user resolution (structurally already true before this change, since this client has no auto-resolve code path at all; the widened prefix documents and tests the guarantee for the newly-shipped types too).
- Important files: `src/lib/offline-sync/{contract,modules/school.adapters,snapshot-builders/school}.ts`, `apps/desktop/src/contract/sync-contract.ts`, `apps/desktop/src/modules/school/{types,adapter,school-data}.ts`, `apps/desktop/src/modules/school/screens/{SchoolTimetableScreen,SchoolLibraryScreen,SchoolTransportScreen,SchoolPayrollScreen,SchoolSettingsScreen,SchoolModuleShell}.tsx` (5 new, 1 modified), `apps/desktop/src/conflict/conflict-policy.ts`, `docs/OFFLINE_DESKTOP.md`, `apps/desktop/README.md`.
- Validation: extended `test/offline-school-adapters.test.ts` from 47 to 64 tests covering permission gating for all 8 new actions, the settings UPDATE's stale-version and never-configured-vs-deleted paths, and that state errors (timetable conflict, no available library copy) surface as conflicts rather than crashes. Extended `test/offline-snapshot-builders.test.ts` with a new test decomposing all 7 new row types plus the campus-keyed settings row. Extended `apps/desktop/src/conflict/conflict-policy.test.ts` with 2 new assertions confirming the blanket `"school."` prefix. Root: `npx tsc --noEmit` passed; `npm run lint` passed; the full mocked suite passed 73 files and 488 tests (up from 470, zero regressions); `npm run build` passed (full 194-page production build). `apps/desktop`: `npx tsc --noEmit` passed; `npm run lint` passed; `npm test` passed 16 files and 99 tests (up from 97); `npm run build` passed. No `cargo check`/`tauri:build`: no `src-tauri` changes. No schema migration this milestone - all 8 new models already existed without `updatedAt` except `SchoolSettings`, which already had one.
- Remaining risk: manual/Playwright browser verification against a live activated device has not been performed (same disclosed gap as milestones 5-9). This branch has not been re-pushed since this milestone; CI has not yet re-run against it. Only milestone 11 (hardening: conflict-policy review, activation-code module-cap UI, populate `OfflineConflict.cloudVersion`/`cloudSnapshot`, a Server-Action permission-test sweep) remains of the 11-milestone plan.
- Pre-existing files preserved: `Rock-Frost-Project-Status-Report.pdf`, `output/`, and `tmp/` remain untracked and untouched by this branch.

# 2026-08-18: Offline desktop expansion, milestone 11: hardening pass (final milestone)

- Scope: milestone 11 of 11, the final milestone of the approved offline expansion plan. Three items:
  1. **Populated `OfflineConflict.cloudVersion`/`cloudSnapshot`**, dead since the columns were added in the original offline-sync migration. `OfflineAdapterHandler.loadCurrentVersion` (`src/lib/offline-sync/registry.ts`) now returns `{ version, snapshot } | null` instead of a bare `number | null`. All 5 existing UPDATE handlers were updated to select and return a small snapshot alongside their version: `pos.register` (`name`/`warehouseId`/`active`), `pos.settings_receipt_footer` (`receiptFooterText`), `pos.settings_sale_prefix` (calls `getSaleNumberPrefix` since the value lives in `OrganizationModule.configuration` JSON, not a dedicated column), `school.student_status_transition` (`status`), `school.settings` (`attendanceCloseDays`/`receiptPrefix`/`allowRanking`/`gradingScale`). `OfflineMutationConflictError` (`errors.ts`) gained optional `cloudVersion`/`cloudSnapshot` constructor params, populated by `adapters.ts`'s dispatcher only for the `STALE_VERSION` case (`ENTITY_DELETED` has no record to snapshot, so both stay `null`, correctly - not a gap). `service.ts`'s conflict-persistence path now passes both through to `tx.offlineConflict.create`. Every other conflict type (`INVALID_PAYLOAD`, `UNSUPPORTED_OPERATION`, a business-rule `SERVER_STATE_CHANGED` rejection) still has no single current record to attach, so both columns correctly stay `null` there. This is forward-looking data plumbing, not a behavior change visible to users today: the client conflict-resolution flow still only offers `KEEP_CLOUD` (`apps/desktop/src/conflict/conflict-policy.ts`), so nothing renders this data yet - it exists so a future richer conflict UI has it already flowing through the pipeline without another server-side change.
  2. **Activation-code module-cap UI, checked, no code change needed.** `OFFLINE_SUPPORTED_MODULES`'s `.max(5)` was already correct (widened during milestone 4's contract redesign). The desktop-activation page (`src/app/app/(overview)/account/desktop/page.tsx`) and its form (`activation-code-form.tsx`) both derive their module checkbox list from `OFFLINE_SUPPORTED_MODULES` dynamically with no hardcoded count, so School's addition as a 5th module needed no UI change either. One real staleness was found and fixed while checking this page: its "Offline safety boundary" copy still listed "refunds" and "payroll" as blanket online-only, which stopped being true the moment POS refunds (milestone 4) and School's payroll adjustments (milestone 10) shipped as approved offline exceptions. Rewrote it to name Fleet/Installment/Inventory's online-only boundary separately from POS/School's approved exceptions, matching `docs/OFFLINE_DESKTOP.md`'s own framing.
  3. **Server-Action permission-test sweep, real gap found and fixed.** `test/module-access.test.ts`'s "guards every module page and action with its route module key" test statically scans every `page.tsx`/`actions.ts` under `src/app/app/<moduleKey>/` for the file requiring `requireModuleAccess("<moduleKey>")` and never calling `requireCurrentTenant` directly - but its `MODULE_KEYS` list never included `"school"` at all, across milestones 6-10, so School's 14 page.tsx files and 1 actions.ts file were never actually swept. Manually verified all 15 files first (a `grep`-based check outside the test framework) before touching the test: every one already correctly calls `requireModuleAccess("school")` and none calls `requireCurrentTenant` directly - this was a coverage gap in the regression test, not a live authorization bug. Added `"school"` to `MODULE_KEYS`; the sweep's page.tsx count rose from 80 to 94 and its actions.ts count from 50 to 51, both now passing.
- What did not change: no new entity types, no schema migration, no `apps/desktop` changes at all (confirmed via `git status` before starting and again before commit - this milestone is server/web/test-only).
- Important files: `src/lib/offline-sync/{registry,adapters,errors,service}.ts`, `src/lib/offline-sync/modules/{pos,school}.adapters.ts`, `src/app/app/(overview)/account/desktop/page.tsx`, `test/{module-access,offline-pos-adapters,offline-school-adapters,offline-sync-registry}.test.ts`, `docs/OFFLINE_DESKTOP.md`.
- Validation: root `npx tsc --noEmit` passed; `npm run lint` passed (one `react/no-unescaped-entities` error on the rewritten safety-boundary copy, fixed with `&apos;`); the full mocked suite passed 73 files and 488 tests (unchanged count - this milestone strengthened existing UPDATE-conflict test assertions with `cloudVersion`/`cloudSnapshot` expectations and widened `module-access.test.ts`'s sweep rather than adding new test files); `npm run build` passed (full 194-page production build). `apps/desktop` untouched, so its suite was not re-run (nothing to validate there). No `cargo check`/`tauri:build`: no `src-tauri` changes. No disposable-database integration run: `TEST_DATABASE_URL` is not configured in this environment, matching every prior milestone; this milestone added no integration-test coverage for the conflict-persistence path (`service.ts`'s `tx.offlineConflict.create` call) since it is straightforward field-passing already covered by TypeScript's compile-time check against the Prisma-generated `OfflineConflictCreateInput` type, not new business logic warranting a blind, unrun integration test.
- Remaining risk: manual/Playwright browser verification against a live activated device has not been performed for any milestone in this expansion (disclosed at every step, 5-11). This branch has not been pushed since milestone 10; CI has not yet re-run against milestones 10 and 11 together. This is the last milestone of the approved 11-milestone plan - the offline expansion (POS full parity, School full parity) is now feature-complete pending a final push, CI confirmation, and (per the user's standing batching instruction) the user's own `git push` to `main` when ready to release.
- Pre-existing files preserved: `Rock-Frost-Project-Status-Report.pdf`, `output/`, and `tmp/` remain untracked and untouched by this branch.

## 2026-08-18: Milestones 9-11 merged to main and verified in production

- The user ran `git push origin agent/claude-offline-registry-foundation:main` (fast-forward, no conflicts - `origin/main` was at milestone 8's `935be4e`), landing commit `42bcef3` (milestone 11) on `main`. CI on `agent/claude-offline-registry-foundation` had already confirmed green (`validate`, `integration`, `security`, run 32102988736) before this push.
- Vercel auto-deployed `dpl_2ZvhZAG5BFFZ7eQa53GdMKswKaHY` (commit `42bcef3`, target `production`) and reached `READY` at `2026-08-18T05:45:56Z`, aliased to `app.rockfrostgroup.com` with `aliasError: null`.
- Production verification: `GET /api/health` returned `{"ok":true,"database":"reachable"}`. The changed `/app/account/desktop` route (this milestone's copy fix) correctly redirected an unauthenticated request to login with clean 200/307 network activity, no errors. `get_runtime_errors` (Vercel) reported no runtime errors in the post-deploy window. `get_runtime_logs` grouped by status code showed only `200`/`307` in the 30 minutes following deploy, no `4xx`/`5xx`.
- The full 11-milestone offline expansion (POS full parity, School full parity: campus/academic-year/term through timetable/library/transport/payroll/settings, plus the registry/versioning/snapshot-decomposition foundation and this milestone's conflict-data hardening) is now live in production.
- Remaining risk, still open: manual/Playwright browser verification against a live activated desktop device has not been performed for any milestone in this expansion (disclosed at every UI-bearing milestone, 5-11) - the server-side behavior is CI- and now production-verified, but the actual offline desktop client screens (POS terminal, all 11 School tabs) have not been exercised end to end against a real device outside local Vitest coverage.
