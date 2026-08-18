# Rock Frost Business Suite Desktop

Local-first Windows client built with Tauri 2, React, and TypeScript. It uses an encrypted device-local SQLite store and communicates only with the Rock Frost desktop sync API. It never connects directly to Neon or PostgreSQL.

Version `0.2.0` introduces authenticated automatic updates. A user who already
has `0.1.1` must install `0.2.0` once because the older client does not contain
the updater. Starting with `0.2.0`, the application checks for updates at
startup, when connectivity returns, and every six hours while running.

Version `0.2.1` fixes a startup timer race that could replace a correctly
rendered activation or workspace screen with a false startup error.

Version `0.2.2` fixes device activation. The default `fetch` used by
`SyncClient` was not bound to a receiver, so WebView2 rejected it with
`Illegal invocation` on every activation attempt, before any request left the
device. A valid activation code, correct module selection, and a correct
local passcode did not matter: the request never reached the server, and the
single-use activation code was never consumed by a failed attempt.

Version `0.2.3` fixes a second defect that only became visible once `0.2.2`
let `fetch` actually run: the packaged Content-Security-Policy's
`connect-src` never allowed the real sync API origin, so every request was
blocked with `Failed to fetch`, which looks identical to a real network
outage. `connect-src` now allows `https://app.rockfrostgroup.com` in both
`index.html` and `src-tauri/tauri.conf.json`.

POS now has a real offline terminal (`src/modules/pos/screens/PosModuleShell.tsx`: Overview, Sell, Registers, Sales history, Reports, Settings) instead of the generic one-button demo view Fleet, Installment, and Inventory still use. See "Offline scope" below and `docs/OFFLINE_DESKTOP.md`'s "Desktop client: POS" section for what it can and cannot do fully offline.

Version `0.2.4` replaces the desktop's own hand-rolled `--rf-*` CSS-variable
theme and custom `Button`/`Card`/inline-style UI with the same Tailwind v4 +
shadcn/ui ("base-nova") stack the web app uses (`@tailwindcss/vite`,
`src/styles/globals.css` with the same OKLCH tokens as the web app's
`globals.css`, and `src/components/ui/*.tsx` copied from the web app). Every
POS and School screen, plus the shell (activation, lock screen, module
launcher, sync status bar) and conflict/update panels, now render with the
real shadcn components (`Select`, `Checkbox`, `Tabs`, `Card`, `Badge`, `Input`,
`Label`) instead of native `<select>`/`<input>` elements with inline styles.
`Button` and `Card` are kept as thin wrappers around the real
`ui/button.tsx`/`ui/card.tsx` components so the ~120 existing call sites
across the app did not need to change; every other primitive (`Select`,
`Checkbox`, `Tabs`, `Label`) was converted at each call site. This is a
presentation-only change: no adapter, sync, or offline-mutation logic moved.

