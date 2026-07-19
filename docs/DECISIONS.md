# Architecture & Tooling Decisions

This is the authoritative decision log for the rebuilt Rock Frost Business Suite. Record every consequential technical decision here, in date order, newest first. Do not silently reverse a decision recorded here — supersede it with a new dated entry explaining why.

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
