# Rock Frost Business Suite, Desktop (Windows)

A local-first Windows desktop client for the Rock Frost Business Suite, built with Tauri 2, React, and TypeScript, backed by an encrypted device-local SQLite database. This package is fully self-contained: its own `package.json`, its own TypeScript/ESLint/Vitest configuration, and its own Rust crate under `src-tauri/`. It is not part of the root Next.js application's npm workspace, build, or deploy pipeline, and it never connects to Neon/PostgreSQL directly. Everything it knows about the cloud comes through five HTTP endpoints, documented in `src/contract/sync-contract.ts`.

See `CLAUDE_HANDOFF.md` in this directory for the full handoff record: what was built, what was validated, and what remains unverified in the environment this was built in.

## Why local-first

Fleet staff, installment collectors, cashiers, and warehouse staff regularly work with poor or no internet access. This client lets them keep working. Every business record created offline is written to an encrypted local database immediately, queued for sync, and clearly marked "Pending sync" until the server confirms it. Nothing offline is ever presented as cloud-confirmed before that confirmation actually arrives.

## Architecture at a glance

```
apps/desktop/
  src/                    React + TypeScript frontend (the webview)
    contract/             The typed sync API contract (single source of truth for the 5 endpoints)
    db/                   LocalDatabase interface + Tauri-backed and in-memory implementations
    security/             Payload encryption, credential storage, device lock, passcode, revocation
    sync/                 Mutation queue, retry/backoff, SyncClient (HTTP), SyncEngine (orchestration)
    modules/               Offline adapters: fleet, installment, pos, inventory
    conflict/              Conflict policy + resolution UI
    shell/                  Activation, lock screen, module launcher, sync status bar, app shell
    state/                  AppProvider (the one React context tying everything together)
  src-tauri/               The Rust/Tauri 2 native shell
    src/db.rs               Encrypted (SQLCipher) SQLite connection + schema
    src/credentials.rs       OS credential store (Windows Credential Manager via `keyring`)
    src/commands.rs          Tauri commands the frontend invokes (one per LocalDatabase method)
    src/lib.rs, main.rs       App bootstrap
    icons/                   Generated from the existing Rock Frost brand PNG (public/icon-512.png in
                              the main repo) via `npx tauri icon` — the public favicon/Apple/Android
                              icons in the main app were not touched.
```

## Prerequisites