Version `0.2.5` replaces the previous top-tab, card-grid module launcher with
a persistent, collapsible left sidebar (`src/shell/AppSidebar.tsx`) that
mirrors the web app's real navigation shell (`src/components/layout/app-shell.tsx`):
a grouped nav list per module (`src/shell/navigation.tsx`, matching the web
app's `schoolNavigation`/`posNavigation` groupings), a header module switcher
dialog (`src/shell/ModuleLauncher.tsx`, mirroring the web app's header
launcher), and a real School Overview dashboard screen
(`src/modules/school/screens/SchoolOverviewScreen.tsx`, stat tiles plus
attendance/fee section cards, matching the web app's `/app/school` page) that
did not exist before. `PosModuleShell`/`SchoolModuleShell` dropped their own
`Tabs` bar and now render whichever screen the sidebar selects. Presentation
and navigation only: no adapter, sync, or offline-mutation logic changed.

Version `0.2.6` fixes two defects the operator found on `0.2.5`. First, form
fields whose `Field` wrapper had a `hint` line (e.g. Exams' Name field, or
Exam Results' Grade field) rendered visibly out of line with their sibling
fields in the same row: every field row uses `items-end`, and a field with a
hint is taller than one without, so the shorter fields got pushed down to
match the taller one's bottom edge. `Field` (`src/components/form-fields.tsx`)
now always renders the hint line, invisible when absent, so every field in a
row has equal height regardless of which ones carry a hint. Second, data sync
only ran once at shell mount and on the manual "Sync now" button. A change
made after that first sync just sat as "pending sync" until someone
remembered to click the button, with no periodic resync at all.
`AppShell.tsx` now also auto-syncs every 60 seconds while the device is
unlocked and online.

## Activation

1. Sign in to the Rock Frost web application.
2. Open Account, then Desktop access.
3. Choose the allowed offline modules and generate a one-time activation code.
4. In the desktop app, enter the code, name the device, select only the modules authorized by the code, and set a local 4 to 8 digit unlock passcode.

The client does not collect or store a Rock Frost email or password. The activation code expires after 10 minutes and can be used once. The returned device bearer token is kept in the operating-system credential store abstraction. Cached business payloads remain in encrypted local persistence.

## Offline scope

Fleet, Installment, and Inventory accept append-only `CREATE` mutations for exactly these entity types:

- `fleet.maintenance_request`
- `fleet.driver_payment_submission`
- `installment.payment`
- `inventory.movement` (limited to `RECEIPT`/`ADJUSTMENT`)

Approvals, refunds, payroll, HR changes, accounting postings, pharmacy work, and clinical work remain online-only for those three modules.

POS is offline-capable end to end: `pos.sale`, `pos.register` (`CREATE`/`UPDATE`), `pos.session_open`, `pos.session_close`, `pos.sale_refund`, `pos.settings_receipt_footer` (`UPDATE`), `pos.settings_sale_prefix` (`UPDATE`) - including refunds and settings, deliberately, unlike the other three modules. `UPDATE` mutations carry a real `baseVersion` (the cached record's own version) rather than the fixed `0` every `CREATE` uses; a stale edit conflicts instead of silently overwriting. See `docs/OFFLINE_DESKTOP.md`'s "Online-only safety boundary" for why POS is the exception and what still bounds the risk. Every local write remains visibly pending until the server reports it as applied.

Selling requires an already-synced open session (its real `sessionId` must be known to the device): open the day's session while online, then sell offline against it for the rest of the day. See `docs/OFFLINE_DESKTOP.md`'s "Desktop client: POS" section.

School has the full offline parity approved for this expansion: `school.campus`, `school.academic_year`, `school.term`, `school.student`, `school.student_status_transition` (`UPDATE`), `school.guardian`, `school.guardian_link`, `school.class`, `school.subject`, `school.enrollment`, `school.attendance`, `school.fee_invoice`, `school.fee_payment`, `school.fee_structure`, `school.fee_structure_issuance`, `school.exam`, `school.exam_result`, `school.exam_moderation_submit`, `school.exam_publish`, `school.timetable_entry`, `school.library_book`, `school.library_loan`, `school.library_loan_return`, `school.transport_route`, `school.transport_assignment`, `school.payroll_adjustment`, `school.settings` (`UPDATE`, keyed by campus id). A fee payment requires an already-synced invoice, and a library loan requires an already-synced book and student; see `docs/OFFLINE_DESKTOP.md`'s "Desktop client: School" section.

## Sync contract

- `POST /api/desktop/activate` exchanges a one-time code and installation identity for a device token.
- `POST /api/desktop/sync/push` sends `{ mutations }`. The bearer token identifies the device.
- `GET /api/desktop/sync/pull` returns a bounded full snapshot. Cursor pagination is not part of contract version 1.
- `POST /api/desktop/sync/conflicts/{conflictId}/resolve` accepts only `{ resolution: "KEEP_CLOUD" }`.
- `POST /api/desktop/deactivate` accepts an empty JSON body and revokes the current bearer device.

The pull response can report `truncated: true`. This must be surfaced before a production installer is distributed because a truncated full snapshot is not a complete offline dataset. Push results may be `processing`, `applied`, `conflict`, or `rejected`. The client retries `processing` safely with the same mutation ID.

The pull response's `rows` field is a flat list of `{entityType, entityId, version, payload}`, one entry per pulled entity, not one nested object per module. `sync-engine.ts`'s `pullSnapshot()` upserts one `CachedRecord` per row, so `db.listCachedRecords(moduleKey, entityType)` returns real, individually queryable entities from the last pull, not just locally-queued ones.

## Development

```powershell
cd apps/desktop
npm install
npm run dev
```

Set `VITE_API_BASE_URL` in `.env`. Use the public application origin, such as `https://app.rockfrostgroup.com`. Do not place database credentials or server secrets in the desktop environment.

## Validation

```powershell
npm run typecheck
npm run lint
npm test
npm run build
npm run tauri:build
```

The Vite build must retain `base: "./"`. Tauri loads the bundled frontend
through its application protocol, so root-relative `/assets/*` references
produce a native window with a blank body in installed builds. The desktop
test suite checks the generated `dist/index.html` to prevent this regression.
WebView timer functions must also remain bound to `globalThis`; invoking a
stored unbound timer through another object raises `Illegal invocation` in
WebView2 before the first React screen can render.

The TypeScript checks validate the webview portion. The native Rust layer has also passed `cargo check`, and `npm run tauri:build` has produced x64 NSIS and MSI bundles.

WebView timer functions and `fetch` must both remain bound to `globalThis`. `SyncClient` is the only module that calls `fetch`, and its default fetch function is bound in the constructor so device activation and sync calls work under WebView2. The CSP `connect-src` in `index.html` and `src-tauri/tauri.conf.json` must include the real API origin, or WebView2 blocks every request with `Failed to fetch` regardless of how `fetch` is bound; `src/packaging/bundled-assets.test.ts` checks the built CSP for this.

## Desktop releases and automatic updates

The updater checks `https://app.rockfrostgroup.com/api/desktop/releases/latest`.
That endpoint validates and proxies the `latest.json` generated for the newest
public GitHub desktop release. When no release is available, it returns HTTP
204 so offline work and normal startup continue without interruption.

Updates require user confirmation. The app displays the available version,
downloads after the user selects Update and restart, verifies the Tauri
signature, installs in passive Windows mode, and restarts. The encrypted local
database, pending queue, credentials, and activation remain outside the
installation directory and survive installer replacement.

Run the `Desktop release` GitHub Actions workflow after increasing the version
in `package.json`, `Cargo.toml`, `Cargo.lock`, and `tauri.conf.json`. Configure
`TAURI_SIGNING_PRIVATE_KEY` and `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` as GitHub
Actions secrets first. The free Tauri update key authenticates update packages.
It is separate from a commercial Windows Authenticode certificate, which
identifies Rock Frost to Windows and reduces SmartScreen warnings. Public
releases remain enabled while Authenticode procurement is pending.
