# Desktop client handoff

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
