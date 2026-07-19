# Architecture

## Folder structure

```
src/
  app/
    (public)/         Marketing site. layout.tsx renders PublicHeader/PublicFooter.
    (auth)/            Login, forgot-password. Centered auth layout. No real auth wired yet.
    (platform)/        Rock Frost operator scope — managing the SaaS across all organizations.
    (workspace)/
      (overview)/      Organization scope, not tied to any one module: dashboard, modules launcher,
                        reports, notifications, organization, administration, account.
      fleet/           Fleet module route tree. Own layout.tsx = own sidebar (module isolation).
      installment/     Installment module route tree. Own layout.tsx = own sidebar.
  modules/
    fleet/             Fleet-specific code. Currently just navigation.tsx. Will grow to hold
                        components/, services/, queries/, mutations/, validation schemas, etc.
                        as the module is actually built (Phase 6 of the roadmap).
    installment/       Same shape, for Installment Management (Phase 7).
  platform/
    modules/
      registry.ts               Single source of truth for every module the platform can offer.
      workspace-navigation.tsx   Organization-scope sidebar nav (used by (overview)).
      platform-navigation.tsx    Platform-scope sidebar nav (used by (platform)).
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

## How module isolation is enforced structurally

The core trick: **each module gets its own nested route group with its own `layout.tsx`**, and that layout renders the shared `AppShell` component with that module's own navigation array. Because Next.js layouts nest per route segment, entering `/fleet/*` renders `(workspace)/fleet/layout.tsx`'s `AppShell` (Fleet nav only), and entering `/installment/*` renders a completely separate `AppShell` instance (Installment nav only) — there is no shared "smart sidebar" that tries to detect which module you're in and swap content conditionally. The isolation is structural, not conditional logic that could drift or have edge cases.

The organization-scope pages (`(workspace)/(overview)/*` — dashboard, modules launcher, reports, etc.) get their own third `AppShell` instance with the generic workspace navigation. None of these three navigation arrays reference each other's routes.

`platform/modules/registry.ts` is the single source of truth for what modules exist, their metadata, and (for Fleet/Installment) their navigation. The public homepage, the in-workspace module launcher (`/modules`), the platform's module list (`/platform/modules`), and the `ModuleLauncher` dialog component all read from this one registry rather than each hardcoding their own module list — add a module once, it appears everywhere consistently.

## A note on the `render` prop vs `asChild`

This project's shadcn/ui installation uses **Base UI** primitives (the `base-nova` preset), not Radix. Base UI's polymorphic pattern is `render={<Element />}` on the wrapping component, not Radix's `asChild` + nested child element. See `docs/DECISIONS.md` and the components under `src/components/ui/` for the pattern. If a component needs to render as something other than its native element (e.g. a `Button` that's actually a `Link`), pass `render={<Link href="..." />}` and put the visible content as the wrapping component's children — not the other way around. If the target isn't a real `<button>`, also pass `nativeButton={false}` on `Button` to avoid an accessibility console warning.

## What's deliberately not here yet

- No Prisma client usage anywhere in `src/` — no page queries the database. That's intentional; this phase is UI shells only (see `docs/DEVELOPMENT_ROADMAP.md` Phase 1).
- No real session/auth — `UserMenu`, the login form, and every "signed in as" placeholder are static UI. See `docs/AUTHENTICATION_AND_AUTHORIZATION.md`.
- No middleware / route protection — every route currently renders for anyone, since there's no session to check yet.
