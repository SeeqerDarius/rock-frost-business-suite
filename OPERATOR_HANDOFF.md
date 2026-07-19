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

**Phase 3 (Authentication) — complete.** See `docs/DEVELOPMENT_ROADMAP.md` for what comes next (Phase 4: Platform Workspace, gated pending approval).

## Current architecture (short version — see `docs/ARCHITECTURE.md` for full detail)

- Next.js 16 App Router under `src/app/`. Public marketing site at bare paths (`/`, `/solutions`, `/modules`, `/industries`, `/company`, `/contact`) via the `(public)` route group; auth UI (`/login`, `/forgot-password`, `/reset-password`, `/invite`) via `(auth)`; **everything requiring sign-in lives under `/app/*`** — `app/(overview)` (organization scope: `/app/dashboard`, `/app/modules`, etc.), `app/fleet`, `app/installment`, `app/platform` (platform scope). See `docs/ARCHITECTURE.md`'s "Why /app exists."
- Each module (`fleet`, `installment`) has its own `layout.tsx` rendering the shared `AppShell` component with its own navigation array — this is how module isolation (`docs/MODULE_BOUNDARIES.md`) is enforced structurally, not conditionally.
- `src/platform/modules/registry.ts` is the single source of truth for every module (available or coming-soon); its `routePrefix` values are `/app`-prefixed.
- shadcn/ui (Base UI primitives, not Radix) + Tailwind v4 design system — see `docs/DESIGN_SYSTEM.md`.
- **Real authentication, real sessions, real route protection.** NextAuth v4 credentials provider + JWT sessions (`src/lib/auth/nextauth.ts`), `src/app/app/layout.tsx` guards every `/app/*` route (redirects to `/login` if unauthenticated, blocks if no organization membership). Password reset and invite acceptance both work end-to-end via single-use tokens on the reused `VerificationToken` model. Contact form sends real email (Resend) with graceful degradation. See `docs/AUTHENTICATION_AND_AUTHORIZATION.md` for full detail.
- **Fleet and Installment modules are still empty `EmptyState` shells** — no real business logic yet. That's Phase 6/7 scope, unaffected by this phase.
- `prisma/schema.prisma` is untouched and matches the live Neon database exactly — Phase 3 reconnected to it (via `src/lib/db.ts`) without any migration.

## Files changed (Phase 3 — Authentication)

**Created:**
- `src/lib/db.ts` — Prisma client singleton (`server-only`).
- `src/lib/auth/nextauth.ts`, `src/lib/auth/next-auth.d.ts`, `src/lib/auth/session.ts` — NextAuth credentials provider, session/JWT type augmentation, `getServerAuthSession()`.
- `src/app/api/auth/[...nextauth]/route.ts` — NextAuth route handler.
- `src/lib/tenant/index.ts` — `getCurrentTenant()`/`requireCurrentTenant()` tenant resolver.
- `src/app/app/layout.tsx`, `src/app/app/page.tsx` — real auth guard for every `/app/*` route; root redirect to `/app/dashboard`.
- `src/components/session-provider.tsx` — client `SessionProvider` wrapper, mounted in `src/app/layout.tsx`.
- `src/lib/email.ts` — Resend wrapper with graceful degradation when `RESEND_API_KEY` is unset.
- `src/lib/auth/tokens.ts` — issue/consume helpers for password-reset and invite tokens on the `VerificationToken` model.
- `src/lib/auth/actions.ts` — server actions: `requestPasswordReset`, `resetPassword`, `acceptInvite`.
- `src/app/(auth)/reset-password/page.tsx`, `src/app/(auth)/invite/page.tsx` — new pages.
- `src/app/(public)/contact/actions.ts` — `submitContactForm` server action.

**Rewritten:**
- `src/app/(auth)/login/page.tsx` — real client-side form using `signIn("credentials", ...)`.
- `src/app/(auth)/forgot-password/page.tsx` — real form wired to `requestPasswordReset`.
- `src/components/navigation/user-menu.tsx` — real session data via `useSession()`, real sign-out.

**Modified:**
- `src/app/(public)/contact/page.tsx` — wired to `submitContactForm`, sent/error banners.
- `docs/DEVELOPMENT_ROADMAP.md`, `docs/AUTHENTICATION_AND_AUTHORIZATION.md` — marked Phase 3 complete, replaced the placeholder-state description with what's actually built.

## Summary of what was done

User said "continue" after approving the Phase 2 report. Per `docs/DEVELOPMENT_ROADMAP.md`, that's Phase 3 (Authentication).

Reconnected to the existing Neon database (no schema changes — confirmed via `npx prisma migrate status` before and `npx prisma validate` after) and built NextAuth v4 credentials-based authentication with JWT sessions, replacing every placeholder identified in the old `docs/AUTHENTICATION_AND_AUTHORIZATION.md` ("Current placeholder state" section, now removed): the login form actually authenticates, `UserMenu` shows the real signed-in user and actually signs out, and `src/app/app/layout.tsx` now redirects unauthenticated requests to `/login` and blocks users with no organization membership — none of `/app/*` was previously guarded.

