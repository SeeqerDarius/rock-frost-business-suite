# Architecture & Tooling Decisions

This is the authoritative decision log for the rebuilt Rock Frost Business Suite. Record every consequential technical decision here, in date order, newest first. Do not silently reverse a decision recorded here — supersede it with a new dated entry explaining why.

---

## 2026-07-20 — POS sales post real Inventory stock movements (ISSUE on sale, RECEIPT on refund)

**Decision:** When a POS sale includes a line linked to a real `InventoryItem`, and the selling register has a linked `InventoryWarehouse`, `createSale()` (`src/modules/pos/service.ts`) calls Inventory's own `recordMovement()` with `type: "ISSUE"` to post a real stock decrease. Refunding that sale (`refundSale()`) reverses it with a `type: "RECEIPT"` call. This is the same deliberate, documented cross-module integration pattern established for Procurement's receiving flow (see this file's Procurement entry above) — a checkout that doesn't actually move stock isn't a real point-of-sale flow.

**Why:** Same reasoning as Procurement: duplicating Inventory's stock-quantity and validation logic inside POS would be pure duplication, not module independence, and a sale with no real inventory consequence would just be a form.

**How the boundary is preserved:** POS only calls Inventory's public service functions (`recordMovement`, `getStockGrid`) — it never touches Inventory's Prisma models directly. A register without a linked warehouse, or a sale line without a linked `InventoryItem`, skips the Inventory call entirely (POS supports selling untracked items/services, same as Procurement supports ordering them).

**Known limitation, accepted for this pass:** a multi-line sale checks stock availability for every line up front (via `getStockGrid`) before posting any movement, but each line's `recordMovement()` call is still its own independent transaction — under concurrent access to the same item, a race between the pre-check and the actual decrement is possible. This mirrors the same class of limitation already accepted for Procurement's receiving flow; a single cross-module transaction spanning two modules' services was judged not worth the coupling it would require.

**Not done (and deliberately so):** POS does not post anything to Accounting (e.g. Debit Cash / Credit Revenue on a completed sale) in this pass — the same scope decision already recorded for Procurement and Payroll not integrating with Accounting.

---

## 2026-07-20 — Procurement receiving posts real Inventory stock movements

**Decision:** When a purchase order line is received on `/app/procurement/orders`, `receiveOrderLine()` (`src/modules/procurement/service.ts`) calls Inventory's own `recordMovement()` (`src/modules/inventory/service.ts`) with `type: "RECEIPT"`, posting a real stock increase into the chosen warehouse — provided the order line is linked to a real `InventoryItem` and a warehouse is selected. This is a deliberate cross-module integration, not a boundary violation, per `docs/MODULE_BOUNDARIES.md`'s "Cross-module data" section, which requires such integrations to be deliberate and recorded here rather than silently added.

**Why:** A purchase order that doesn't actually move stock when received isn't a real procurement flow — it would just be a form with no consequence, the same class of problem this rebuild exists to avoid (see the 2026-07-19 full-rebuild entry). Procurement genuinely needs Inventory's stock-movement logic; duplicating `recordMovement()`'s validation (insufficient/negative-stock checks, the `InventoryStock` upsert-or-create logic) inside Procurement would be pure duplication, not module independence.

**How the boundary is preserved:** Procurement only calls Inventory's public, already-permission-agnostic service function (`recordMovement`) — it never reaches into Inventory's Prisma models directly, and Inventory has no reciprocal dependency on Procurement (it doesn't know purchase orders exist). If the order line has no linked `InventoryItem`, or no warehouse is selected at receiving time, the receipt is tracked on the `ProcurementOrderLine.receivedQuantity` alone and no Inventory call is made — receiving is not required to be tied to real inventory, since some procurement requests are for non-stocked items or services.

**Not done (and deliberately so):** Procurement does not post anything to Accounting (e.g., an Accounts Payable liability when an order is received) in this pass — see `OPERATOR_HANDOFF.md`'s Phase 12 entry for the same reasoning already applied to Payroll↔Accounting.

---

## 2026-07-19 — UI foundation: shadcn/ui + Radix UI + Tailwind CSS

**Decision:** Use [shadcn/ui](https://ui.shadcn.com) as the component/design-system foundation, built on Radix UI primitives and Tailwind CSS v4.

**License check:**
- shadcn/ui itself: MIT License. No royalties, no attribution requirement, unrestricted commercial use.
- Radix UI primitives (the accessible, unstyled behavior layer underneath): MIT License.
- Tailwind CSS: MIT License.

All three are safe for unrestricted commercial, closed-source use.

**Why this satisfies the project's template requirements:**
1. **License** — MIT across the whole stack; confirmed above.
2. **Commercial use** — explicitly permitted, no restrictions.
3. **Next.js App Router + TypeScript compatibility** — shadcn/ui's primary, officially documented target is Next.js App Router with TypeScript. No adaptation layer needed.
4. **No vendor lock-in** — shadcn/ui is not an installed dependency you import from `node_modules`. Its CLI (`npx shadcn@latest add <component>`) copies component source directly into `src/components/ui/`. Every component is fully owned, readable, and editable code in this repository from day one — there is no black-box package to fight against or wait on upstream for.
5. **Responsive navigation, tables, forms, dashboards** — shadcn/ui ships primitives for all of these: `Sheet` (slide-out drawer, used for mobile sidebar nav), `Table`, `Form` (wraps `react-hook-form` + `zod` resolvers), `Dialog`, `DropdownMenu`, `Command` (command palette / search), `Tabs`, `Card`, `Badge`, `Skeleton` (loading states), `Sonner` (toast notifications), and more — all composable, all Tailwind-styled, all accessible via Radix's ARIA-compliant behavior primitives.

**What this is not:** shadcn/ui is not a purchased or installed "dashboard template." There is no single generic dashboard shell being forced onto the whole product. It is a component toolkit; the actual application structure, navigation architecture, module boundaries, and page layouts are custom-built for Rock Frost on top of it, per `docs/MODULE_BOUNDARIES.md` and `docs/ARCHITECTURE.md`.

**Supporting libraries adopted alongside it (same rationale — MIT, Next.js/TS-native, no lock-in):**
- `react-hook-form` + `zod` (+ `@hookform/resolvers`) — form state and validation, the standard pairing shadcn's own `Form` component is built around.
- `@tanstack/react-table` — headless table logic (sorting, filtering, pagination) paired with shadcn's `Table` primitive for actual markup/styling.
- `lucide-react` — icon set shadcn/ui is designed around; MIT licensed, tree-shakeable.
- `sonner` — toast notifications (shadcn's recommended toast primitive as of Radix's own `Toast` being superseded).

**Explicitly rejected:** installing a pre-built "admin dashboard template" package (e.g. from ThemeForest-style marketplaces) — these typically force a single generic dashboard shell across the whole product, frequently carry non-commercial or attribution-required licenses, and create exactly the vendor lock-in this project's rules prohibit.

---

## 2026-07-19 — Full clean rebuild, previous implementation retired

**Decision:** Retire the entire previous Rock Frost Business Suite implementation (marketing site, dashboard, Fleet module, Hire Purchase/installment module, auth, RBAC — all of it) and rebuild from a clean foundation with enforced module isolation.

**Why:** The previous implementation mixed navigation, data, and presentation across unrelated business modules (Fleet and Hire Purchase/installment management bled into each other's dashboards, navigation, and shared components — e.g. a hardcoded "Fleet Operations" / "Rock Frost Fleet Control" heading rendered on every dashboard page regardless of which module the user was in). Root cause: the previous architecture had no enforced module-boundary concept — modules were pages bolted onto a single shared dashboard shell rather than independent, isolated units within a common platform. Patching individual instances of this bleed (sidebar grouping, topbar labeling) was addressed reactively per-bug rather than preventing the class of bug structurally.

**What was preserved:**
- Full git history (no history rewriting, no `.git` deletion).
- A complete snapshot of the previous implementation on branch `archive/pre-redesign-rfbs` (pushed to origin), and via the ordinary commit history on `main` up to commit `c35c86d`.
- The live Neon Postgres database (schema and data untouched by this rebuild — only application code was replaced; see `docs/DATABASE_STRATEGY.md` for how the new app reconnects to it).
- Environment variable names (recorded in a private, non-committed migration note — values were never printed or committed).
- Approved brand assets (`public/RFG.png`, favicon, apple-touch-icon, OG image, manifest, robots.txt, sitemap.xml).

**What was NOT preserved:** the previous `app/`, `components/`, and `lib/` implementation code, and the previous roadmap/architecture docs (archived under `docs/archive/previous-implementation/`, marked obsolete, not authoritative).
