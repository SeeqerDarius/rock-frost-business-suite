# Onboarding Tours

An interactive, spotlight-style walkthrough shown automatically the first
time a user sees the app, and again the first time they open a module.
Cross-cutting infrastructure like Support Messaging, not a business
module: no registry entry, no module-prefix permission, tenant scope only.

## What runs, and when

Two kinds of tour, both driven by `src/lib/tours/definitions.ts`:

- **General tour** (`tourKey: "general"`): the shared app chrome, shown once
  per user regardless of which page they land on first. Covers the logo/home
  link, the sidebar navigation, the module switcher (skipped in its content
  if the current shell doesn't show one, e.g. a Fleet driver's self-service
  view), and the account menu.
- **Module tour** (`tourKey`: a `BusinessModuleKey`, e.g. `"fleet"`): a
  short, two-step intro shown the first time a user opens that module.
  **Its content is derived automatically** from data that already exists
  for every module: the registry's own customer-facing `description`
  (`src/platform/modules/registry.ts`) and that module's own navigation
  array. There is no hand-written tour script per module, and there does
  not need to be one for a module added in the future either - add a module
  to the registry with a description and navigation array (already required
  for every module) and it gets a working tour with no extra step.

Both trigger from the exact same place: `AppShell` (`src/components/layout/app-shell.tsx`)
mounts one `TourRunner` (`src/components/onboarding/tour-runner.tsx`), passing
the `moduleKey` prop each module's own `layout.tsx` sets on its `<AppShell>`
call (organization- and platform-scope shells pass none, so only the general
tour can ever apply there). `TourRunner` asks the server which of
`["general", moduleKey]` the current user hasn't completed yet
(`getPendingTourKeys` in `src/lib/tours/actions.ts`), and shows them in that
order - general first, then the module's own intro - as two back-to-back
Joyride instances (remounted by `key`, not a single controlled multi-tour
instance) rather than one merged run.

## Why gated on `organization`, not a separate flag

`AppShell` only renders `TourRunner` when its `organization` prop is
present. That prop is already the established signal for "this is a
tenant-scope shell" - `platform/layout.tsx` never passes it (see
`docs/ARCHITECTURE.md`), and `OrganizationSwitcher`/the trial badge already
key off the same prop. Rock Frost's own platform operators never see a
tenant onboarding tour as a result, with no extra conditional to maintain.

## Data model

`UserTourProgress` (`prisma/schema.prisma`): `{id, userId, tourKey,
completedAt}`, unique on `(userId, tourKey)`. **User-scoped, not
organization-scoped** - whether someone has already seen a given tour is a
property of the person, not of any one workspace they happen to be in right
now. A user who has seen Fleet's tour in one organization won't see it again
after joining a second organization that also has Fleet enabled; this is a
deliberate simplification, not an oversight.

`src/lib/tours/service.ts` (`import "server-only"`, touches the database):
`listCompletedTourKeys(userId)`, `markTourCompleted(userId, tourKey)` (an
idempotent upsert - marking an already-completed tour complete again is a
no-op, never an error). `src/lib/tours/actions.ts` are the thin `"use
server"` wrappers `TourRunner` calls directly (no prop-threading through
every module's layout.tsx): `getPendingTourKeys(candidateKeys)` resolves the
session server-side and filters against completed keys, `completeTour(tourKey)`
records completion. Both return silently (no keys / no-op) for an
unauthenticated caller rather than throwing.

## Why `react-joyride`, not a hand-built overlay

This codebase generally prefers hand-building simple, narrowly-scoped UI
(the HR org chart, the platform revenue trend bar list) over adding a
dependency. A real cross-browser element-spotlighting engine - responsive
repositioning on scroll/resize, focus trapping, keyboard dismissal,
scroll-into-view, RTL-safe placement - is a different order of complexity
from a tree layout or a bar list, and is exactly the kind of well-defined,
narrow-purpose problem a small, focused dependency earns its place solving.
`react-joyride` (`^3`) ships its own TypeScript types, has zero
React-version-pinned peer dependencies beyond `react: '16.8 - 19'` /
`react-dom: '16.8 - 19'` (confirmed compatible with this project's React 19
before installing), and is loaded via `next/dynamic(..., {ssr: false})`
since it's a browser-only widget.

**Its v3 API is a real rewrite from the widely-known v2 API** most examples
and AI training data reference - this implementation was built by reading
the installed package's actual `.d.cts` type declarations, not from memory.
Notably: the default export doesn't exist (`import { Joyride } from
"react-joyride"`, not `import Joyride from ...`); the callback prop is
`onEvent` (not `callback`), receiving `EventData`/`Events` constants (not
`CallBackProps`); per-step beacon suppression is `skipBeacon` (not
`disableBeacon`); button visibility is `options.buttons: ButtonType[]`
(not a `showSkipButton` boolean). Re-verify against the installed
`node_modules/react-joyride/dist/index.d.cts` before changing this
integration - don't assume the older API from general knowledge.

Theming reads CSS custom properties directly (`var(--primary)`,
`var(--card)`, `var(--card-foreground)`) rather than hardcoded colors, so
the tour automatically matches the organization's light/dark theme setting
(`OrganizationThemeSync`) without separate light/dark logic.

## Mobile is explicitly out of scope for v1

`TourRunner` skips entirely below `1024px` (`MIN_TOUR_VIEWPORT_WIDTH`,
matching the sidebar's own `lg:` breakpoint) rather than trying to spotlight
elements inside the mobile `Sheet` nav. The mobile sheet renders the same
nav items as the desktop sidebar in a separate DOM subtree; targeting both
with the same `data-tour` selector risks Joyride finding the wrong (hidden)
element. `data-tour` attributes are therefore only present on the desktop
`<aside>` block in `AppShell`, not the mobile `Sheet` block. A mobile user
simply never sees an onboarding tour today - stated here plainly, not
silently absorbed.

## Replaying a tour

The account menu (`UserMenu`, hidden for platform operators) has a "Replay
the tour" item that dispatches a plain `window` custom event
(`rf-tour-replay`) - the same lightweight cross-component signaling
`AppShell` already uses for its own sidebar-collapse preference
(`rf-sidebar-change`), not a new state-management dependency. `TourRunner`
listens for it and rebuilds its queue from scratch, ignoring completion
state, so a user can always re-run either tour without a database write.

## Honestly unverified

The actual spotlight interaction - element positioning, scroll-into-view,
the skip/back/next flow, both themes - was not click-tested against a real
authenticated tenant session before release, consistent with this
project's established practice for anything requiring live tenant
credentials (see other entries in `OPERATOR_HANDOFF.md`). What was
verified: the full mocked test suite, a clean production build and
TypeScript pass, a real disposable-Neon-branch schema migration with zero
drift, and a real-Postgres smoke test of the exact upsert/unique-constraint/
cascade-delete behavior `UserTourProgress` relies on. Click through it in a
real workspace before treating the visual experience as fully proven.