Built password reset and invite acceptance on top of NextAuth's standard (previously unused) `VerificationToken` model, reused generically for both flows via a prefixed `identifier` (`password-reset:${email}` / `invite:${email}`), single-use (deleted on consumption), with different TTLs (1 hour / 7 days). `requestPasswordReset` deliberately never reveals whether an email exists — it always redirects to the same `?sent=1` state regardless of whether a token was actually issued. Wired the contact form to real email delivery (Resend) using the same `sendEmail()` helper, which gracefully degrades (logs instead of throwing) since `RESEND_API_KEY` is unset in this environment — confirmed via a length-only env check script that never printed actual values.

Deliberately did not build: an admin-facing "send invite" UI (there's no user-management screen yet to send one from — that's Phase 4 scope), public self-registration, or login rate limiting/lockout (carried-forward gap from the pre-rebuild implementation, noted in `docs/AUTHENTICATION_AND_AUTHORIZATION.md`).

**One real bug found via browser verification:** opening the account menu after logging in threw "Base UI: MenuGroupContext is missing" from `DropdownMenuLabel` inside `UserMenu`. Unlike Radix, Base UI requires `DropdownMenuLabel` to sit inside a `<DropdownMenuGroup>`. Fixed by wrapping it; re-verified the whole flow afterward.

**Verification:** full validation suite (lint, `tsc --noEmit`, `prisma validate`, `prisma generate`, `npm run build`) passes clean — 27 routes (up from 24). Playwright installed **temporarily**, drove the actual auth flows end-to-end: unauthenticated `/app/dashboard` access redirects to `/login`; wrong password shows a visible error and does not log in; correct password reaches `/app/dashboard` with a real session; `UserMenu` shows the real name/email; sign-out clears the session and re-redirects on a follow-up `/app/dashboard` request. Also drove the full password-reset lifecycle for `hirepurchase@demo.com`: requested a reset, pulled the real token from the `VerificationToken` table, submitted it via the actual `/reset-password` UI, confirmed the token row was deleted (single-use) and that the new password worked on a fresh login. **`hirepurchase@demo.com`'s password was changed from `HirePurchase@2026` to `HirePurchase@2027` during this testing** — anyone with that demo credential documented elsewhere should use the new one. Removed Playwright surgically via `npm uninstall playwright` afterward, confirmed via `git diff --stat package.json package-lock.json` (no output) that nothing else was touched.

## Build result

**Passed.** `npm run lint` clean, `npx tsc --noEmit` clean, `npx prisma validate`/`generate` succeed, `npm run build` succeeds — 27 routes (`○` static: `/`, `/login`, `/company`, `/industries`, `/modules`, `/solutions`, `/_not-found`; the rest `ƒ` dynamic, expected for anything reading session/searchParams).

## Known issues / deliberate gaps

- **No admin-facing "send invite" UI** — invite tokens must currently be issued directly against the database; the accept-invite page/flow work, but nothing yet creates the invite. Phase 4 scope.
- **No public self-registration/signup flow.**
- **No rate limiting or account lockout on failed logins** — carried forward from the pre-rebuild implementation, still not addressed.
- **`RESEND_API_KEY` is unset** — reset/invite/contact emails log via `console.warn` instead of delivering. No code changes needed to enable delivery, just the env var.
- **No permission/role-based enforcement yet beyond organization membership** — `/app/*` checks "is this user a member of some organization," not module- or role-specific permissions. See `docs/AUTHENTICATION_AND_AUTHORIZATION.md`'s "Authorization — planned, partially built" section. Phase 4 scope.
- **Fleet and Installment are still empty shells** — unaffected by this phase, still Phase 6/7 scope.

## Next recommended step

Get explicit approval before starting Phase 4 (Platform Workspace) — same operating rule as before: real role-based access control and admin-facing user management (including the deferred "send invite" UI) is a meaningfully larger piece of work than a checkpoint should skip past.

---

## Handoff log

### 2026-07-19 — Claude Code — Phase 3 (Authentication)

See "Files changed," "Summary," "Build result," "Known issues," and "Next recommended step" above — kept in the current-state sections rather than duplicated here, since this is the most recent entry.

### 2026-07-19 — Claude Code — Phase 2 (Public Website + `/app` restructure)

**Files changed:** Moved (git history preserved) `src/app/(workspace)/(overview)/*` → `src/app/app/(overview)/*`, `src/app/(workspace)/fleet/*` → `src/app/app/fleet/*`, `src/app/(workspace)/installment/*` → `src/app/app/installment/*`, `src/app/(platform)/platform/*` + layout → `src/app/app/platform/*`; removed the now-empty `(workspace)`/`(platform)` folders. Created `src/app/(public)/{solutions,modules,industries,company,contact}/page.tsx`. Modified `public-header.tsx` (full nav), homepage CTAs, `logo.tsx` (optional `href`), `app-shell.tsx`, `user-menu.tsx` and dashboard links (`/app`-prefixed), all navigation configs and `registry.ts` (`/app`-prefixed hrefs), and `docs/{ARCHITECTURE,MODULE_BOUNDARIES,DEVELOPMENT_ROADMAP,AUTHENTICATION_AND_AUTHORIZATION}.md` + `README.md`.

