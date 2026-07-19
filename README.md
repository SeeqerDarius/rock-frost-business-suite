# Rock Frost Business Suite

A modular business operating platform. Organizations activate independent management modules — Fleet, Installment Sales, and more — from one unified workspace, without mixing unrelated business data together.

> This is a clean rebuild started 2026-07-19. The previous implementation is archived on branch `archive/pre-redesign-rfbs` and under `docs/archive/previous-implementation/`. See `docs/DECISIONS.md` for why.

## Stack

- **Next.js 16** (App Router, Turbopack) — see `AGENTS.md` before writing Next.js-specific code; this project pins a version with breaking changes from what most training data assumes.
- **TypeScript**, strict mode
- **Tailwind CSS v4**
- **shadcn/ui** (Base UI primitives) — see `docs/DECISIONS.md` for the license/rationale
- **Prisma** + **Neon Postgres**
- **NextAuth** (credentials-based auth — not yet wired up in this phase)

## Getting started

```bash
npm install
npm run dev
```

Required environment variables live in `.env` (not committed). See `docs/DATABASE_STRATEGY.md` for the database connection story and `docs/AUTHENTICATION_AND_AUTHORIZATION.md` for auth-related variables.

## Project structure

See `docs/ARCHITECTURE.md` for the full breakdown. Short version:

```
src/
  app/            App Router routes, grouped by scope: (public), (auth), (platform), (workspace)
  modules/        Per-module code (fleet/, installment/, ...) — navigation, and eventually components/services/etc.
  platform/       Shared platform concerns: module registry, platform-scope navigation
  components/     Genuinely reusable UI: ui/ (shadcn primitives), layout/, navigation/, feedback/, data-display/, forms/
  lib/            Shared utilities
  types/          Shared TypeScript types
prisma/           Database schema (unchanged from the previous implementation; not yet wired into the new app)
docs/             Authoritative documentation (this rebuild) + docs/archive/ (retired, non-authoritative)
```

## Documentation

Start with `OPERATOR_HANDOFF.md` at the repo root for the current state and next steps. Then:

- `docs/PRODUCT_VISION.md` — what this platform is and isn't
- `docs/ARCHITECTURE.md` — folder structure, route groups, module isolation mechanics
- `docs/MODULE_BOUNDARIES.md` — the non-negotiable isolation rules between modules
- `docs/DESIGN_SYSTEM.md` — UI foundation, tokens, component conventions
- `docs/DEVELOPMENT_ROADMAP.md` — phased build plan
- `docs/DATABASE_STRATEGY.md` — Prisma/Neon status and plan
- `docs/AUTHENTICATION_AND_AUTHORIZATION.md` — auth/RBAC plan (not implemented yet)
- `docs/TESTING_STRATEGY.md` — how work is validated
- `docs/DECISIONS.md` — dated log of consequential technical decisions

`docs/archive/previous-implementation/` contains the retired implementation's docs, marked obsolete. Do not follow them.
