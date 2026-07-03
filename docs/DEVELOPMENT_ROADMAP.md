# Rock Frost Business Suite Development Roadmap

This development roadmap is based on the Rock Frost Business Suite Architecture Bible and defines a practical implementation path for the platform.

## Current State

**Objective**
- Establish the current baseline of the repository and platform.

**Features to build**
- Existing marketing website pages.
- Fleet module UI with mock data only.
- Shared dashboard shell, sidebar navigation, and reusable UI components.

**Files/folders likely affected**
- `app/(dashboard)/...`
- `components/dashboard/`
- `components/fleet/`
- `lib/fleet/`
- `docs/`

**Acceptance criteria**
- No backend or database implementation exists yet.
- Fleet module is UI-only and uses mock data.
- Public marketing experience remains unchanged.
- Build passes successfully.

**Risks**
- Platform foundation is incomplete and cannot support real tenant or security requirements.
- UI may drift from a clean architecture if backend concerns are introduced too early.

**Recommended order**
1. Stabilize current UI implementation.
2. Finalize architecture documentation.
3. Prepare for core platform services.

## Phase 1 — Platform Core Foundation

**Objective**
- Establish the core platform architecture, folder conventions, and separation between marketing and dashboard experiences.

**Features to build**
- Application route grouping for `(marketing)` and `(dashboard)`.
- Shared UI shell components and platform helpers.
- Documentation of architecture, naming conventions, and module boundaries.

**Files/folders likely affected**
- `app/`
- `components/`
- `lib/`
- `docs/`
- `modules/`

**Acceptance criteria**
- Route groups are clearly defined.
- Shared component and library boundaries exist.
- Architecture documentation is available for the team.

**Risks**
- Over-engineering the folder structure before requirements are stable.
- Creating too much scaffolding without enough immediate value.

**Recommended order**
1. Finalize architecture document.
2. Create shared platform component patterns.
3. Define module registration and folder conventions.

## Phase 2 — Authentication

**Objective**
- Add secure authentication and user identity management.

**Features to build**
- Login and logout flows.
- Session management.
- Secure dashboard route guarding.
- User profile and session state management.

**Files/folders likely affected**
- `app/(dashboard)/...`
- `app/api/auth/`
- `lib/auth/`
- `components/auth/`
- `lib/types/`

**Acceptance criteria**
- Users can sign in and access protected dashboard routes.
- Authentication state is persisted securely.
- Marketing pages remain public and unaffected.

**Risks**
- Poor authentication implementation may create security holes.
- Mixing public and private route logic incorrectly.

**Recommended order**
1. Build authentication APIs and session handling.
2. Protect dashboard route groups.
3. Add login UI and sign-out flows.

## Phase 3 — Multi-Tenancy

**Objective**
- Implement tenant-aware architecture and data isolation.

**Features to build**
- Organization and branch models.
- Tenant resolver based on user session or subdomain.
- Scoped platform services that honor `organizationId`.

**Files/folders likely affected**
- `lib/tenant/`
- `app/(dashboard)/...`
- `modules/`
- `prisma/` (conceptually, for future model design)

**Acceptance criteria**
- Organization context is available for authenticated users.
- Business operations are scoped by tenant.
- Branch support is defined for fine-grained segmentation.

**Risks**
- Incorrect tenant scoping could expose cross-tenant data.
- Early tenancy assumptions may block future module reuse.

**Recommended order**
1. Define tenant resolution patterns.
2. Build organization and branch context support.
3. Enforce tenant scoping in services and data access.

## Phase 4 — Roles & Permissions

**Objective**
- Add a robust role-based access control model.

**Features to build**
- Role and permission definitions.
- Role assignment for organization members.
- Authorization checks in UI and backend services.

**Files/folders likely affected**
- `lib/auth/`
- `lib/permissions/`
- `modules/`
- `prisma/` (conceptual models)

**Acceptance criteria**
- Role and permission data models exist conceptually.
- Users can be assigned roles in an organization.
- Authorization logic is enforced in endpoints and UI flows.

**Risks**
- Overly broad permissions may undermine security.
- Too rigid a model may slow future module expansion.

**Recommended order**
1. Define core roles and permissions.
2. Build organization member role assignment.
3. Integrate authorization checks into platform services.

## Phase 5 — Database & Prisma Setup

**Objective**
- Introduce a consistent data model and prepare for persistence.

**Features to build**
- Conceptual Prisma schema for core platform models.
- Database connection and migration strategy.
- Shared data access layer for tenant-scoped records.

**Files/folders likely affected**
- `prisma/`
- `lib/db/`
- `lib/types/`
- `modules/`
- `app/api/`

**Acceptance criteria**
- A conceptual database schema exists for core entities.
- Data access patterns support tenant isolation.
- Migration strategy is documented.

**Risks**
- Schema changes later may require complex migrations.
- Coupling too much logic to a specific ORM too early.

**Recommended order**
1. Define conceptual Prisma models.
2. Build shared DB access helpers.
3. Keep database integration separate from UI code.

## Phase 6 — Fleet Module Backend

**Objective**
- Add backend support for the fleet module while preserving the existing UI.

