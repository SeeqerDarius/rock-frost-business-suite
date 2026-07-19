> **OBSOLETE — ARCHIVED DOCUMENT**
>
> This document describes the previous Rock Frost Business Suite implementation, which was fully retired during the clean rebuild that began 2026-07-19. It is kept for historical reference only.
>
> **Coding agents must NOT follow this document.** It is not authoritative. See the current `docs/` directory and `OPERATOR_HANDOFF.md` at the repository root for the active architecture and roadmap.

# Prompt Library

Reusable prompts for Rock Frost Business Suite work. Copy, adapt, and include task-specific context.

## Website

Prompt:

```text
Read OPERATOR_HANDOFF.md, docs/ARCHITECTURE_BIBLE.md, and docs/DEVELOPMENT_ROADMAP.md. Improve the public website section requested below without changing Rock Frost branding, dashboard routes, or unrelated pages. Run npm run build and update OPERATOR_HANDOFF.md.
```

Future prompts:
- Homepage content refinement
- SEO metadata pass
- Contact/demo form improvements

## Dashboard

Prompt:

```text
Improve the dashboard workflow requested below. Preserve the existing dashboard shell, routes, and visual direction. Do not connect mock data to the database unless explicitly approved. Run npm run build and update OPERATOR_HANDOFF.md.
```

Future prompts:
- Dashboard navigation audit
- Mobile dashboard responsiveness
- Dashboard empty states

## Authentication

Prompt:

```text
Work only on the authentication foundation requested below. Preserve existing routes and demo auth behavior unless the task explicitly approves database-backed production auth. Read docs/AUTHENTICATION_PLAN.md. Run npm run build and update OPERATOR_HANDOFF.md.
```

Future prompts:
- Database-backed users
- Organization-aware sessions
- Password reset hardening

## Fleet

Prompt:

```text
Work on the Fleet module request below. Fleet is Module #1 and must stay organization-scoped, reusable, and neutral. Preserve mock data until backend integration is approved. Run npm run build and update OPERATOR_HANDOFF.md.
```

Future prompts:
- Fleet backend service design
- Fleet reports
- Fleet maintenance workflow

## Prisma

Prompt:

```text
Work on Prisma schema or database foundation only. Every business model must include organizationId, branchId where useful, and timestamps. Run npx prisma format, npx prisma generate, npm run build, and update OPERATOR_HANDOFF.md.
```

Future prompts:
- Migration creation
- Seed data
- Tenant resolver schema review

## Reports

Prompt:

```text
Design or implement reports for the requested module. Reports must be tenant-scoped, export-ready, and separate from transaction workflows. Do not expose cross-tenant data. Run npm run build and update OPERATOR_HANDOFF.md.
```

Future prompts:
- Fleet revenue reports
- Maintenance reports
- Organization summary reports

## AI

Prompt:

```text
Design AI assistant behavior for the requested workflow. Keep AI as a platform service, not a module-specific dependency. Protect tenant data and document all assumptions. Run npm run build if files change and update OPERATOR_HANDOFF.md.
```

Future prompts:
- AI assistant architecture
- Prompt safety policy
- Tenant-context prompt builder

## Deployment

Prompt:

```text
Review deployment readiness for Rock Frost Business Suite. Do not change application behavior unless requested. Check environment variables, build status, and route output. Update documentation and OPERATOR_HANDOFF.md.
```

Future prompts:
- Vercel deployment checklist
- Production environment checklist
- Domain launch checklist

## Testing

Prompt:

```text
Add or improve tests for the requested area. Preserve existing behavior. Prefer focused tests around changed logic. Run npm run build and any relevant test commands, then update OPERATOR_HANDOFF.md.
```

Future prompts:
- Auth tests
- Tenant scoping tests
- Fleet module regression tests

## Bug Fixing

Prompt:

```text
Investigate and fix the bug below. Start by reproducing or locating the failing path. Keep the fix focused. Do not redesign UI or refactor unrelated code. Run npm run build and update OPERATOR_HANDOFF.md.
```

Future prompts:
- Build failure triage
- Route protection bug
- Prisma generation failure

## Refactoring

Prompt:

```text
Refactor only the requested area. Preserve behavior, routes, visual design, and public API contracts. Avoid broad rewrites. Run npm run build and update OPERATOR_HANDOFF.md.
```

Future prompts:
- Component extraction
- Data helper cleanup
- Dashboard layout cleanup

## Architecture

Prompt:

```text
Propose or document the requested architecture decision. Align with docs/ARCHITECTURE_BIBLE.md and docs/DEVELOPMENT_ROADMAP.md. Record durable decisions in ai/DECISION_LOG.md and update OPERATOR_HANDOFF.md.
```

Future prompts:
- Subscription architecture
- Module registry architecture
- Tenant resolver architecture