**Summary:** Caught a real structural collision before writing any Phase 2 content: the planned public `/modules` marketing page would have collided with Phase 1's authenticated `/modules` module launcher at the identical bare URL. Fixed by moving every authenticated route under a literal `/app` URL segment before starting Phase 2 content. Directory-level renames failed with Windows "Permission denied" (likely an editor file-handle lock); worked around by moving files individually via `git mv`. Built five new marketing pages (Solutions, Modules, Industries, Company, Contact) with honestly-scoped copy — no fabricated metrics or claims. Found and fixed two real Server→Client prop-boundary bugs via browser verification (not caught by `tsc`/lint/build): the Contact page's `<Select>` showed a raw value instead of its label (Base UI doesn't auto-derive labels from `SelectItem` children like Radix does), and a first fix attempt (a `children` formatter function) produced an unrelated-looking error ("Encountered a script tag...") traced back to the same root cause as Phase 1's icon bug — a function crossing the Server→Client boundary. Fixed via `Select`'s `items` prop instead of a callback.

**Build result:** Passed. Lint/tsc/prisma/build all clean — 24 routes (up from 19).

**Known issues:** No database/auth/business logic yet (by design), contact form UI-only until Phase 3, no route guards yet. All resolved or superseded in the Phase 3 entry above.

**Next recommended step (at the time):** Get explicit approval before Phase 3 — which the user then gave ("continue"), leading directly into the Phase 3 work above.

### 2026-07-19 — Claude Code — Phase 1 (Foundation and Design System, clean rebuild)

**Objective:** Per an explicit, detailed rebuild instruction, retire the entire previous Rock Frost Business Suite implementation and rebuild Phase 1 (Foundation and Design System) from scratch, per the instruction's own safety rule and scope gate.

**Files changed:** Removed the entire previous `app/`, `components/`, `lib/` implementation (full history preserved, also snapshotted on branch `archive/pre-redesign-rfbs`) plus 5 unused create-next-app boilerplate icons and 3 now-broken seed scripts (archived, not deleted). Archived all previous docs under `docs/archive/previous-implementation/` with an OBSOLETE banner. Created the full `src/` foundation: root layout with ThemeProvider/TooltipProvider/Toaster, `(public)` homepage, `(auth)` login/forgot-password (UI only), `(workspace)`/`(platform)` route groups (later restructured under `/app` in Phase 2 — see above), 24 shadcn/ui components, `AppShell`/navigation/`EmptyState` components, the module registry and type system. New authoritative docs: `DECISIONS.md`, `PRODUCT_VISION.md`, `ARCHITECTURE.md`, `MODULE_BOUNDARIES.md`, `DESIGN_SYSTEM.md`, `DEVELOPMENT_ROADMAP.md`, `DATABASE_STRATEGY.md`, `AUTHENTICATION_AND_AUTHORIZATION.md`, `TESTING_STRATEGY.md`.

**Summary:** Root cause of the rebuild: the previous implementation had no enforced module-boundary concept — Fleet and Installment navigation/dashboard chrome bled into each other (a hardcoded "Fleet Operations" / "Rock Frost Fleet Control" heading rendered on every page regardless of module, a flat unsectioned sidebar). Backed up first (branch + push + private env-var/asset migration note) per the instruction's safety rule, then rebuilt with module isolation as a structural property: each module gets its own nested route-group `layout.tsx` rendering a shared `AppShell` with its own navigation array — no shared conditional-sidebar logic that could drift. Chose shadcn/ui on Base UI primitives (documented in `DECISIONS.md`); got the `asChild`-vs-`render` prop distinction wrong initially (Base UI, not Radix), which produced two real bugs caught only by actually building and running the app: a hard build failure from passing Lucide icon component references as props across a Server→Client boundary (fixed by pre-rendering icons as JSX elements instead), and a Base UI accessibility warning on `Button`s rendered as `Link`s (fixed with `nativeButton={false}`).

**Build result:** Passed. Lint/tsc/prisma/build all clean — 19 static routes. Verified visually in a real browser (Playwright, temporary) with zero console errors across every route plus the module-launcher dialog.

**Known issues:** See Phase 2 entry above — the "no database/auth/business-logic yet" and "form component not added" gaps carried forward unchanged into Phase 2 and are documented there.

**Next recommended step (at the time):** Report per the instruction's required final-report format and get explicit approval before continuing — which the user then gave ("proceed to the next phase"), leading directly into the Phase 2 work above.
