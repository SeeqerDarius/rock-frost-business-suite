# Architecture & Tooling Decisions

## 2026-08-21 — Revenue-generating modules post confirmed revenue into Accounting

**Decision:** Every module whose core workflow collects real money — Fleet (verified payments), Pharmacy (completed dispensing), Hospital (invoice payments), POS (sales), Installment (payments), Hostel/Hotel/School (fee payments) — now posts a Debit-Cash/Credit-[Module]-Revenue journal entry into Accounting at the exact moment that module already treats the money as confirmed (a manager verifying a Fleet payment, a dispensing completing, an invoice payment being recorded, a sale completing). This is built on top of `codex/accounting-foundation`'s `postSourceJournalEntry()` (idempotent per organization+sourceType+sourceId+postingPurpose, period-lock aware) and reverses via its `reverseJournalEntry()` when the underlying event is later invalidated (a verified Fleet payment rejected, a dispensing reversed, a POS sale refunded, an Installment payment deleted).

**Why:** Before this, each module kept its revenue entirely in its own tables — Accounting had no visibility into money collected anywhere else in the platform, so an organization running e.g. Fleet and Accounting side by side saw a financial statement that never reflected the Fleet revenue actually being collected. This was flagged directly by the user: "why is Fleet revenue not recorded in accounts," after confirming Accounting genuinely had no cross-module posting anywhere in the codebase. `docs/ACCOUNTING_MODULE.md`'s own "Module integration contract" (added by the accounting-foundation branch) already names these exact modules as expected callers of `postSourceJournalEntry()` — this is that contract's first implementation, not a new design.

