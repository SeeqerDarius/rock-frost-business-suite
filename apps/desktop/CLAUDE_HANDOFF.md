# Desktop client handoff

## 2026-08-18 Field alignment fix and periodic auto-sync (0.2.5 to 0.2.6)

The operator screenshotted the Exams & Grading screen after installing
`0.2.5` and circled two visibly misaligned field groups on the Exams form
(Subject/Name) and the Record-a-result form (Student/Grade), asking to fix
these plus "the sync issue" (a pending-sync badge that stayed up despite the
device showing Online and a recent successful sync).

Root cause of the misalignment: `Field` (`src/components/form-fields.tsx`)
only rendered its `hint` paragraph when `hint` was provided, and every form
row uses `className="flex flex-wrap items-end gap-2.5"`. `items-end` aligns
each flex item's bottom edge to the row's cross-axis end line. A `Field` with
a hint (Name: "e.g. Midterm"; Grade: "Optional, auto-derived if blank") is
taller than a sibling `Field` without one, so the shorter field's whole box
gets pushed down to match the taller one's bottom - visibly dropping its
input relative to its neighbors. Fixed by always rendering the hint
paragraph, invisible (`className="invisible"`) when there's no hint text, so
every `Field` instance has the same box height and `items-end` has nothing
to misalign. This is the one shared primitive every real module screen's
forms already use, so the fix applies everywhere at once, not just Exams.

Root cause of the sync issue: there is no periodic sync anywhere in this
app. `AppShell.tsx` calls `syncNow()` exactly once, on shell mount; the only
other trigger is the manual "Sync now" button. A change queued after that
one mount-time sync just sits as "N changes pending sync" indefinitely -
correctly reflecting real, unsynced state, but with no way to clear itself
short of the user remembering to click the button. This was not a data-loss
or correctness bug (the mutation queue and its optimistic cache entry were
both genuinely correct), but it does not behave like an "offline-first,
syncs when it can" app should. Added a 60-second periodic auto-sync in
`AppShell.tsx`, gated on the device being unlocked (`!lockState.locked`) and
`navigator.onLine`, alongside the existing mount-time sync and manual button.

Validation from `apps/desktop/`: `npx tsc --noEmit` passed with zero errors;
`npm run lint` passed; `npm test` passed unmodified, 16 files and 99 tests;
`npm run build` compiled 2,134 modules. `cargo check` and
`npm run tauri:build` (native, `CARGO_TARGET_DIR=C:\rfdbuild`) produced NSIS
and MSI `0.2.6` installers in 4m03s. The built exe launched and stayed
responsive in a local smoke test. NSIS: 3,566,460 bytes, SHA-256
`91FED9FD5EF996527C9BE6A3C69F2A9415EDD0D3D8C305D0F57E1E3CE0944AC4`. MSI:
4,849,664 bytes, SHA-256
`6B60FC9CB27F57DB494413273423E871CF11FA81AFCB7DDDFB123DAE67C159A1`.

Not yet done: the operator has not confirmed the field alignment now looks
correct or that pending changes clear within a minute of being online.
Sent for manual install/testing, same as every previous version.

## 2026-08-18 Sidebar navigation to match the web app's real shell (0.2.4 to 0.2.5)

After installing and testing `0.2.4` (the shadcn/Tailwind component port), the
operator's feedback was that the desktop still did not look like the web app:
the web app uses a persistent left sidebar with grouped navigation and a real
Overview dashboard (screenshotted from `/app/school`); the desktop still had
the old top-of-page card grid (`ModuleLauncher`) to pick a module, then a
horizontal `Tabs` bar inside each module shell to pick a screen. The component
library was ported in `0.2.4`; the actual page layout/navigation architecture
was not, and that gap was the real complaint.

Read the web app's actual shell to copy it precisely rather than
approximating: `src/components/layout/app-shell.tsx` (sticky collapsible
sidebar, workspace header, section label, footer sign-out) and
`src/components/navigation/sidebar-nav.tsx` (grouped nav items with an
active-state left accent bar) render every `/app/*` page; each module's
`layout.tsx` (e.g. `src/app/app/school/layout.tsx`) supplies that module's own
`ModuleNavItem[]` (`src/modules/school/navigation.tsx`,
`src/modules/pos/navigation.tsx`) with a `group` field
(Overview/People/Academics/Finance/Services/Administration for School) that
`SidebarNav` renders as section headers. The header's module switcher
(`src/components/navigation/module-launcher.tsx`) is a dialog, not the card
grid the desktop had. `src/app/app/school/page.tsx` (the Overview page in the
screenshot) has no desktop equivalent at all - School's screen list started
at "Academic setup," with no Overview tab.