**Features to build**
- Fleet vehicle, driver, owner, maintenance, payment, and contract models.
- Fleet service APIs that respect tenant boundaries.
- Data-driven fleet pages using real records instead of mock data.

**Files/folders likely affected**
- `modules/fleet/`
- `app/(dashboard)/fleet/`
- `lib/fleet/`
- `app/api/fleet/`
- `prisma/`

**Acceptance criteria**
- Fleet UI can consume real fleet data from backend APIs.
- Fleet data is scoped to the current organization.
- Existing fleet UI appearance does not change.

**Risks**
- Backend changes may cause UI mismatches if API contracts are inconsistent.
- Tenant isolation errors could leak data between organizations.

**Recommended order**
1. Build fleet backend services and API routes.
2. Connect fleet pages to the new backend.
3. Validate tenant scoping on fleet records.

## Phase 7 — Billing & Subscriptions

**Objective**
- Support subscription plans, organization billing, and module enablement.

**Features to build**
- Subscription plan and organization subscription models.
- Organization module enablement.
- Billing status tracking and plan limits.

**Files/folders likely affected**
- `lib/billing/`
- `modules/subscriptions/`
- `app/api/billing/`
- `prisma/`

**Acceptance criteria**
- Organizations can be assigned subscription plans.
- Module access can be enabled or disabled per tenant.
- Billing state is visible in the platform model.

**Risks**
- Incorrect billing controls may block organizations or enable unwanted modules.
- Plan changes need careful migration and compatibility checks.

**Recommended order**
1. Define subscription and module access models.
2. Add plan assignment workflows.
3. Integrate module enablement checks.

## Phase 8 — Notifications & Audit Logs

**Objective**
- Add platform-wide event tracking and notification services.

**Features to build**
- Audit log model and append-only log service.
- Notification queue and delivery service.
- Notification templates for fleet events and system alerts.

**Files/folders likely affected**
- `lib/notifications/`
- `lib/audit/`
- `app/api/notifications/`
- `prisma/`

**Acceptance criteria**
- Key actions generate audit records.
- Notifications can be sent to users and stored for later retrieval.
- Notification and audit behavior is tenant-aware.

**Risks**
- Excessive logging may increase storage and complexity.
- Notification pipeline design must avoid performance bottlenecks.

**Recommended order**
1. Define audit log and notification models.
2. Implement event generation hooks.
3. Build delivery and retrieval endpoints.

## Phase 9 — AI Assistant

**Objective**
- Introduce an AI assistant framework to support task guidance and insights.

**Features to build**
- AI assistant service boundaries.
- Context-aware prompt construction using tenant and module data.
- Secure AI integration points for future expansions.

**Files/folders likely affected**
- `lib/ai/`
- `modules/ai/`
- `app/api/ai/`
- `docs/`

**Acceptance criteria**
- AI assistant architecture is defined and scaffolded.
- Prompts are built with tenant context and module boundaries.
- The assistant remains decoupled from core business logic.

**Risks**
- AI feature scope creep can distract from platform stability.
- Data privacy and context handling must be enforced.

**Recommended order**
1. Define AI architecture and service contract.
2. Add assistant scaffolding and secure API endpoints.
3. Keep first AI feature minimal and extensible.

## Phase 10 — GLV Layaway Module

**Objective**
- Plan and build the future GLV Layaway module using platform conventions.

**Features to build**
- Layaway contract lifecycle model.
- Payment schedules and asset tracking.
- Integration with subscriptions, roles, and reporting.

**Files/folders likely affected**
- `modules/glv-layaway/`
- `app/(dashboard)/glv-layaway/`
- `lib/`
- `prisma/`

**Acceptance criteria**
- Module architecture follows the same patterns as fleet.
- Layaway data is tenant-scoped.
- The module can be enabled without hardcoding organization details.

**Risks**
- Creating custom business logic too early before platform services are stable.
- Overlapping payment and reporting features with existing modules.

**Recommended order**
1. Define module data and service boundaries.
2. Reuse platform billing, notification, and reporting services.
3. Keep the implementation aligned with fleet and subscription models.

## Phase 11 — Production Hardening

**Objective**
- Prepare the platform for production with security, performance, and reliability.

**Features to build**
- End-to-end testing and regression coverage.
- Security hardening and tenant isolation validation.
- Deployment automation and monitoring.

**Files/folders likely affected**
- `tests/`
- `docs/`
- `lib/`
- CI/CD configs

**Acceptance criteria**
- Production readiness checks are documented.
- Security and authorization tests pass.
- Deployment pipeline is stable.

**Risks**
- Rushing production readiness may leave gaps in audit or security.
- Missing observability can delay incident response.

**Recommended order**
1. Add automated testing and linting.
2. Harden security around tenant and auth flows.
3. Establish deployment and monitoring best practices.

---

## General implementation guidance

- Prioritize platform services before module features.
- Keep the Fleet module as the first reusable business module.
- Avoid app code changes unrelated to roadmap items.
- Maintain a clean separation between marketing and dashboard.
- Keep documentation in sync with the Architecture Bible.
