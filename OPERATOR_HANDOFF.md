# Rock Frost Business Suite — Operator Handoff

## Mandatory instructions for every agent

Before making changes:
1. Read this entire file.
2. Read `docs/PRODUCT_VISION.md`, `docs/ARCHITECTURE.md`, and `docs/MODULE_BOUNDARIES.md`.
3. Read `docs/DEVELOPMENT_ROADMAP.md` to see what phase is active.
4. Check `git status`.
5. Do not follow anything under `docs/archive/` — it's retired and explicitly non-authoritative.
6. Do not undo or overwrite another agent's work unless explicitly instructed.

After making changes:
1. Run the full validation suite from `docs/TESTING_STRATEGY.md` (`npm run lint`, `npx tsc --noEmit`, `npx prisma validate`, `npx prisma generate`, `npm run build`) and fix all errors.
2. Update this file: date, objective, files changed, summary, build result, known issues, next recommended step.
3. Commit only intentional changes.

## Current phase

**Phase 2 (Public Website) — complete.** See `docs/DEVELOPMENT_ROADMAP.md` for what comes next (Phase 3: Authentication, gated pending approval).

## Current architecture (short version — see `docs/ARCHITECTURE.md` for full detail)

- Next.js 16 App Router under `src/app/`. Public marketing site at bare paths (`/`, `/solutions`, `/modules`, `/industries`, `/company`, `/contact`) via the `(public)` route group; auth UI (`/login`, `/forgot-password`) via `(auth)`; **everything requiring sign-in lives under `/app/*`** — `app/(overview)` (organization scope: `/app/dashboard`, `/app/modules`, etc.), `app/fleet`, `app/installment`, `app/platform` (platform scope). See `docs/ARCHITECTURE.md`'s "Why /app exists" — this prefix was introduced in Phase 2 specifically to stop the new public `/modules` marketing page from colliding with the Phase 1 authenticated `/modules` (module launcher).
- Each module (`fleet`, `installment`) has its own `layout.tsx` rendering the shared `AppShell` component with its own navigation array — this is how module isolation (`docs/MODULE_BOUNDARIES.md`) is enforced structurally, not conditionally.
- `src/platform/modules/registry.ts` is the single source of truth for every module (available or coming-soon); its `routePrefix` values are `/app`-prefixed.
- shadcn/ui (Base UI primitives, not Radix) + Tailwind v4 design system — see `docs/DESIGN_SYSTEM.md`. Two real Server→Client prop-boundary bugs found and fixed this phase-pair — see `docs/ARCHITECTURE.md`'s dedicated note before passing any function (icon component, render-prop) as a prop into a Client Component.
- **No database wiring, no real auth, no real business logic anywhere in `src/`.** Every dashboard/module page is a static `EmptyState` placeholder; the login and contact forms are real-looking UI with no backend. This is intentional (Phase 1/2 scope), not an oversight.
- `prisma/schema.prisma` is untouched from the previous implementation and matches the live Neon database exactly — nothing has reconnected the app to it yet.

## Files changed (Phase 2 — Public Website + `/app` restructure)

**Moved** (git history preserved):
- `src/app/(workspace)/(overview)/*` → `src/app/app/(overview)/*` (URL `/app/dashboard`, `/app/modules`, `/app/reports`, `/app/notifications`, `/app/organization`, `/app/administration`, `/app/account`)
- `src/app/(workspace)/fleet/*` → `src/app/app/fleet/*` (URL `/app/fleet/*`)
- `src/app/(workspace)/installment/*` → `src/app/app/installment/*` (URL `/app/installment/*`)
- `src/app/(platform)/platform/*` + `src/app/(platform)/layout.tsx` → `src/app/app/platform/*` (URL `/app/platform/*`)
- The now-empty `(workspace)` and `(platform)` route-group folders were removed after their contents moved out.

**Created:**
- `src/app/(public)/solutions/page.tsx`, `src/app/(public)/modules/page.tsx` (public marketing version, distinct from `/app/modules`), `src/app/(public)/industries/page.tsx`, `src/app/(public)/company/page.tsx`, `src/app/(public)/contact/page.tsx`