Built, adapted for a router-less Vite SPA (state, not `next/navigation`):
- `src/shell/navigation.tsx` (new): `POS_NAVIGATION`/`SCHOOL_NAVIGATION`/`DEMO_NAVIGATION`
  arrays with the same `group` groupings as the web app's nav configs.
- `src/shell/AppSidebar.tsx` (new): the actual sidebar + header + content
  shell, replacing `AppShell.tsx`'s old header-bar-plus-card-grid-plus-main
  layout. Owns `selectedModule`/`activeKey` state (switching module resets to
  that module's Overview); renders a local `SidebarNav` mirroring the web
  app's grouped-list-with-accent-bar rendering.
- `src/shell/ModuleLauncher.tsx` (rewritten): was a card grid rendered inline
  in the old shell body; now a header dialog triggered by a `Grid3x3` icon
  button, mirroring the web app's `module-launcher.tsx` exactly (same
  enabled/not-enabled card treatment). Still exports `MODULES` for
  `ModuleDetailView.tsx`'s existing import.
- `src/modules/school/screens/SchoolOverviewScreen.tsx` (new): stat tiles
  (active students, active classes, outstanding fees, overdue library loans)
  plus "Attendance to date" and "Fee position" section cards, computed from
  the already-cached `SchoolSnapshot` client-side (`computeFeeInvoiceOutstanding`
  for the fee math, matching `SchoolFeesScreen.tsx`'s own usage) - matches
  `src/app/app/school/page.tsx`'s layout and copy closely, scoped to what's
  cached on-device rather than a live server query.
- `PosModuleShell.tsx`/`SchoolModuleShell.tsx` (rewritten): dropped their own
  `Tabs`/`TabsList` UI entirely; now a plain `screen: string` prop switch that
  only owns the snapshot/reload hook wiring. The sidebar is the only
  navigation surface now, matching the web app where `Tabs` never appeared in
  this role.
- `AppShell.tsx` (rewritten): shrank to the activity-tracking/first-sync
  effects plus `<AppSidebar />`; the old inline header/card-grid/tabs JSX is
  gone.

Root cause of two false-start build attempts: this repository's `main`
working tree (as opposed to the worktree the `0.2.3`/`0.2.4` work happened in)
had never had `npm install` run in `apps/desktop/` since the merge that
brought in `0.2.4`'s new dependencies (`@tailwindcss/vite`, `@base-ui/react`,
etc.) and had a stale `dist/` from before the CSP fix. `npx tsc --noEmit`
failed on a missing `@tailwindcss/vite` module and an unrelated
duplicate-`@types/react` structural error until `npm install` was run here
directly; `npm test` failed one CSP-content assertion until `npm run build`
regenerated `dist/index.html` in this same tree. Neither was a real code
defect; both were this working tree's own dependency/build-artifact staleness.

Validation from `apps/desktop/`: `npx tsc --noEmit` passed with zero errors;
`npm run lint` passed; `npm test` passed unmodified, 16 files and 99 tests (no
test touches `AppShell`/`AppSidebar`/`ModuleLauncher` directly, so none needed
updating); `npm run build` compiled 2,134 modules. A live browser preview of
the Vite dev server was not attempted: the app's activation gate requires the
real Tauri device-lock/credential-manager/encrypted-SQLite stack, which does
not exist outside the packaged native app, so `AppShell` renders nothing
(`if (!device) return null`) under a plain browser. `cargo check` and
`npm run tauri:build` (native, `CARGO_TARGET_DIR=C:\rfdbuild`, reused from the
`0.2.4` build so only the frontend and the `rock-frost-desktop` crate itself
needed rebuilding) produced NSIS and MSI `0.2.5` installers.

Not yet done: the operator has not yet seen the new sidebar rendered in the
real app. Sent for manual install/testing, same as every previous version.

## 2026-08-18 Tailwind v4 + shadcn/ui UI port from the web app (0.2.3 to 0.2.4)

The user asked, after testing the previous milestones' UI, whether the
desktop app could look exactly like the web app. It could not: the desktop
client had its own hand-rolled `--rf-*` CSS-variable theme (`theme.css`) and
custom `Button`/`Card` components with inline `style={{}}` objects on every
screen, sharing no code or visual identity with the web app's real Tailwind
v4 + shadcn/ui ("base-nova") stack. The user chose a full port over keeping
the lightweight custom UI.

