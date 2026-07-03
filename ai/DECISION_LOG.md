# Decision Log

This log records durable architectural and product decisions for Rock Frost Business Suite. Add new decisions in sequence. Do not delete old decisions; supersede them with a later decision when needed.

## Decision 001 - Marketing Website Remains Separate From SaaS Dashboard

Status: Accepted

Decision:
The public marketing website and authenticated SaaS dashboard remain separate experiences.

Reason:
Marketing pages optimize for discovery, trust, and conversion. Dashboard pages optimize for secure operational work.

Implications:
- Keep route groups separated.
- Do not mix marketing components into dashboard workflows unless intentionally shared.
- Preserve public routes independently from authenticated routes.

## Decision 002 - Fleet Is Module #1

Status: Accepted

Decision:
Fleet management is the first business module implemented in the suite.

Reason:
Fleet provides a practical initial domain with assets, owners, drivers, payments, maintenance, reports, and contracts.

Implications:
- Fleet establishes reusable module patterns.
- Fleet must remain tenant-neutral and organization-scoped.

## Decision 003 - GLV Becomes Future Layaway Module

Status: Accepted

Decision:
GLV-specific layaway functionality will become a future reusable Layaway module rather than being hardcoded into the platform core.

Reason:
The platform must remain neutral and reusable across organizations and industries.

Implications:
- Layaway concepts should reuse tenant, branch, user, payment, report, and audit foundations.
- Do not hardcode GLV workflows into core platform models.

## Decision 004 - Organization-First Multi-Tenancy

Status: Accepted

Decision:
`Organization` is the tenant boundary for the platform.

Reason:
The suite must support multiple businesses with isolated data.

Implications:
- Business records require `organizationId`.
- Use `branchId` when useful for location or unit segmentation.
- Services must scope reads and writes by tenant.

## Decision 005 - One Codebase For Entire Business Suite

Status: Accepted

Decision:
The public website, dashboard, platform services, and modules live in one repository.

Reason:
One codebase keeps early platform development fast and consistent.

Implications:
- Keep boundaries clear through folders, route groups, and module conventions.
- Future deployment may split hosting while preserving repository cohesion.

## Decision 006 - Auth.js Chosen For Authentication

Status: Accepted

Decision:
Auth.js/NextAuth is the authentication foundation.

Reason:
It integrates with Next.js and supports credentials, OAuth, sessions, callbacks, and future database adapters.

Implications:
- Current auth foundation may use demo credentials until database integration.
- Production auth should be connected only when the database phase is ready.

## Decision 007 - Prisma Chosen As ORM

Status: Accepted

Decision:
Prisma is the ORM for database schema and client access.

Reason:
Prisma provides typed database access, schema management, and a strong developer workflow.

Implications:
- Database models live in `prisma/schema.prisma`.
- Shared server-side client access lives through `lib/db.ts`.
- Schema changes must pass `npx prisma generate`.

## Decision 008 - PostgreSQL Selected

Status: Accepted

Decision:
PostgreSQL is the primary relational database.

Reason:
PostgreSQL fits multi-tenant SaaS data, relational integrity, indexing, JSON metadata, and future analytics needs.

Implications:
- Prisma datasource uses PostgreSQL.
- Use relational constraints where they protect tenant and module integrity.

## Decision 009 - Rock Frost Design System

Status: Accepted

Decision:
Rock Frost Business Suite uses the existing Rock Frost visual identity and dark SaaS dashboard direction.

Reason:
Consistent branding builds trust and prevents fragmented product experiences.

Implications:
- Do not change branding without explicit instruction.
- UI updates must preserve the current visual direction.

## Decision 010 - Operator Handoff Required For Every Coding Session

Status: Accepted

Decision:
Every AI agent and developer must read and update `OPERATOR_HANDOFF.md`.

Reason:
Multiple agents may work on the repository. Handoff keeps context, status, and next steps visible.

Implications:
- Read handoff before work.
- Update handoff after work.
- Document files changed, build result, known issues, and next recommended step.

## Future Decisions

Use this template:

```markdown
## Decision 011 - Title

Status: Proposed | Accepted | Superseded

Decision:

Reason:

Implications:

Supersedes:
```