- Node.js 20+
- Rust (stable, via [rustup](https://rustup.rs)) and the Windows build tools Tauri requires — see [Tauri's Windows prerequisites guide](https://v2.tauri.app/start/prerequisites/). **Not available in the environment this scaffold was built in** — see the honesty note below.
- WebView2 (preinstalled on current Windows; Tauri's installer can bootstrap it otherwise, see `bundle.windows.webviewInstallMode` in `src-tauri/tauri.conf.json`).

### Honesty note on what has and hasn't been verified

This scaffold's TypeScript/React frontend has been fully built, type-checked, linted, unit-tested (83 tests), and production-built in the environment this work was done in. The Rust/Tauri native shell (`src-tauri/`) has been written to the best of this implementation's knowledge of Tauri 2, `rusqlite`'s SQLCipher feature, and the `keyring` crate's documented APIs, but **that environment had no Rust toolchain at all** — `cargo`/`rustc` were not installed, so none of the Rust code has been compiled, and neither `npm run tauri:dev` nor `npm run tauri:build` have ever actually run. Treat `src-tauri/` as a solid, complete-looking starting point that needs a real `cargo check` / `cargo build` pass (and likely some fixup) before it's trusted, not as proven-working code. See `CLAUDE_HANDOFF.md` for the full list of what to verify first.

## Setup

```bash
cd apps/desktop
npm install
cp .env.example .env   # set VITE_API_BASE_URL to the real sync API origin
```

## Development

```bash
npm run dev          # Vite dev server only, in a plain browser — uses the in-memory
                      # local database (src/db/memory-database.ts) since there is no
                      # Tauri runtime to back the real one. Useful for fast UI iteration,
                      # never for testing real persistence, encryption, or credential storage.

npm run tauri:dev    # The real thing: launches the Tauri window, backed by the encrypted
                      # SQLite database and OS credential store. Requires the Rust
                      # toolchain above.
```

## Validation

```bash
npm run typecheck    # tsc --noEmit
npm run lint          # eslint .
npm run test           # vitest run
npm run build           # tsc --noEmit && vite build (frontend production bundle only)
npm run tauri:build     # full native build + Windows installer — requires the Rust toolchain
```

All of the above except `tauri:build` (and the Rust half of `tauri:dev`) were run and passed in the environment this was built in. See `CLAUDE_HANDOFF.md` for exact results.

## Environment variables

See `.env.example`. There is exactly one required variable:

- `VITE_API_BASE_URL` — the public Rock Frost API origin (e.g. `https://api.rockfrostgroup.com`). No trailing slash.

**This client must never be given a Neon/PostgreSQL connection string, a server-side API key, or any other backend secret.** It only ever holds a short-lived sync access token (obtained by signing in), a refresh token, and its own local payload-encryption key, all via the credential store abstraction in `src/security/credential-store.ts`.

## Packaging

`npm run tauri:build` (once the Rust toolchain is installed) produces both an NSIS installer and an MSI, per `src-tauri/tauri.conf.json`'s `bundle.targets`. Output lands in `src-tauri/target/release/bundle/`.

### Signed updates: abstraction only, not wired

Tauri's official update mechanism (`@tauri-apps/plugin-updater` + the Tauri CLI's `signer` command) requires a real Ed25519 signing keypair. **No such keypair exists in this repository, and none was invented for this pass** — `tauri.conf.json` explicitly sets `"createUpdaterArtifacts": false`, so no unsigned or fake-signed update artifact is produced. To wire real signed updates later:

1. Generate a real keypair once, outside this repository, with `npx tauri signer generate -w ~/.tauri/rockfrost-desktop.key` (keep the private key and its password out of version control entirely — a secrets manager or the CI provider's own secret store, never a committed file).
2. Add the `updater` plugin to `src-tauri/Cargo.toml` and `src-tauri/src/lib.rs`, and the matching `@tauri-apps/plugin-updater` npm package.
3. Set `bundle.createUpdaterArtifacts: true` and a `plugins.updater` block in `tauri.conf.json` pointing at wherever update manifests will be hosted, and the corresponding public key.
4. Sign each release build with the private key as part of a real release pipeline step, never on a developer machine ad hoc.

## Testing

Unit tests live alongside their source (`*.test.ts` next to the file under test) and run under Vitest with jsdom. Coverage includes:

- Mutation queue FIFO ordering and idempotency (`src/sync/mutation-queue.test.ts`)
- Retry/backoff behavior, including the exact attempt-count semantics (`src/sync/retry.test.ts`)
- Sync engine cursor pagination, pulled-record application, push-outcome handling (applied/conflict/rejected), and the special-case 401/403/network-error responses (`src/sync/sync-engine.test.ts`)
- Device lock inactivity timeout and offline session expiry, including that a revoked or offline-expired lock cannot be cleared by the local passcode (`src/security/device-lock.test.ts`, `src/security/session-policy.test.ts`)
- Remote revocation's full effect: lock, purge cached data, delete credentials, deactivate the device row, and record the audit trail (`src/security/revocation.test.ts`)
- Conflict policy: which entity types are protected from any auto-resolution, and that the client only ever offers resolutions the server explicitly allowed (`src/conflict/conflict-policy.test.ts`)
- Real AES-256-GCM payload encryption round trips and local-passcode PBKDF2 hashing (`src/security/payload-encryption.test.ts`, `src/security/local-passcode.test.ts`)

Real-Postgres-style integration tests do not apply here (this client never talks to Postgres) — the equivalent trust boundary is the sync contract itself, exercised via the fake-`SyncClient` tests in `sync-engine.test.ts`.