**How the boundary is preserved:** A new shared helper, `postModuleRevenue()`/`reverseModuleRevenue()` (`src/lib/accounting-integration.ts`), is the only thing any source module calls — none of the eight modules reach into Accounting's Prisma models directly, matching the exact discipline already established for Procurement/POS → Inventory below. Every call happens from the Server Action layer, after the source module's own transaction has already committed (`postSourceJournalEntry()` always opens its own transaction and is not composable inside another module's — see the file's own top-of-file comment), so a module's real business event (money collected) can never be rolled back by an Accounting failure; reliability comes from `postSourceJournalEntry()`'s idempotency (a retried post is always safe), not from cross-module atomicity. **The integration is conditional on the organization having actually activated Accounting** (`isModuleActiveForOrg()`, mirroring `src/lib/offline-sync/auth.ts`'s existing subscription-gating logic) — a source module's own operation always succeeds and is never blocked, delayed, or altered by Accounting being unsubscribed, misconfigured, or unreachable; a failed or skipped post is caught and logged, never thrown.

**Revenue by source, for manager visibility:** Each module gets its own system Revenue account (Fleet Revenue `4100`, Pharmacy Revenue `4200`, Hospital Revenue `4300`, POS Revenue `4400`, Installment Revenue `4500`, Hostel Revenue `4600`, Hotel Revenue `4700`, School Revenue `4800`), auto-provisioned on first use rather than eagerly created for every organization — so the chart of accounts only grows for modules an organization actually has activated. Accounting's Reports page (`src/app/app/accounting/reports/page.tsx`) gained a "Revenue by source" card: a per-account balance breakdown plus a recent-postings table (date, source module, description, posting number, amount) so a manager can trace any total back to the specific module and record that produced it, addressing the second half of the same request.

**Not done (and deliberately so):** Payroll and Procurement still do not post to Accounting (unchanged from the entries below) — those are expense/liability-side integrations (a payroll run, a purchase order received) rather than revenue, and were out of the scope of what was asked. A verified-then-rejected Fleet payment, a reversed Pharmacy dispensing, a refunded POS sale, and a deleted Installment payment all reverse their posted entry; Hospital/Hostel/Hotel/School fee payments currently have no equivalent "undo" pathway in their own service layers, so no reversal call site exists for them yet — if one is added to those modules later, it should call `reverseModuleRevenue()` the same way. See `OPERATOR_HANDOFF.md`'s dated entry for exact files, validation, and what was not executed.

---

## 2026-08-14 — Inventory & Procurement consolidated as one customer-facing product; linked receiving now requires a warehouse

**Decision:** Inventory and Procurement are presented to tenants as one product, "Inventory & Procurement" — a shared sidebar navigation and a combined overview at `/app/inventory` (see `docs/INVENTORY_PROCUREMENT_CONSOLIDATION.md`). This is presentation only: the two modules keep their own route trees, permission prefixes, database tables, and service functions, unrenamed. Separately, `receiveOrderLine()` (`src/modules/procurement/service.ts`) now throws `WarehouseRequiredError` if a purchase order line linked to a real `InventoryItem` is received without a warehouse, rather than silently marking the line received while never touching Inventory. A non-stock line (no linked item) is unaffected and still requires no warehouse.

**Why:** The original 2026-07-20 Procurement/Inventory integration decision (below) described "no warehouse selected at receiving time" as an accepted no-op alongside "no linked item," treating both as reasons a receipt might legitimately not touch Inventory. That conflated two different situations: an order for a service or untracked item genuinely has no inventory consequence, but an order for a *real, linked* item with no warehouse chosen is an operator omission, not a valid non-stock order. Letting it through silently meant a purchase order could read as fully received with no `InventoryStock` row ever updated — a real correctness gap, not a deliberate feature.

**How the boundary is preserved:** The fix is a pre-condition check inside `receiveOrderLine()` itself, before any write — it does not change how Procurement calls Inventory (still only `recordMovement()`, still inside the same transaction as the line/order status update). `docs/DECISIONS.md`'s 2026-07-20 Procurement entry is amended in place to point here rather than being silently rewritten.

**Not done (and deliberately so):** No change to the module registry, entitlements, subscription/pricing catalogue, or permission prefixes — those remain centrally owned and are tracked separately for whoever owns that follow-up.

---

## 2026-08-03 — Vercel previews never apply database migrations

**Decision:** `npm run vercel-build` runs `prisma migrate deploy` only when `VERCEL_ENV=production`; preview builds compile the application without mutating a database. Production retains the migration-before-build gate.

**Why:** Preview database integrations may not expose a direct migration URL, and a feature-branch preview must never apply schema changes to a shared or production database. Real migration behavior is proven first by GitHub Actions against disposable PostgreSQL, then applied once during the production release.

## 2026-08-03 — Hotel and School are operational vertical suites

**Decision:** Promote Hotel and School to available modules after implementing their schema, services, RBAC, tenant isolation, navigation, workflows, reports, settings, migration, and tests. Restaurant charges are posted to Hotel folios within the same transaction as the order; School examination results move through explicit open, moderation, and published states.

**Boundary rule:** The vertical modules own vertical operational records. Existing shared modules remain independent; future external channel adapters and automated payroll posting must use public service boundaries rather than querying another module's tables.

This is the authoritative decision log for the rebuilt Rock Frost Business Suite. Record every consequential technical decision here, in date order, newest first. Do not silently reverse a decision recorded here — supersede it with a new dated entry explaining why.

---

## 2026-08-03 — Hotel and School are staged vertical suites

**Decision:** Add Hotel Management and School Management to the product registry
as `coming-soon` and to the platform module catalog seed for acquisition, then deliver them through the bounded releases and completion
gates in `docs/HOTEL_AND_SCHOOL_MODULES.md`. They must not be marked available,
made tenant-accessible or receive a permission prefix until their first
operational release passes schema, RBAC, state-transition, isolation, migration,
test, and documentation checks.

**Why:** Both requested verticals contain multiple dependent domains and
regulated/sensitive data. Registering the roadmap supports acquisition now,
while fail-closed availability prevents placeholder pages or incomplete financial
and academic workflows from being sold as production-ready.

**Boundary rule:** Future Hotel restaurant/channel and School workforce/payroll
integrations call existing module services behind explicit adapters. They do not
query POS, Inventory, Accounting, HR, or Payroll tables directly.


## 2026-07-20 — POS sales post real Inventory stock movements (ISSUE on sale, RECEIPT on refund)

**Decision:** When a POS sale includes a line linked to a real `InventoryItem`, and the selling register has a linked `InventoryWarehouse`, `createSale()` (`src/modules/pos/service.ts`) calls Inventory's own `recordMovement()` with `type: "ISSUE"` to post a real stock decrease. Refunding that sale (`refundSale()`) reverses it with a `type: "RECEIPT"` call. This is the same deliberate, documented cross-module integration pattern established for Procurement's receiving flow (see this file's Procurement entry above) — a checkout that doesn't actually move stock isn't a real point-of-sale flow.

**Why:** Same reasoning as Procurement: duplicating Inventory's stock-quantity and validation logic inside POS would be pure duplication, not module independence, and a sale with no real inventory consequence would just be a form.

**How the boundary is preserved:** POS only calls Inventory's public service functions (`recordMovement`, `getStockGrid`) — it never touches Inventory's Prisma models directly. A register without a linked warehouse, or a sale line without a linked `InventoryItem`, skips the Inventory call entirely (POS supports selling untracked items/services, same as Procurement supports ordering them).

**Known limitation, accepted for this pass:** a multi-line sale checks stock availability for every line up front (via `getStockGrid`) before posting any movement, but each line's `recordMovement()` call is still its own independent transaction — under concurrent access to the same item, a race between the pre-check and the actual decrement is possible. This mirrors the same class of limitation already accepted for Procurement's receiving flow; a single cross-module transaction spanning two modules' services was judged not worth the coupling it would require.

**Not done (and deliberately so):** POS does not post anything to Accounting (e.g. Debit Cash / Credit Revenue on a completed sale) in this pass — the same scope decision already recorded for Procurement and Payroll not integrating with Accounting. **Superseded 2026-08-21** (see that entry above): POS sales now post to Accounting via the shared `postModuleRevenue()` helper, one of eight modules wired in that pass.

---

## 2026-07-20 — Procurement receiving posts real Inventory stock movements

**Decision:** When a purchase order line is received on `/app/procurement/orders`, `receiveOrderLine()` (`src/modules/procurement/service.ts`) calls Inventory's own `recordMovement()` (`src/modules/inventory/service.ts`) with `type: "RECEIPT"`, posting a real stock increase into the chosen warehouse — provided the order line is linked to a real `InventoryItem` and a warehouse is selected. This is a deliberate cross-module integration, not a boundary violation, per `docs/MODULE_BOUNDARIES.md`'s "Cross-module data" section, which requires such integrations to be deliberate and recorded here rather than silently added.

**Why:** A purchase order that doesn't actually move stock when received isn't a real procurement flow — it would just be a form with no consequence, the same class of problem this rebuild exists to avoid (see the 2026-07-19 full-rebuild entry). Procurement genuinely needs Inventory's stock-movement logic; duplicating `recordMovement()`'s validation (insufficient/negative-stock checks, the `InventoryStock` upsert-or-create logic) inside Procurement would be pure duplication, not module independence.

**How the boundary is preserved:** Procurement only calls Inventory's public, already-permission-agnostic service function (`recordMovement`) — it never reaches into Inventory's Prisma models directly, and Inventory has no reciprocal dependency on Procurement (it doesn't know purchase orders exist). If the order line has no linked `InventoryItem`, the receipt is tracked on the `ProcurementOrderLine.receivedQuantity` alone and no Inventory call is made — receiving is not required to be tied to real inventory, since some procurement requests are for non-stocked items or services. **Corrected 2026-08-14** (see that entry below): a line that *is* linked to a real `InventoryItem` now requires a warehouse to be received at all — the original version of this decision let that case silently skip the Inventory call too, which is no longer true.

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
