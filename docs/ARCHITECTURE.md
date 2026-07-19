# Architecture

## Folder structure

```
src/
  app/
    (public)/         Marketing site: home, /solutions, /modules, /industries, /company, /contact.
                        layout.tsx renders PublicHeader/PublicFooter.
    (auth)/            /login, /forgot-password. Centered auth layout. No real auth wired yet.
    app/               Everything behind sign-in lives under this literal "app" URL segment
                        (/app/...) — deliberately separate from the public site's bare paths so
                        e.g. the public marketing "/modules" page and the authenticated module
                        launcher never collide on the same URL. See "Why /app exists" below.
      (overview)/      Organization scope, not tied to any one module: /app/dashboard,
                        /app/modules, /app/reports, /app/notifications, /app/organization,
                        /app/administration, /app/account.
      fleet/           Fleet module route tree (/app/fleet/...). Own layout.tsx = own sidebar.
      installment/     Installment module route tree (/app/installment/...). Own layout.tsx = own sidebar.
      platform/        Rock Frost operator scope (/app/platform/...) — managing the SaaS across
                        all organizations. Own layout.tsx = own sidebar, same isolation pattern.
  modules/
    fleet/             Fleet-specific code. Currently just navigation.tsx. Will grow to hold
                        components/, services/, queries/, mutations/, validation schemas, etc.
                        as the module is actually built (Phase 6 of the roadmap).
    installment/       Same shape, for Installment Management (Phase 7).
  platform/
    modules/
      registry.ts               Single source of truth for every module the platform can offer.
                                 routePrefix values are /app-prefixed (e.g. "/app/fleet").
      workspace-navigation.tsx   Organization-scope sidebar nav (used by (overview)).
      platform-navigation.tsx    Platform-scope sidebar nav (used by app/platform).
  components/
    ui/                shadcn/ui primitives — generated code, treat as owned but don't hand-roll
                        edits that fight the generator; re-run `npx shadcn add <name> --overwrite`
                        instead if you need an upstream fix.
    layout/            AppShell, PublicHeader/Footer, Logo, PageHeader — reusable page chrome.
    navigation/         SidebarNav, ModuleLauncher, UserMenu — reusable navigation widgets.
    feedback/           EmptyState, and (later) error/loading state components.
    data-display/       Reserved for reusable table/list rendering components as modules need them.
    forms/              Reserved for reusable form field wrappers as real forms get built.
  lib/                 Shared utilities (currently just shadcn's cn() helper).
  types/                Shared TypeScript types (ModuleDefinition, ModuleNavItem).
prisma/
  schema.prisma         The live database schema. Matches the actual Neon database (unchanged by
                        this rebuild — see docs/DATABASE_STRATEGY.md). Not yet wired into the app.
```

## Why `/app` exists

Phase 1 originally put the authenticated workspace at bare paths (`/dashboard`, `/modules`, `/fleet`, `/platform/dashboard`, etc.), organized only into route groups (which don't affect the URL). Starting Phase 2's public marketing site required a public `/modules` page — which collided directly with the Phase 1 workspace's `/modules` (the module launcher). That's exactly the "no ambiguous pages" violation `docs/MODULE_BOUNDARIES.md` prohibits, so before writing any Phase 2 content, every authenticated route was moved under a literal `/app` URL segment. Public marketing pages keep their natural bare paths (`/solutions`, `/modules`, `/industries`, `/company`, `/contact`); everything requiring sign-in lives at `/app/*`. This is a one-time structural correction, not a pattern that needs repeating — new authenticated pages just go under `src/app/app/<module-or-scope>/`.

## How module isolation is enforced structurally

The core trick: **each module gets its own nested route group with its own `layout.tsx`**, and that layout renders the shared `AppShell` component with that module's own navigation array. Because Next.js layouts nest per route segment, entering `/app/fleet/*` renders `app/fleet/layout.tsx`'s `AppShell` (Fleet nav only), and entering `/app/installment/*` renders a completely separate `AppShell` instance (Installment nav only) — there is no shared "smart sidebar" that tries to detect which module you're in and swap content conditionally. The isolation is structural, not conditional logic that could drift or have edge cases.

The organization-scope pages (`app/(overview)/*` — dashboard, modules launcher, reports, etc.) get their own `AppShell` instance with the generic workspace navigation, and the platform-scope pages (`app/platform/*`) get a fourth, separate instance. None of these navigation arrays reference each other's routes.

`platform/modules/registry.ts` is the single source of truth for what modules exist, their metadata, and (for Fleet/Installment) their navigation. The public modules page (`/modules`), the in-workspace module launcher (`/app/modules`), the platform's module list (`/app/platform/modules`), and the `ModuleLauncher` dialog component all read from this one registry rather than each hardcoding their own module list — add a module once, it appears everywhere consistently.

## A note on the `render` prop vs `asChild`

This project's shadcn/ui installation uses **Base UI** primitives (the `base-nova` preset), not Radix. Base UI's polymorphic pattern is `render={<Element />}` on the wrapping component, not Radix's `asChild` + nested child element. See `docs/DECISIONS.md` and the components under `src/components/ui/` for the pattern. If a component needs to render as something other than its native element (e.g. a `Button` that's actually a `Link`), pass `render={<Link href="..." />}` and put the visible content as the wrapping component's children — not the other way around. If the target isn't a real `<button>`, also pass `nativeButton={false}` on `Button` to avoid an accessibility console warning.

## A note on Server → Client prop boundaries

Two real bugs this rebuild hit so far share one root cause: **passing a function from a Server Component into a Client Component's props doesn't work**, even when it "compiles fine" and only breaks at render/runtime.

1. Passing a Lucide icon **component reference** (a function) as part of a nav-item array from a Server Component layout into the client-side `AppShell` produced a hard build failure ("Functions cannot be passed directly to Client Components"). Fixed by pre-rendering the icon as a JSX element (`icon: <Truck className="size-4" />`) instead of passing the bare component — a rendered element is a plain serializable object; a component reference is a function.
2. Passing an inline `children` **render function** (`{(value) => ...}`) to shadcn's `<SelectValue>` from a Server Component page produced a confusing, unrelated-looking dev error ("Encountered a script tag while rendering React component") — same root cause, different symptom. Fixed by using `Select`'s `items` prop instead (a plain `Record<string, ReactNode>` passed as data, not a function), which lets `SelectValue` resolve the label without a callback at all.

**The pattern to watch for:** if a Client Component's prop type accepts a function (an icon component, a render-prop, a formatter callback) and the component using it lives in a Server Component file (no `"use client"` at the top), don't pass a live function — pass already-rendered JSX or plain data instead. If the error message doesn't obviously mention "Client Component" or "function," that's not proof the cause is different — check for a function crossing that boundary first.

## What's deliberately not here yet

- No Prisma client usage anywhere in `src/` — no page queries the database. That's intentional; Phase 1/2 are UI only (see `docs/DEVELOPMENT_ROADMAP.md`).
- No real session/auth — `UserMenu`, the login form, the contact form, and every "signed in as" placeholder are static UI. See `docs/AUTHENTICATION_AND_AUTHORIZATION.md`.
- No middleware / route protection — every route currently renders for anyone, since there's no session to check yet. This includes everything under `/app/*` — do not assume it's actually gated.
