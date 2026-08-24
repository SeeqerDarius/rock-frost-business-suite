# Point of Sale operations

The POS module provides tenant-scoped registers, till sessions, sales, payments, returns, stock integration, settings, and reports.

## Checkout

- A sale contains 1 to 100 lines. The browser cart is dynamic, but the Server Action validates the complete payload again.
- A linked Inventory item can be selected or found by its organization-scoped barcode.
- Each line preserves its description, SKU, barcode, tax rate, discount, quantity, unit price, and line total at the time of sale. Later catalogue edits do not rewrite the receipt history.
- A completed sale can use up to 10 payment parts. Payment amounts must add up exactly to the sale total.
- A suspended sale records no payment and moves no stock. Resuming it requires an open till session, exact payment allocation, and atomically posts Inventory issues.

### Sell screen (2026-08-24)

`/app/pos/sell` is a tap-to-add register screen rather than a row-by-row form. Inventory items render as a searchable, category-filtered tile grid (`product-picker.tsx`); tapping a tile adds one unit to the cart or increments an existing line. A numeric keypad edits the selected line's quantity or price directly (`sale-cart.tsx`), and scanning a barcode into the dedicated field adds the matching item the same way a tile tap would. A "Custom line" affordance still covers one-off items with no catalogue entry. Split payments and suspend-for-later are unchanged, just visually grouped under the cart.

A cashier can add a new sellable item from the register itself ("New product" dialog) without navigating to Inventory: name, optional barcode, price, and a category picker that can create a new `InventoryCategory` inline. `createPosQuickItem` (`src/app/app/pos/sell/actions.ts`) generates the SKU automatically (retrying on a collision), is gated on `pos.sales.manage` like the rest of the sell screen, and returns the created item to the client instead of redirecting or calling `revalidatePath` — the in-progress cart is client state and must not be lost to a navigation. This is a pure interaction-layer change: `completeSale`'s line/payment contract and every server-side validation and posting rule above are unchanged.

### Dashboard quick launch (2026-08-24)

`/app/dashboard`, the first screen after sign-in, opens with a "Quick launch" grid of large icon tiles, one per module enabled for the organization, linking straight into each module. The existing per-module summary widgets remain below it unchanged. Tile icons reuse the shared `IconBadge` brand treatment (single accent color) rather than a color-per-app scheme, to stay consistent with how module icons are styled everywhere else in the product.

## Returns

Returns are line and quantity based. The server locks the original sale lines before it calculates previously returned quantities. Concurrent requests therefore cannot return more units than were sold. A successful return records an immutable return header and lines, updates the sale to partially or fully refunded, and posts Inventory receipts for tracked items.

Returns require `pos.returns.manage`. Sale entry and suspension/resumption use `pos.sales.manage`.

## Till closing

Expected cash is derived from opening float plus completed cash payments less completed cash refunds. Closing stores expected cash, counted cash, and variance. A non-zero variance requires a reason and `pos.variances.approve`. The close uses a guarded state transition so the same session cannot be closed twice.

## Release gate

Migration `20260821013000_pos_operational_controls` must pass the guarded disposable PostgreSQL integration suite before production deployment. The real concurrency suite includes competing partial returns and verifies that stock is restored only once.