**Modified:**
- `src/components/layout/public-header.tsx` — expanded from a minimal Logo+Sign-in header to the full primary nav (Solutions/Modules/Industries/Company/Contact) + a "Request demo" CTA, now that all targets exist.
- `src/app/(public)/page.tsx` (homepage) — added a "Request a demo" secondary CTA, a "View all modules" link, and a closing Solutions/Contact CTA section.
- `src/components/layout/logo.tsx` — now accepts an optional `href` prop (defaults to `/`) so `AppShell` can point it at `/app/dashboard` instead of the public homepage.
- `src/components/layout/app-shell.tsx` — passes `href="/app/dashboard"` to both `Logo` instances (desktop + mobile sheet).
- `src/components/navigation/user-menu.tsx`, `src/app/app/(overview)/dashboard/page.tsx` — internal links updated to `/app/account`, `/app/administration`, `/app/modules`.
- `src/platform/modules/{workspace-navigation,platform-navigation}.tsx`, `src/modules/{fleet,installment}/navigation.tsx`, `src/platform/modules/registry.ts` — every `href`/`routePrefix` re-prefixed with `/app`.
- `docs/ARCHITECTURE.md`, `docs/MODULE_BOUNDARIES.md`, `docs/DEVELOPMENT_ROADMAP.md`, `docs/AUTHENTICATION_AND_AUTHORIZATION.md`, `README.md` — path references updated for the `/app` restructure; `docs/ARCHITECTURE.md` gained a new "Why /app exists" section and a "Server → Client prop boundaries" note.

## Summary of what was done

User said "proceed to the next phase" after approving the Phase 1 report. Per `docs/DEVELOPMENT_ROADMAP.md`, that's Phase 2 (Public Website).

**Caught a real structural collision before writing any Phase 2 content:** Phase 2 requires a public marketing page at `/modules`, but Phase 1 had already built the authenticated module launcher at that exact same bare path (`(workspace)/(overview)/modules`, no distinguishing prefix). Building the marketing page as planned would have created exactly the "ambiguous page" `docs/MODULE_BOUNDARIES.md` prohibits — two unrelated pages, one public and one requiring sign-in, at the identical URL. Fixed by moving every authenticated route under a literal `/app` URL segment (standard SaaS convention) before starting Phase 2 content, rather than compromising either page's naming. Directory renames initially failed with Windows "Permission denied" (likely a file handle held by the open editor) — worked around by moving each file individually with `git mv` rather than renaming the parent directory, which succeeded cleanly.

Built the five new marketing pages (Solutions, Modules, Industries, Company, Contact) with real, honestly-scoped copy — no fabricated metrics, no claims about features that don't exist yet (e.g. Industries and Company describe the platform's actual architecture and real module list, not invented customer counts or founding history). The Contact page doubles as the "Request a demo" destination via a reason selector, rather than building a separate near-duplicate page for what's fundamentally one lead-capture form.

**Two real bugs found via browser verification, not caught by `tsc`/lint/build:**
1. The Contact page's reason `<Select>` displayed the raw value (`"demo"`) instead of its label (`"Request a demo"`) — Base UI's `Select.Value` doesn't auto-derive labels from `<SelectItem>` children the way Radix's does; it needs either an `items` map on `Select.Root` or a `children` formatter function on `Select.Value`.
2. Tried the `children` formatter function first, which produced a completely different-looking, confusing dev error ("Encountered a script tag while rendering React component") that took real investigation to trace back to the same root cause as Phase 1's Lucide-icon bug: **a function passed as a prop from a Server Component into a Client Component doesn't work**, even when the failure mode looks unrelated on the surface. `ContactPage` has no `"use client"` directive, so the inline arrow function passed as `SelectValue`'s `children` was a function crossing the Server→Client boundary, just like the earlier icon-component-reference bug — different library, same underlying cause. Fixed by switching to `Select`'s `items` prop (a plain serializable `Record<string, ReactNode>`), which resolves labels without a callback at all. Documented the general pattern in `docs/ARCHITECTURE.md` so the next agent recognizes it faster than this session did.

