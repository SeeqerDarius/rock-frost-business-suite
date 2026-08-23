# Design System

## Public-site visual and editorial direction

Public pages use restrained corporate layouts, moderate headline sizes, clear
typographic hierarchy, solid surfaces, subtle borders, and limited shadow.
Avoid decorative blurred orbs, oversized glow effects, glass-heavy panels,
fixed multicolour gradients, and other patterns that make the site feel like a
generic generated template. The em dash character is prohibited in all public
copy; rewrite with normal sentence punctuation instead.

## Foundation

shadcn/ui (Base UI primitives, `base-nova` preset) + Tailwind CSS v4. See `docs/DECISIONS.md` for the license/rationale and why this was chosen over a purchased dashboard template.

- **Base color**: neutral, with RF blue reserved for primary actions, active navigation, focus, and operational emphasis. The accent is semantic rather than decorative.
- **Icons**: `lucide-react`, size `size-4` (16px) in nav/inline contexts, `size-5`–`size-6` for feature/empty-state icons.
- **Font**: Geist (via `next/font/google`), applied through the `--font-sans` CSS variable in the root layout.
- **Dark mode**: `next-themes`, class-based (`.dark` on `<html>`), system-aware by default. Every shadcn component ships both light and dark tokens already — don't hardcode colors outside the token system.
- **Theme tokens**: defined as CSS variables in `src/app/globals.css` (`--background`, `--foreground`, `--primary`, `--card`, `--border`, etc., plus matching `.dark` overrides). Use Tailwind's semantic classes (`bg-background`, `text-muted-foreground`, `border-border`) — never a raw hex/oklch value in a component.

## Brand and application icons

- The authoritative raster RF mark is `public/rf logo.png`; keep it unchanged as the source asset. Application chrome uses the optically cropped `src/app/icon.png` derivative rather than shrinking the detailed source at runtime.
- Browser and installed-app icons use the complete RF mark, tightly cropped to its alpha bounds and centered on the brand navy `#0b1220` rounded square.
- Next.js file-convention assets are `src/app/favicon.ico` (16/32/48), `src/app/icon.png` (32), and `src/app/apple-icon.png` (180). The web manifest references `public/icon-192.png` and `public/icon-512.png`.
- Regenerate every size from the source image. Do not enlarge a favicon-sized derivative or redraw the RF geometry.

## Component conventions