Ported: `@tailwindcss/vite`, `src/styles/globals.css` (replaces `theme.css`,
same OKLCH token names/values as the web app's `globals.css`), `src/lib/utils.ts`
(`cn()`), and all 26 `src/components/ui/*.tsx` shadcn files copied from the
web app (2 fixes needed: `sonner.tsx` had a `next-themes` dependency the
desktop doesn't have, hardcoded to `theme="system"` instead; `scroll-area.tsx`
had an unused import that only failed under the desktop's stricter
`noUnusedLocals` tsconfig).

`Button` and `Card` became thin wrappers around the real `ui/button.tsx`/
`ui/card.tsx`, keeping their existing simplified call-site API
(`variant="primary"|"secondary"|"ghost"|"destructive"`, `loading?`) so the
roughly 120 existing call sites did not need to change, while still
rendering 100% real shadcn CSS underneath. Every other primitive was
converted at each call site across all 32 screen/shell files: native
`<select>` to the compound `Select`/`SelectTrigger`/`SelectValue`/
`SelectContent`/`SelectItem` API, native `<input>`/checkbox to `Input`/
`Checkbox`, and every inline `style={{}}` layout object to Tailwind
utility classes.

Two non-obvious gotchas: Base UI's `Select` `onValueChange` signature is
`(value: string | null, ...) => void`, unlike a native `<select>`'s
always-string `e.target.value` - every conversion site needed a
`value ?? ""` or sentinel-value guard. Base UI's `SelectItem` also does not
support an empty-string `value`, so existing "no selection" / placeholder
states (custom sale line, no-guardian, change-status) use string sentinels
(`__custom__`, `__none__`, `__change_status__`) translated to `""` at the
component boundary, unchanged in behavior from before the port.

This is presentation-only: no adapter, sync-engine, mutation-queue, or
offline-mutation logic changed. `git status` before starting showed no
uncommitted or concurrent work in `apps/desktop/`; nothing outside
`apps/desktop/` was touched.

Validation from `apps/desktop/`: `npx tsc --noEmit` passed with zero errors
across the full app; `npm run lint` passed; `npm test` passed unmodified,
16 files and 99 tests (no DOM-structure-dependent test needed updating);
`npm run build` compiled 2,130 modules. `cargo check` and
`npm run tauri:build` (native, `CARGO_TARGET_DIR` pointed outside the
worktree to avoid the Windows `MAX_PATH` issue from the previous entries)
produced NSIS and MSI `0.2.4` installers in 15m40s, an incremental build
since only the frontend changed. The built exe launched and stayed
responsive in a local smoke test. NSIS installer: 3,564,760 bytes, SHA-256
`79D88FDC277773BAD9E069CE016915CE76C4F2C6C8FBEAA496C79946090AE094`. MSI
installer: 4,845,568 bytes, SHA-256
`BEF5FB5C3FB3F8BC78CA6EEB5AAEFE0831FD3F74EFFBD77E8C5B494ABFA7FAEE`.

Two build-toolchain retries were needed before this succeeded: invoking the
known-working batch script via `cmd.exe /c "<path>"` from this session's Bash
tool produced no output and exited immediately (the script never actually
ran); invoking the same `.bat` directly instead worked, but then failed with
`'tsc' is not recognized` because this session's inherited `PATH` had grown
enormous (many Claude plugin bin directories accumulated over a long
conversation) and combining that with `vcvarsall.bat`'s own additions likely
exceeded a length limit somewhere in the chain, corrupting `npm`'s own
`node_modules/.bin` prepend for the child `tsc` process. Fixed by resetting
`PATH` to a short, explicit list (System32, Node, cargo, Strawberry Perl/NASM)
before calling `vcvarsall.bat`, instead of layering onto the inherited one.

Not yet done: manual install and UI walkthrough on a live Windows machine to
confirm the ported UI actually renders as intended (screens, dark/light
tokens, Select/Checkbox/Tabs behavior) - sent to the operator for that.

## 2026-08-16 CSP connect-src fix, found via live install testing (0.2.2 to 0.2.3)

After installing and manually testing `0.2.2` on a real Windows machine, the
operator reported a new error on Activate device: `Failed to fetch`, instead
of the fixed `Illegal invocation`. This confirmed the fetch-binding fix
below worked, but exposed a second, previously-unreachable defect.

Root cause: `apps/desktop/src-tauri/tauri.conf.json`'s `app.security.csp`
(duplicated in `apps/desktop/index.html` for `vite dev`) sets `connect-src`
to `'self' ipc: https://ipc.localhost` only. It never allowed the real sync
API origin. WebView2 enforces this CSP exactly like a browser enforces a
page's CSP header: any `fetch()` to `https://app.rockfrostgroup.com` is
blocked before the request leaves the renderer, and the promise rejects with
a generic `TypeError: Failed to fetch` - indistinguishable in the UI from an
actual network outage. Diagnosis: raw TCP to `app.rockfrostgroup.com:443`
from the test machine succeeded (`Test-NetConnection`), ruling out a real
connectivity problem; no `apps/desktop/.env` override existed, so the app
was using the documented default origin; the CSP string was the only thing
left that could reject a well-formed, correctly-bound `fetch()` call.

This was invisible during `0.2.1`/`0.2.2` development and their automated
tests because the fetch-receiver bug always threw before the CSP was ever
evaluated - fixing one bug was necessary to discover the other.

Also found and fixed in passing: `apps/desktop/.env.example` documented
`VITE_API_BASE_URL=https://api.rockfrostgroup.com`, an origin that does not
exist; the real production origin (matching the CSP, the docs, and every
other reference in this repository) is `https://app.rockfrostgroup.com`.

Fix: added `https://app.rockfrostgroup.com` to `connect-src` in both
`tauri.conf.json` and `index.html`, and corrected `.env.example`.

Test: added a case to `apps/desktop/src/packaging/bundled-assets.test.ts`
that parses the built `dist/index.html`'s CSP meta tag and asserts
`connect-src` contains the real API origin. Verified it fails against the
pre-fix built output and passes after rebuilding with the fix.

Version: `0.2.2` to `0.2.3` across the same manifest set as the previous
entry.

Validation from `apps/desktop/`: `npm run typecheck` passed (after fixing a
`noUncheckedIndexedAccess` type error in the new test); `npm run lint`
passed; `npm test` passed 13 files and 74 tests; `npm run build` passed;
`cargo check` and `npm run tauri:build` passed and produced NSIS and MSI
`0.2.3` installers. `git diff --check` passed.

Installed `0.2.3` over the previous `0.2.2` install on this machine (silent
NSIS `/S`) and confirmed the exe launches and stays running. Clicking
Activate against the live backend with a fresh code was handed back to the
operator to retest, since this environment still has no native WebView2
UI-automation tool - the same disclosed limitation as the previous entry.

## 2026-08-16 activation fetch-binding fix (0.2.1 to 0.2.2)

Production symptom: a customer entering a valid activation code, selecting
authorized modules, setting a local passcode, and clicking Activate device
saw `Failed to execute 'fetch' on 'Window': Illegal invocation` instead of
activating.

Root cause: `apps/desktop/src/sync/sync-client.ts` stored WebView2's native
`fetch` as a bare reference (`this.fetchFn = options.fetchFn ?? fetch`) and
later called it as `this.fetchFn(...)`. WebView2's native `fetch` requires
`window`/`globalThis` as its call receiver; calling it as a `SyncClient`
method makes `this` the `SyncClient` instance instead, which WebView2
rejects immediately with `Illegal invocation`. This is the same receiver-
sensitivity class of bug already fixed for `setInterval`/`clearInterval` in
`apps/desktop/src/security/device-lock.ts`.

Why activation details were not the cause: the throw happens synchronously
inside the `fetch` call itself, before any request is constructed or sent.
The activation code, device name, module selection, and passcode are never
inspected by this failure path, and the server's `POST /api/desktop/activate`
handler (`src/app/api/desktop/activate/route.ts`) never runs, so the
single-use activation code is never claimed or consumed by a failed attempt.

Fix: bind the default fetch function once in the constructor -
`this.fetchFn = options.fetchFn ?? globalThis.fetch.bind(globalThis)` - so
every call site can keep calling `this.fetchFn(...)` without re-checking the
receiver. Caller-supplied `fetchFn` overrides (used throughout the existing
test suite) are left untouched and are never rebound.

Audit: searched `apps/desktop/src` for other retained references to
receiver-sensitive native functions (`fetch`, `setInterval`, `setTimeout`,
`localStorage`, `navigator`, `requestAnimationFrame`, and similar). The only
instance found was this one; every other usage (`window.setInterval(...)`,
`window.localStorage`, `navigator.onLine`, and the already-bound
`device-lock.ts` timers) already calls through the correct receiver at the
call site.

Tests: added `apps/desktop/src/sync/sync-client.test.ts` (7 tests). One test
simulates a receiver-sensitive host `fetch` (throws unless called with
`globalThis` as `this`) and proves the default path now activates
successfully; verified this same test fails with the pre-fix line
(`this.fetchFn = options.fetchFn ?? fetch`) reproducing the exact
`Illegal invocation` error, then re-verified it passes with the fix restored.
Other tests cover the exact POST path and body, those it does not fabricate
a resolved response when the local fetch call throws before any request is
sent, and that a successful response is only used after the awaited fetch
promise resolves.

Version: `package.json`, `src-tauri/tauri.conf.json`, `src-tauri/Cargo.toml`,
`src-tauri/Cargo.lock`, and `.env.example` moved from `0.2.1` to `0.2.2`.

Validation from `apps/desktop/`: `npm run typecheck` passed; `npm run lint`
passed; `npm test` passed 13 files and 73 tests; `npm run build` passed
(Vite, 1,634 modules); `cargo check` passed (via a shared `CARGO_TARGET_DIR`
pointing at the main worktree's already-built OpenSSL cache, because this
worktree's local `perl` is missing `Locale::Maketext::Simple` and cannot
build `openssl-sys` from source on its own - an environment gap, not a code
issue); `npm run tauri:build` passed and produced both the NSIS and MSI
`0.2.2` bundles. The root `test/editorial-punctuation.test.ts` passed with no
em dash in any changed source file. The packaged release exe was launched
directly (not installed) and stayed running past a five-second smoke check.
Clicking Activate against a real backend with a real activation code was not
performed in this environment (no native WebView2 UI-automation tool is
available here, and no safe production credentials or activation code were
available); this remains an honest manual verification step for whoever
installs the built package.

Important files: `apps/desktop/src/sync/sync-client.ts`,
`apps/desktop/src/sync/sync-client.test.ts`, `docs/OFFLINE_DESKTOP.md`,
`apps/desktop/README.md`, desktop version manifests, and
`OPERATOR_HANDOFF.md`.

## 2026-08-15 contract reconciliation

The desktop TypeScript client was reconciled with offline sync contract version 1.

Changed behavior:

- Replaced email and password activation with a one-time activation code, installation ID, device name, selected modules, and a local unlock passcode.
- Removed refresh-token assumptions. The server issues one device bearer token with explicit token and offline-access expiry times.
- Added tenant and user metadata from the activation response so queued mutations can carry the required organization assertion.
- Changed push requests to `{ mutations }` and removed `deviceId` from the body.
- Restricted mutations to uppercase `CREATE`, `baseVersion: 0`, and the five entity types currently implemented by the server.
- Replaced cursor pagination with the bounded full-snapshot pull response.
- Restricted conflict resolution to `KEEP_CLOUD`.
- Changed deactivation to an empty authenticated POST.
- Preserved encrypted persistence, stable mutation IDs, local pending badges, bounded batches, remote-revocation purge, and local passcode locking.

Conflict results now include the server conflict ID and allowed resolutions. The desktop stores that real identifier and can submit the only supported resolution, `KEEP_CLOUD`. It never invents retry-local or merge behavior.

The pull response is a full reference-data snapshot and may report `truncated: true`. The current cache stores one snapshot record per module. A production user interface must prevent users from assuming a truncated collection is complete.

After reconciliation, the native Rust source was compile-checked with Rust 1.97.1 and Visual Studio Build Tools. One missing `tauri::Manager` import was found and fixed. The full optimized Tauri build then produced working NSIS and MSI bundles, and the release executable remained alive during a five-second startup smoke test. Windows installer signing and signed-update configuration are still required before customer distribution.

Validation from `apps/desktop/`:

- `npm run typecheck`: passed with no errors.
- `npm run lint`: passed with no errors or warnings.
- `npm test`: 10 files and 60 tests passed.
- `npm run build`: passed. Vite transformed 1,629 modules and produced a 240.17 kB JavaScript bundle (73.31 kB gzip).
- `cargo check`: passed after the Tauri trait-import fix.
- `npm run tauri:build`: passed and produced x64 NSIS and MSI bundles.
- Release executable startup smoke: passed.
