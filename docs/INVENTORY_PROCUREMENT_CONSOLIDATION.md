# Inventory & Procurement Consolidation

**Status: implemented.** A customer-facing consolidation of the Inventory and Procurement modules into one coherent product experience, "Inventory & Procurement." This is a UX and navigation consolidation, not a data or entitlement merge: the two route trees, database tables, Prisma models, permission prefixes, and service functions are unchanged and unrenamed. See `docs/MODULE_BOUNDARIES.md` for the underlying module-boundary contract this respects.

## What changed

- **One shared navigation definition** (`src/modules/inventory-procurement/navigation.tsx`) is now rendered by both `src/app/app/inventory/layout.tsx` and `src/app/app/procurement/layout.tsx`. A tenant holding both modules sees one combined sidebar list (grouped "Inventory" / "Procurement" sections) with a single Overview entry pointing at the combined page. `src/modules/inventory/navigation.tsx` and `src/modules/procurement/navigation.tsx` remain in place as thin re-exports under their original names, since `src/platform/modules/registry.ts` imports each by that exact name and path and is not part of this change.
- **A combined overview at `/app/inventory`** (`src/app/app/inventory/page.tsx`), replacing the previous Inventory-only overview, composed by `src/modules/inventory-procurement/overview.ts` from each module's own existing public summary function (`getInventorySummary`, `getProcurementSummary`) — the same cross-module composition pattern Analytics already uses (see `docs/MODULE_BOUNDARIES.md`), never a direct Prisma query against the other module's tables.
- **A real receiving-flow correctness fix**: `receiveOrderLine()` (`src/modules/procurement/service.ts`) now rejects receiving a purchase order line that is linked to a real `InventoryItem` if no warehouse is supplied, throwing the new `WarehouseRequiredError`, instead of silently marking the line received while skipping the Inventory stock movement. See "Receiving behavior" below and `docs/DECISIONS.md`'s 2026-08-14 entry.
- **Two cross-links between the existing, separate settings pages** (`/app/inventory/settings`, `/app/procurement/settings`), each shown only when the viewer can actually reach the other page. Nothing about either page's stored settings, persistence, or permission checks changed.
- A guard on the Orders page: "New order" only opens when at least one vendor exists (vendor is a required field on every order); otherwise a "Add a vendor first" link replaces it.
- A pre-fill fix: the receiving dialog now honors Procurement Settings' existing "Default receiving warehouse" (`ProcurementSettings.defaultWarehouseId`), which the settings page already described but the receiving dialog never actually read.

## Access model — unchanged, only composed

Nothing about who can reach what changed. `canAccessModule(tenant, "inventory")` and `canAccessModule(tenant, "procurement")` are still evaluated exactly as before; the consolidation only decides what UI to compose from the results:

- **Both modules**: combined sidebar (section label "Inventory & Procurement"), combined overview with both modules' summary cards.
- **Inventory only**: the sidebar shows exactly the Inventory items it always did (section label "Inventory Management," unchanged), and the combined overview at `/app/inventory` silently omits every Procurement section, card, list, and quick action — `getInventoryProcurementOverview()` doesn't even query a Procurement table when `!hasProcurement`.
- **Procurement only**: the sidebar shows exactly the Procurement items it always did (section label "Procurement," unchanged), with its Overview entry pointing at the original standalone `/app/procurement` page — a Procurement-only tenant never sees a nav link into `/app/inventory`, which its own layout would block anyway.
- **Neither**: empty navigation (unreachable in practice — each layout already redirects/blocks before rendering it).

Within the combined overview, two finer-grained checks are preserved exactly as the dedicated pages already enforced them:

- The detailed low-stock item list (names/SKUs) requires `INVENTORY_REPORTS_VIEW`, matching the existing Inventory Reports page. Without it, only the aggregate low-stock count is shown (unchanged from the original overview page's exposure level).
- Every quick-action button is gated on the specific `.manage` permission for that action (`INVENTORY_ITEMS_MANAGE`, `PROCUREMENT_VENDORS_MANAGE`, etc.), matching each destination page's own create-button gate.

## Receiving behavior

A purchase order line is either:

- **Linked** to a real `InventoryItem` (`ProcurementOrderLine.itemId` set) — receiving it now **requires** a warehouse. `receiveOrderLine()` throws `WarehouseRequiredError` before any database write if one isn't supplied, so a purchase order can never claim a linked item was received while silently posting no stock movement.
- **Non-stock** (`itemId` is `null`) — an order for a service or an untracked one-off item. Receiving it never needs a warehouse and never touches Inventory. This is a deliberate, pre-existing capability (see `docs/DECISIONS.md`'s original 2026-07-20 entry) and remains fully intact — the fix above only tightens the linked case.

Either way, when a linked line *is* received with a warehouse, the receipt still goes through Inventory's own public `recordMovement()` function (never a direct write to `InventoryStock`), inside the same atomic transaction as the order line's `receivedQuantity` update and the order's status recomputation — unchanged from before this consolidation. See `docs/MODULE_BOUNDARIES.md`'s Procurement entry and `docs/DECISIONS.md` for why this cross-module call is a deliberate, documented integration rather than a boundary violation.

## Deep URLs

Every route that existed before this change still exists at the same path, with the same permission gates:

- `/app/inventory`, `/app/inventory/items`, `/warehouses`, `/stock`, `/movements`, `/reports`, `/settings`
- `/app/procurement`, `/app/procurement/vendors`, `/requests`, `/orders`, `/reports`, `/settings`

No redirects were added. `/app/inventory` changed *content* (it's now the combined overview instead of an Inventory-only one) but not its permission boundary — it still requires `canAccessModule(tenant, "inventory")` via `requireModuleAccess("inventory")`, exactly as before.

## Known gaps

- The module launcher, module registry entries, subscription/entitlement handling, and any customer-facing "Inventory & Procurement" bundling at the catalogue/pricing level are centrally owned (`src/platform/modules/registry.ts`, subscription/billing/module-request code) and out of scope for this change — see the central follow-up recorded in `OPERATOR_HANDOFF.md`'s entry for this work.
- The combined overview's "needs follow-up" preview lists are capped at 5 rows each with a link to the full page; there is no pagination on the preview itself (matching this codebase's existing lack of pagination on the underlying list pages).
- Real-Postgres integration tests for this change were not executed in the environment this work was done in (no `TEST_DATABASE_URL` configured) — see `docs/TESTING_STRATEGY.md`. The mocked-DB unit suite (`test/inventory-procurement-consolidation.test.ts`) does run in CI/local validation.
