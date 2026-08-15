# Rock Frost Business Suite Desktop

Local-first Windows client built with Tauri 2, React, and TypeScript. It uses an encrypted device-local SQLite store and communicates only with the Rock Frost desktop sync API. It never connects directly to Neon or PostgreSQL.

## Activation

1. Sign in to the Rock Frost web application.
2. Open Account, then Desktop access.
3. Choose the allowed offline modules and generate a one-time activation code.
4. In the desktop app, enter the code, name the device, select only the modules authorized by the code, and set a local 4 to 8 digit unlock passcode.

The client does not collect or store a Rock Frost email or password. The activation code expires after 10 minutes and can be used once. The returned device bearer token is kept in the operating-system credential store abstraction. Cached business payloads remain in encrypted local persistence.

## Offline scope

The current server accepts append-only `CREATE` mutations with `baseVersion: 0` for exactly these entity types:

- `fleet.maintenance_request`
- `fleet.driver_payment_submission`
- `installment.payment`
- `inventory.movement`
- `pos.sale`

Approvals, refunds, payroll, HR changes, accounting postings, pharmacy work, and clinical work remain online-only. Inventory offline movements are limited to `RECEIPT` and `ADJUSTMENT`. Every local write remains visibly pending until the server reports it as applied.

## Sync contract

- `POST /api/desktop/activate` exchanges a one-time code and installation identity for a device token.
- `POST /api/desktop/sync/push` sends `{ mutations }`. The bearer token identifies the device.
- `GET /api/desktop/sync/pull` returns a bounded full snapshot. Cursor pagination is not part of contract version 1.
- `POST /api/desktop/sync/conflicts/{conflictId}/resolve` accepts only `{ resolution: "KEEP_CLOUD" }`.
- `POST /api/desktop/deactivate` accepts an empty JSON body and revokes the current bearer device.

The pull response can report `truncated: true`. This must be surfaced before a production installer is distributed because a truncated full snapshot is not a complete offline dataset. Push results may be `processing`, `applied`, `conflict`, or `rejected`. The client retries `processing` safely with the same mutation ID.

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

The TypeScript checks validate the webview portion. The native Rust layer has also passed `cargo check`, and `npm run tauri:build` has produced x64 NSIS and MSI bundles. Customer distribution still requires a trusted Windows code-signing certificate and a configured signed-update channel. Do not distribute the unsigned local bundles as production software.
