# Point of Sale operations

The POS module provides tenant-scoped registers, till sessions, sales, payments, returns, stock integration, settings, and reports.

## Checkout

- A sale contains 1 to 100 lines. The browser cart is dynamic, but the Server Action validates the complete payload again.
- A linked Inventory item can be selected or found by its organization-scoped barcode.
- Each line preserves its description, SKU, barcode, tax rate, discount, quantity, unit price, and line total at the time of sale. Later catalogue edits do not rewrite the receipt history.
- A completed sale can use up to 10 payment parts. Payment amounts must add up exactly to the sale total.
- A suspended sale records no payment and moves no stock. Resuming it requires an open till session, exact payment allocation, and atomically posts Inventory issues.

## Returns

Returns are line and quantity based. The server locks the original sale lines before it calculates previously returned quantities. Concurrent requests therefore cannot return more units than were sold. A successful return records an immutable return header and lines, updates the sale to partially or fully refunded, and posts Inventory receipts for tracked items.

Returns require `pos.returns.manage`. Sale entry and suspension/resumption use `pos.sales.manage`.

## Till closing

Expected cash is derived from opening float plus completed cash payments less completed cash refunds. Closing stores expected cash, counted cash, and variance. A non-zero variance requires a reason and `pos.variances.approve`. The close uses a guarded state transition so the same session cannot be closed twice.

## Release gate

Migration `20260821013000_pos_operational_controls` must pass the guarded disposable PostgreSQL integration suite before production deployment. The real concurrency suite includes competing partial returns and verifies that stock is restored only once.
