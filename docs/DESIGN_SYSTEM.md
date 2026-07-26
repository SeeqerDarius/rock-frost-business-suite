# Design System

## Foundation

shadcn/ui (Base UI primitives, `base-nova` preset) + Tailwind CSS v4. See `docs/DECISIONS.md` for the license/rationale and why this was chosen over a purchased dashboard template.

- **Base color**: neutral (gray scale — restrained, not colorful-by-default).
- **Icons**: `lucide-react`, size `size-4` (16px) in nav/inline contexts, `size-5`–`size-6` for feature/empty-state icons.
- **Font**: Geist (via `next/font/google`), applied through the `--font-sans` CSS variable in the root layout.
- **Dark mode**: `next-themes`, class-based (`.dark` on `<html>`), system-aware by default. Every shadcn component ships both light and dark tokens already — don't hardcode colors outside the token system.
- **Theme tokens**: defined as CSS variables in `src/app/globals.css` (`--background`, `--foreground`, `--primary`, `--card`, `--border`, etc., plus matching `.dark` overrides). Use Tailwind's semantic classes (`bg-background`, `text-muted-foreground`, `border-border`) — never a raw hex/oklch value in a component.

## Brand and application icons

- The authoritative raster RF mark is `public/rf logo.png`; keep it unchanged as the source asset.
- Browser and installed-app icons use the complete RF mark, tightly cropped to its alpha bounds and centered on the brand navy `#0b1220` rounded square.
- Next.js file-convention assets are `src/app/favicon.ico` (16/32/48), `src/app/icon.png` (32), and `src/app/apple-icon.png` (180). The web manifest references `public/icon-192.png` and `public/icon-512.png`.
- Regenerate every size from the source image. Do not enlarge a favicon-sized derivative or redraw the RF geometry.

## Component conventions

- shadcn primitives live in `src/components/ui/` — generated code. If you need to change one, prefer re-running `npx shadcn@latest add <name> --overwrite` after adjusting `components.json`/registry config, rather than hand-editing generated internals out of sync with upstream.
- **`render` prop, not `asChild`.** This is Base UI, not Radix — see `docs/ARCHITECTURE.md`'s note on this. Getting this wrong produces a runtime error ("Functions cannot be passed directly to Client Components...") if the element also crosses a Server→Client boundary, or a silent accessibility warning if it doesn't.
- Reusable page-level components live in `src/components/layout/` (`AppShell`, `PageHeader`, `Logo`, `PublicHeader`/`PublicFooter`) and `src/components/navigation/` (`SidebarNav`, `ModuleLauncher`, `UserMenu`) — use these rather than rebuilding page chrome per-route.
- `EmptyState` (`src/components/feedback/empty-state.tsx`) is the standard pattern for "no data yet" and "not built yet" states. Every placeholder page in this rebuild uses it rather than inventing ad-hoc placeholder markup per page.
- `PageHeader` (`src/components/layout/page-header.tsx`) is the standard top-of-page title/description/actions pattern.

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

`AppShell` collapses its persistent sidebar below the `lg` breakpoint and exposes navigation via a `Sheet` (slide-out drawer) triggered from the topbar's menu button — this is the reference pattern for any future mobile-nav need, don't build a second one.

## Reference points (inspiration only, never copy proprietary UI)

Linear, Stripe Dashboard, Ramp, Vercel, Notion, Shopify Admin — used only to calibrate information density, restraint, and interaction polish, not as a source of literal design assets.