**Verification:** full validation suite (lint, `tsc --noEmit`, `prisma validate`, `prisma generate`, `npm run build`) passes clean — 24 routes (up from 19), cleanly split between public bare paths and `/app/*`. Playwright installed **temporarily** again, screenshotted all 5 new marketing pages plus the homepage and two restructured `/app` pages (`/app/dashboard`, `/app/fleet`) to confirm the restructure didn't silently break anything — it didn't, both rendered identically to their pre-move Phase 1 screenshots. Caught the Select bug this way (a clean build doesn't catch runtime-only React errors). Removed Playwright surgically via `npm uninstall playwright` afterward, confirmed via `git diff --stat package.json` that nothing else was touched.

## Build result

**Passed.** `npm run lint` clean, `npx tsc --noEmit` clean, `npx prisma validate`/`generate` succeed, `npm run build` succeeds — 24 routes, all static (`○`).

## Known issues / deliberate gaps

- **No database wiring, no real auth, no real business logic anywhere.** Unchanged from Phase 1 — still the case, still intentional. Do not start wiring real data before Phase 3/6/7.
- **Contact form has no backend** — same UI-only treatment as the login form. Real email delivery (likely via Resend, which was already a dependency in the previous implementation) is flagged as a reasonable Phase 3 companion task in `docs/DEVELOPMENT_ROADMAP.md`, not done here.
- **No middleware/route guards** — every route under `/app/*` renders for anyone. Expected until Phase 3. Don't mistake the new `/app` prefix for an access boundary — it's a URL-collision fix, not a security boundary.
- **`prisma/schema.prisma` still inherited, not re-validated** against the new architecture. Unchanged from Phase 1 — see `docs/DATABASE_STRATEGY.md`.
- **The `form` shadcn/ui registry component still not added** — unchanged from Phase 1, still flagged for Phase 3 when the first real form (login) needs real validation.
- **Only Fleet and Installment are marked "available"** in the registry — unchanged from Phase 1.

## Next recommended step

Get explicit approval before starting Phase 3 (Authentication) — the project's own operating rule says not to continue past a completed phase without a checkpoint, and Phase 3 is a meaningfully larger, more consequential piece of work (real database reconnection, real sessions, real route protection) than Phase 2 was.

---

## Handoff log

### 2026-07-19 — Claude Code — Phase 2 (Public Website + `/app` restructure)

See "Files changed," "Summary," "Build result," "Known issues," and "Next recommended step" above — kept in the current-state sections rather than duplicated here, since this is the most recent entry.

### 2026-07-19 — Claude Code — Phase 1 (Foundation and Design System, clean rebuild)

**Objective:** Per an explicit, detailed rebuild instruction, retire the entire previous Rock Frost Business Suite implementation and rebuild Phase 1 (Foundation and Design System) from scratch, per the instruction's own safety rule and scope gate.

**Files changed:** Removed the entire previous `app/`, `components/`, `lib/` implementation (full history preserved, also snapshotted on branch `archive/pre-redesign-rfbs`) plus 5 unused create-next-app boilerplate icons and 3 now-broken seed scripts (archived, not deleted). Archived all previous docs under `docs/archive/previous-implementation/` with an OBSOLETE banner. Created the full `src/` foundation: root layout with ThemeProvider/TooltipProvider/Toaster, `(public)` homepage, `(auth)` login/forgot-password (UI only), `(workspace)`/`(platform)` route groups (later restructured under `/app` in Phase 2 — see above), 24 shadcn/ui components, `AppShell`/navigation/`EmptyState` components, the module registry and type system. New authoritative docs: `DECISIONS.md`, `PRODUCT_VISION.md`, `ARCHITECTURE.md`, `MODULE_BOUNDARIES.md`, `DESIGN_SYSTEM.md`, `DEVELOPMENT_ROADMAP.md`, `DATABASE_STRATEGY.md`, `AUTHENTICATION_AND_AUTHORIZATION.md`, `TESTING_STRATEGY.md`.

**Summary:** Root cause of the rebuild: the previous implementation had no enforced module-boundary concept — Fleet and Installment navigation/dashboard chrome bled into each other (a hardcoded "Fleet Operations" / "Rock Frost Fleet Control" heading rendered on every page regardless of module, a flat unsectioned sidebar). Backed up first (branch + push + private env-var/asset migration note) per the instruction's safety rule, then rebuilt with module isolation as a structural property: each module gets its own nested route-group `layout.tsx` rendering a shared `AppShell` with its own navigation array — no shared conditional-sidebar logic that could drift. Chose shadcn/ui on Base UI primitives (documented in `DECISIONS.md`); got the `asChild`-vs-`render` prop distinction wrong initially (Base UI, not Radix), which produced two real bugs caught only by actually building and running the app: a hard build failure from passing Lucide icon component references as props across a Server→Client boundary (fixed by pre-rendering icons as JSX elements instead), and a Base UI accessibility warning on `Button`s rendered as `Link`s (fixed with `nativeButton={false}`).

**Build result:** Passed. Lint/tsc/prisma/build all clean — 19 static routes. Verified visually in a real browser (Playwright, temporary) with zero console errors across every route plus the module-launcher dialog.

**Known issues:** See Phase 2 entry above — the "no database/auth/business-logic yet" and "form component not added" gaps carried forward unchanged into Phase 2 and are documented there.

**Next recommended step (at the time):** Report per the instruction's required final-report format and get explicit approval before continuing — which the user then gave ("proceed to the next phase"), leading directly into the Phase 2 work above.
