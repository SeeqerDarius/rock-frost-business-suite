# Point of Sale operations

The POS module provides tenant-scoped registers, till sessions, sales, payments, returns, stock integration, settings, and reports.

## Navigation (2026-08-24)

`/app/pos/sales` is labeled **Orders** in the sidebar (the route itself is unchanged) and now also shows the selling employee, matching what a cashier expects from an "orders" list: every sale across every register, who sold it, its total, payment method, and status, with Resume/Return actions inline.

Two read-only history pages were added, both gated on `pos.reports.view` like the existing Reports page:

- **Sessions** (`/app/pos/sessions`) — every till session ever opened, not just the currently-open one shown on Registers: register, opened/closed by and when, opening float, closing cash, variance, and how many sales it recorded. Reuses the pre-existing `listSessions()` query, which no page had rendered until now.
- **Payments** (`/app/pos/payments`) — every individual payment recorded against a sale, across every register, with a running total per payment method (cash/card/mobile money/other) above the list. New `listPayments()` in `src/modules/pos/service.ts`.

## Checkout

- A sale contains 1 to 100 lines. The browser cart is dynamic, but the Server Action validates the complete payload again.
- A linked Inventory item can be selected or found by its organization-scoped barcode.
- Each line preserves its description, SKU, barcode, tax rate, discount, quantity, unit price, and line total at the time of sale. Later catalogue edits do not rewrite the receipt history.
- A completed sale can use up to 10 payment parts. Payment amounts must add up exactly to the sale total.
- A suspended sale records no payment and moves no stock. Resuming it requires an open till session, exact payment allocation, and atomically posts Inventory issues.

### Sell screen (2026-08-24)

`/app/pos/sell` is a tap-to-add register screen rather than a row-by-row form. Inventory items render as a searchable, category-filtered tile grid (`product-picker.tsx`); tapping a tile adds one unit to the cart or increments an existing line. A numeric keypad edits the selected line's quantity or price directly (`sale-cart.tsx`), and scanning a barcode into the dedicated field adds the matching item the same way a tile tap would. A "Custom line" affordance still covers one-off items with no catalogue entry. Split payments and suspend-for-later are unchanged, just visually grouped under the cart.

A cashier can add a new sellable item from the register itself ("New product" dialog) without navigating to Inventory: name, optional barcode, price, and a category picker that can create a new `InventoryCategory` inline. `createPosQuickItem` (`src/app/app/pos/sell/actions.ts`) generates the SKU automatically (retrying on a collision), is gated on `pos.sales.manage` like the rest of the sell screen, and returns the created item to the client instead of redirecting or calling `revalidatePath` — the in-progress cart is client state and must not be lost to a navigation. This is a pure interaction-layer change: `completeSale`'s line/payment contract and every server-side validation and posting rule above are unchanged.

### Sells at salesPrice, filters to POS-available items (2026-08-24)

The sell screen's product grid now shows only items with `isPosAvailable: true` (default `true`, unchanged for every pre-existing item) and sells at each item's `salesPrice` rather than `costPrice`. Before this, POS both displayed and charged `costPrice` — what the organization pays to acquire an item, not what it charges for it — because `InventoryItem` had only one price field. `createPosQuickItem`'s "New product" dialog now writes the price a cashier types into `salesPrice` (with `costPrice` defaulting to 0), matching what its label already said. See `docs/INVENTORY_PROCUREMENT_CONSOLIDATION.md`'s "Product model" section for the full field list this draws from.

### Offline-resilient checkout (2026-08-24)

If the connection drops while a cashier is already on the sell screen, completing a sale no longer fails outright. The submit button no longer relies on a native `<form action>` — `completeSale` (`src/app/app/pos/sell/actions.ts`) was converted to an RPC-style function returning `{ ok: true, saleNumber, suspended } | { ok: false, error }` instead of redirecting, called via `startTransition` from `sale-cart.tsx`. A **thrown** failure (a real network/transport error) is queued into a small `localStorage`-backed queue, scoped per organization (`src/app/app/pos/sell/offline-queue.ts`); a **returned** `{ ok: false }` (a real validation error the server actually evaluated, e.g. insufficient stock) is shown inline exactly as before — these are deliberately not the same code path.

A queued sale carries a client-generated `clientRequestId` and the `occurredAt` timestamp captured the moment it was made. `createSale()` (`src/modules/pos/service.ts`) treats `clientRequestId` as an idempotency key: a sync replay (the response to an earlier successful attempt was lost, or two tabs double-fire) returns the sale already created instead of re-validating stock and creating a duplicate — proven under genuine concurrent load in `test/integration/concurrency/pos.test.ts`, including the case where both callers race into `create()` and the loser's unique-constraint violation is caught and resolved to the winner rather than erroring. `occurredAt` is stored alongside the normal `createdAt` (which reflects whenever the row actually reaches the database, possibly minutes later) so reporting that cares about when a sale happened can use `occurredAt ?? createdAt`.

The queue syncs automatically on the browser's `online` event, on a 20-second timer while anything is pending, and via a manual "Sync now" button; a persistent banner shows the pending count. A genuine server-side rejection discovered only at sync time (most likely two offline sales racing for the last unit of stock — the existing stock guard working as intended, just discovered later than usual) marks that entry with the specific error rather than silently dropping it or retrying forever.

**Deliberately out of scope, not silently dropped**: this does not survive a full page reload or app relaunch while offline (the product catalogue is only ever fetched server-side at page load; surviving a fresh load with no connection would need a service worker and an offline-capable app shell — a separate, larger piece of work). Adding a new product (`createPosQuickItem`) still requires a connection — creating catalogue/category rows safely offline needs real conflict resolution, which this lightweight design deliberately doesn't attempt; the "New product" button is disabled with an explanatory tooltip while offline. Suspend/resume/return are unaffected either way, since they already depend on server-persisted records a browser can't have without a live fetch in the first place.

This intentionally does not reuse the `OfflineDevice`/`OfflineMutation`/`OfflineConflict` tables from the retired Tauri desktop offline product (see `OPERATOR_HANDOFF.md`'s 2026-08-21 "Desktop product retired" entry) — those model a device-activation concept this browser-only mechanism has no use for.

### Dashboard quick launch (2026-08-24)

`/app/dashboard`, the first screen after sign-in, opens with a "Quick launch" grid of large icon tiles, one per module enabled for the organization, linking straight into each module. The existing per-module summary widgets remain below it unchanged. Tile icons reuse the shared `IconBadge` brand treatment (single accent color) rather than a color-per-app scheme, to stay consistent with how module icons are styled everywhere else in the product.

## Returns

Returns are line and quantity based. The server locks the original sale lines before it calculates previously returned quantities. Concurrent requests therefore cannot return more units than were sold. A successful return records an immutable return header and lines, updates the sale to partially or fully refunded, and posts Inventory receipts for tracked items.

Returns require `pos.returns.manage`. Sale entry and suspension/resumption use `pos.sales.manage`.

## Till closing

Expected cash is derived from opening float plus completed cash payments less completed cash refunds. Closing stores expected cash, counted cash, and variance. A non-zero variance requires a reason and `pos.variances.approve`. The close uses a guarded state transition so the same session cannot be closed twice.

## Release gate

Migration `20260821013000_pos_operational_controls` must pass the guarded disposable PostgreSQL integration suite before production deployment. The real concurrency suite includes competing partial returns and verifies that stock is restored only once.
