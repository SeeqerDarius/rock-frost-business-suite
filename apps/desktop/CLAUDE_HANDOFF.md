# Desktop client handoff

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