- shadcn primitives live in `src/components/ui/` — generated code. If you need to change one, prefer re-running `npx shadcn@latest add <name> --overwrite` after adjusting `components.json`/registry config, rather than hand-editing generated internals out of sync with upstream.
- **`render` prop, not `asChild`.** This is Base UI, not Radix — see `docs/ARCHITECTURE.md`'s note on this. Getting this wrong produces a runtime error ("Functions cannot be passed directly to Client Components...") if the element also crosses a Server→Client boundary, or a silent accessibility warning if it doesn't.
- Reusable page-level components live in `src/components/layout/` (`AppShell`, `PageHeader`, `Logo`, `PublicHeader`/`PublicFooter`) and `src/components/navigation/` (`SidebarNav`, `ModuleLauncher`, `UserMenu`) — use these rather than rebuilding page chrome per-route.
- `EmptyState` (`src/components/feedback/empty-state.tsx`) is the standard pattern for "no data yet" and "not built yet" states. Every placeholder page in this rebuild uses it rather than inventing ad-hoc placeholder markup per page.
- `PageHeader` (`src/components/layout/page-header.tsx`) is the standard top-of-page title/description/actions pattern.
- `OverviewMetricCard` (`src/components/dashboard/overview-metric-card.tsx`) is the standard stat card for every module's overview page and every platform/organization-level metric: icon in an `IconBadge`, the whole card is a clickable `Link` when `href` is given (falls back to a plain non-interactive card when it isn't — e.g. a metric with no natural drill-down page), and a one-line `description` explaining what the number means. All 13 modules use it as of 2026-08-11 (fixed 11 pages — Fleet, Installment, CRM, Inventory, Accounting, HR, Payroll, Procurement, Projects, Analytics, POS — that had drifted onto a hand-rolled `Card` with a plain `text-muted-foreground` icon and a separate button; Hotel and School already used it), and `/app/platform/dashboard`'s three top-line stats were migrated onto it the same day. Don't hand-roll a new stat-card pattern per module — every numeric metric card goes through this one component so icon color and card behavior can't drift apart again.
- `ModuleShowcase` (`src/components/marketing/module-showcase.tsx`) renders an illustrative in-app preview on a module's public landing page (`/modules/[moduleKey]`), right after the hero. It looks up the module key in `MODULE_SHOWCASES` and renders nothing if that module has no showcase configured; as of 2026-08-22 all 14 catalogue-visible modules have one (Hostel was the last gap, found and fixed that day — `MODULE_SHOWCASES` is now exported and `test/module-showcase-coverage.test.ts` asserts every `catalogueModuleRegistry` key has an entry, so a future module added without a showcase fails a test instead of silently rendering nothing). Each showcase is a plain `h2` (no eyebrow label, matching this page's other sections and the homepage's `Modules` section) followed by an overview panel plus 1-2 feature panels, built from the shared kit in `src/components/marketing/module-showcases/kit.tsx` (`BrowserFrame`, `StatTile`, `FieldBox`, `PanelHeader`, `PanelNote`, `ShowcaseSection`) so every module's mockup shares the same visual language. Content is hand-built with clearly fictional sample data, never a real organization's records, matching the disclosure convention `CustomerShowcase` already uses for its `isDemo` entries — `ShowcaseSection` renders that disclosure line automatically. Add a new module's showcase by writing a component with the kit and registering it in `MODULE_SHOWCASES`.
- `IconBadge` (`src/components/ui/icon-badge.tsx`) is the single definition of the RF-blue icon treatment (`bg-primary/10 text-primary`, three sizes: `sm`/`md`/`lg`) — never write `bg-primary/10 text-primary` inline. It backs `OverviewMetricCard` and every module/feature tile across the product: the per-module dashboard widgets on `/app/dashboard`, the `/app/modules` and `/app/dashboard` module cards, the header `ModuleLauncher` dialog, and the public marketing site's module grid (home, `/modules`), `/solutions` pillars, and `/industries` cards. A plain `text-muted-foreground` icon with no badge is reserved for a genuinely different role — a small icon sitting beside a section heading inside an already-titled card (e.g. `SettingsIcon` next to "Settings", `Activity` next to "Module adoption") — not for anything representing a module, metric, or feature in its own right.

## Anti-patterns (explicitly rejected)

Per the project brief, the following are not acceptable anywhere in this product:

- Gradients used decoratively, glassmorphism, neon effects
- Oversized cards, giant rounded corners
- Dashboard widgets or metrics that don't correspond to real data (see `docs/DATABASE_STRATEGY.md` — placeholder pages must say "not built yet," never fabricate a number)
- Every section wrapped in a card "by default" regardless of whether it needs one
- Emoji used as interface icons (use `lucide-react`)
- Crowded or duplicated navigation (see `docs/MODULE_BOUNDARIES.md`)
- Generic lorem ipsum or unprofessional placeholder copy

## Responsive behavior

`AppShell` provides a sticky, user-collapsible desktop sidebar and stores that preference locally. The collapsed rail retains icons, active-state shape, accessible names, and tooltips. Below `lg`, navigation uses a full-height constrained `Sheet` with independently scrolling links and closes only after a route is selected. This is the reference pattern for future mobile navigation; do not build a second one.

Long module menus may use `ModuleNavItem.group` to create quiet, noninteractive section labels. Active-route selection always chooses the longest segment-boundary match so an overview and a nested route are never highlighted simultaneously.

## Reference points (inspiration only, never copy proprietary UI)

Linear, Stripe Dashboard, Ramp, Vercel, Notion, Shopify Admin — used only to calibrate information density, restraint, and interaction polish, not as a source of literal design assets.
