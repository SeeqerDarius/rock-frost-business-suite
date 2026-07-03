# Rock Frost Business Suite Architecture Bible

## 1. Product Vision

Rock Frost Business Suite is a premium multi-tenant SaaS platform for managing business operations across industries. The product is designed to deliver a reusable, extensible platform that supports fleet management as the first module and paves the way for future modules like CRM, Inventory, POS, Accounting, HR, Payroll, School, Hospital, Hotel, Construction, Agriculture, and AI.

The vision is to deliver a centralized business backbone for organizations and tenants, enabling them to manage assets, operations, financials, and people through a secure, scalable, and modular architecture.

## 2. Platform Principles

- Multi-tenant first: Every organization is a separate tenant with isolated data.
- Modular extensibility: Business capabilities must be built as reusable modules that can be enabled per organization.
- Neutral SaaS language: The platform must avoid hardcoded company names and support any business domain.
- Separation of concerns: The public marketing website stays separate from the SaaS dashboard.
- Minimal dependency coupling: Modules should depend on platform services, not each other directly.
- Secure by design: Default to strong identity, role-based authorization, and data isolation.
- Observability and auditability: Every business action should be traceable and verifiable.
- Future-proof architecture: Support rapid onboarding of new business modules and AI assistants.

## 3. High-Level System Architecture

### 3.1 Layers

- Presentation Layer
  - Public website (`app/(marketing)`) for marketing and product discovery.
  - SaaS dashboard (`app/(dashboard)`) for authenticated users and tenant management.
- API Layer
  - REST or GraphQL APIs for internal and external integrations.
  - Shared platform API endpoints for users, organizations, subscriptions, and module configuration.
- Business Logic Layer
  - Core platform services: authentication, authorization, tenant resolution, subscription management.
  - Module services: fleet, reporting, notifications, audit logs.
- Data Layer
  - Shared multi-tenant database with organization and branch scoping.
  - Optional document storage for files and assets.

### 3.2 Deployment Boundaries

- Marketing website and SaaS dashboard hosted in the same repository, but served through different route groups and build paths.
- Dashboard routes should be grouped under `(dashboard)` and marketing under `(marketing)`.
- Future deployment can use separate hosting targets or reverse proxy rules to keep the website and application sandboxed.

## 4. Recommended Folder Structure

```
app/
  (marketing)/
  (dashboard)/
components/
  dashboard/
  fleet/
lib/
  api/
  auth/
  db/
  modules/
  types/
modules/
  fleet/
  crm/
  inventory/
  pos/
  accounting/
  hr/
  payroll/
  school/
  hospital/
  hotel/
  construction/
  agriculture/
  ai/
docs/
prisma/
public/
styles/
```

### 4.1 Recommended file grouping

- `components/`: reusable UI components and shell elements.
- `lib/`: shared libraries, mock data, platform helpers, and types.
- `modules/`: module-specific services, feature boundaries, and business logic.
- `prisma/`: future schema and database migrations.
- `docs/`: architecture and design documentation.

## 5. Multi-Tenancy Strategy

### 5.1 Tenant model

- Every tenant is represented by an `Organization` record.
- `organizationId` must appear in most business tables to enforce tenant isolation.
- `branchId` is optional and used for business records that require further segmentation within an organization.

### 5.2 Data isolation patterns

- Row-level isolation through `organizationId` filtering.
- Shared schema, separate tenant data in common tables.
- Soft multi-tenant support using scoped queries at the service layer.

### 5.3 Tenant resolution

- Resolve the active organization through user session claims, subdomain, or tenant-selection context.
- The SaaS dashboard must always load the current tenant context before executing module queries.

## 6. Core Platform Modules

- Authentication & Authorization
- Tenant Management
- Subscription & Billing
- Notifications
- Audit Logging
- File Upload & Document Storage
- Reporting & Analytics
- Module Management
- Fleet Management (Module 1)
- AI Assistant Framework

## 7. Business Module Architecture

### 7.1 Modular design

- Each module exposes:
  - UI pages under `app/(dashboard)` route groups.
  - shared component sets in `components/`.
  - business data definitions in `modules/<module>/`.
  - platform integration contracts via `lib/modules/`.

### 7.2 Module boundaries

- Fleet module is the first implementable module and should be designed to operate without hardcoded tenant assumptions.
- Future modules should be built with generic organization/branch scope and reusable service interfaces.
- Modules should depend on platform services like user management, audit, notifications, and subscriptions.

### 7.3 Module configuration

- Modules should register metadata with the platform, including:
  - module name
  - module code
  - description
  - enabled state per organization
  - feature flags

## 8. Database Design Strategy

### 8.1 Conceptual data model

Database design should remain conceptual until a formal ORM like Prisma is introduced. Focus on tenant-safe, normalized models.

### 8.2 Data isolation fields

- `organizationId`: required for most business records.
- `branchId`: optional when branch segmentation is needed.
- `createdAt`, `updatedAt`, `deletedAt`: auditing fields.
- `createdBy`, `updatedBy`: optional user tracking.

### 8.3 Soft delete and archival

- Use soft delete patterns for recoverable business records.
- Archive historical records in analytics-optimized tables as the platform matures.

## 9. Authentication Strategy

- Use secure token-based authentication for dashboard access.
- Support email/password login as the baseline.
- Plan for OAuth/OpenID Connect and external identity provider integrations.
- Store authentication state in secure cookies or token storage with `SameSite` and `Secure` policies.
- Session tokens should include organization context and user role claims.

## 10. Authorization, Roles & Permissions

### 10.1 Role-based model

- Define roles at the organization level.
- Core roles for future compatibility:
  - Administrator
  - Fleet Manager
  - Driver
  - Vehicle Owner
  - Mechanic
  - Investor

### 10.2 Permission architecture

- Permissions are discrete actions granted to roles.
- Permission sets should be configurable by administrators.
- Authorization checks occur at the API/service layer and in UI navigation.

### 10.3 Role-permission tables

- `Role`: describes a role within the organization.
- `Permission`: describes an action or capability.
- `RolePermission`: joins roles and permissions.
- `OrganizationMember`: links users to organizations and roles.

## 11. Organization, Branch & User Model

### 11.1 Organization

- Represents a tenant company or business.
- Must store business metadata, configuration, billing status, and enabled modules.
- Supports organization-level branding and preferences.

### 11.2 Branch

- Represents a distinct location or business unit within an organization.
- Optional and used when records need finer segmentation.
- Branch records can inherit organization-level defaults.

### 11.3 User

- Represents authenticated individuals.
- Users may belong to multiple organizations with different roles.
- Store identity fields, contact details, login metadata, and status.

### 11.4 OrganizationMember

- A mapping between `User`, `Organization`, and assigned roles.
- Supports membership metadata like join date and active status.

## 12. Subscription & Billing Model

### 12.1 Subscription plans

- Define `SubscriptionPlan` as reusable product tiers.
- Plans should include module access, limits, and billing cadence.

### 12.2 Organization subscriptions

- `OrganizationSubscription` links an organization to an active plan.
- Track billing status, renewal dates, trial state, and usage caps.

### 12.3 Billing considerations

- Keep billing separate from core features until integration is needed.
- Allow future billing providers and invoicing workflows.
- Use placeholder integration points rather than hardcoded payment providers.

## 13. Notifications System

- Centralized notification service for email, in-app, and soon push notifications.
- Notifications should be configurable per organization and user preferences.
- Support templates for operations like fleet maintenance alerts, subscription changes, and audit events.

## 14. Audit Log Strategy

- Capture critical actions for compliance and troubleshooting.
- Audit records should include: actor, action, target entity, timestamp, organization context, branch context, and metadata.
- Audit logs should be immutable and easily searchable.
- Store audit entries separately from business tables.

## 15. File Upload & Document Storage Strategy

- Use a dedicated storage service for files and documents.
- Store metadata in `FileAsset` records and keep actual files outside the database.
- Support versioning, file type validation, and tenant isolation.
- Optionally separate storage buckets per organization or tenant prefix.

## 16. AI Assistant Architecture

- Define an AI assistant as a platform service, not a module-specific dependency.
- AI should use contextual prompts from tenant data, module metadata, and audit context.
- The assistant can support business workflows, data lookups, and productivity guidance.
- Keep AI integrations separate from core business logic for transparency and safety.

## 17. Reporting & Analytics Strategy

- Provide centralized metrics and report generation services.
- Reports should use read-optimized data models and aggregate tables.
- Support export actions, dashboard summaries, and module-level analytics.
- Keep reporting UI separate from transaction workflows.

## 18. Fleet Module Integration Strategy

- The fleet module is Module 1 and should be designed as a reusable business module.
- Fleet must use neutral terminology like organization, company, tenant, asset, and business.
- Fleet data should include organization and branch scopes.
- Fleet services should integrate with notifications, audit logs, subscriptions, and user roles.
- Fleet module architecture should allow future addition of related assets like vehicles, drivers, owners, maintenance, payments, and contracts.

## 19. Future GLV Layaway Module Strategy

- GLV Layaway is a future module, designed to integrate with the same platform patterns.
- It should use shared tenant, branch, user, and subscription services.
- The layaway module should support contract lifecycle, payment schedule, asset tracking, and reconciliation.
- Plan for reusing payment and reporting services from Fleet and other modules.

## 20. API Design Standards

- Use consistent, versioned APIs.
- Prefer REST for first implementation, with a clear path to GraphQL or RPC.
- Use nouns for resource endpoints and support standard CRUD semantics.
- Always include tenant context in API requests.
- Return structured error payloads with codes and messages.

## 21. UI/UX Design Standards

- Preserve the existing Rock Frost brand theme and dark SaaS aesthetic.
- Keep marketing and dashboard experiences separate.
- Ensure responsive layouts and glass-style cards remain consistent.
- Use neutral, enterprise-friendly language suitable for multiple companies.
- Avoid hardcoded tenant or company-specific labels in UI components.

## 22. Coding Standards

- Use TypeScript with strict typings.
- Keep business logic in reusable components or module services.
- Avoid hardcoding data; use platform models and shared types.
- Maintain clean folder boundaries between shared libraries and modules.
- Document architecture decisions and data models clearly.

## 23. Naming Conventions

- Use `organization` for tenant-level records.
- Use `branch` for location or business unit segmentation.
- Use `member` for user assignments to organizations.
- Use `module` for feature boundaries and reusable capabilities.
- Use `Asset`, `Record`, or `Contract` suffixes for domain entities.
- Use clear route names: `/fleet`, `/fleet/vehicles`, `/fleet/maintenance`, etc.

## 24. Security Standards

- Enforce tenant isolation at the data access layer.
- Validate organization and branch scope on every request.
- Use strong authentication and role-based authorization.
- Sanitize inputs and apply least-privilege access.
- Keep the marketing website separate from authenticated SaaS routes.

## 25. Deployment Strategy

- Deploy the public website and dashboard from the same repository but as separate route groups.
- Keep environment configuration external and secure.
- Use CI/CD to run builds and tests before deployment.
- Support separate staging and production environments.
- Future deployments can use containerized or serverless hosting with database services.

## 26. Testing Strategy

- Begin with TypeScript type safety and build validation.
- Add UI component tests for shared dashboard elements.
- Add integration tests for API services and tenant scoping.
- Add module regression tests as each module matures.
- Use automated builds to prevent regressions in the marketing and dashboard apps.

## 27. Roadmap From Current State

- Current state: existing public marketing site plus a new fleet module UI in the dashboard.
- Next step: stabilize the core platform architecture and centralize shared platform services.
- Enable module registration and tenant management.
- Add authentication and authorization services.
- Introduce database models and data access patterns.
- Add subscription and billing scaffolding.
- Expand with additional reusable modules beyond fleet.

## 28. Immediate Next Technical Steps

- Create a centralized tenant context and organization resolver.
- Add authentication scaffolding and secure dashboard route protection.
- Define the platform data model conceptually in `prisma/` when ready.
- Implement role and permission management for future module access.
- Add the first platform API layer for user, organization, and module configuration.
- Define file storage and audit logging contracts before adding persistent storage.

---

# Conceptual Domain Models

The following models define the proposed conceptual data structure for the platform.

## User

- `id`
- `email`
- `firstName`
- `lastName`
- `passwordHash`
- `status`
- `lastLoginAt`
- `createdAt`
- `updatedAt`

## Organization

- `id`
- `name`
- `industry`
- `tenantCode`
- `address`
- `timezone`
- `billingEmail`
- `status`
- `enabledModules`
- `createdAt`
- `updatedAt`

## OrganizationMember

- `id`
- `organizationId`
- `userId`
- `roleId`
- `branchId` (optional)
- `joinedAt`
- `isActive`
- `createdAt`
- `updatedAt`

## Branch

- `id`
- `organizationId`
- `name`
- `code`
- `address`
- `timezone`
- `contactEmail`
- `status`
- `createdAt`
- `updatedAt`

## Role

- `id`
- `name`
- `description`
- `organizationScoped` (boolean)
- `createdAt`
- `updatedAt`

## Permission

- `id`
- `key`
- `name`
- `description`
- `moduleCode`
- `createdAt`
- `updatedAt`

## RolePermission

- `id`
- `roleId`
- `permissionId`
- `createdAt`

## SubscriptionPlan

- `id`
- `name`
- `slug`
- `tier`
- `pricePerMonth`
- `features`
- `moduleAccess`
- `createdAt`
- `updatedAt`

## OrganizationSubscription

- `id`
- `organizationId`
- `planId`
- `status`
- `billingCycle`
- `startsAt`
- `endsAt`
- `trialEndsAt`
- `renewalDate`
- `createdAt`
- `updatedAt`

## Module

- `id`
- `code`
- `name`
- `description`
- `isCore`
- `createdAt`
- `updatedAt`

## OrganizationModule

- `id`
- `organizationId`
- `moduleId`
- `enabled`
- `configuration`
- `createdAt`
- `updatedAt`

## AuditLog

- `id`
- `organizationId`
- `branchId` (optional)
- `userId` (optional)
- `action`
- `entityName`
- `entityId`
- `changes`
- `ipAddress`
- `userAgent`
- `createdAt`

## Notification

- `id`
- `organizationId`
- `userId` (optional)
- `type`
- `channel`
- `title`
- `message`
- `status`
- `metadata`
- `sentAt`
- `readAt`
- `createdAt`
- `updatedAt`

## FileAsset

- `id`
- `organizationId`
- `branchId` (optional)
- `uploadedBy`
- `fileName`
- `mimeType`
- `size`
- `storagePath`
- `url`
- `metadata`
- `createdAt`
- `updatedAt`

## FleetVehicle

- `id`
- `organizationId`
- `branchId` (optional)
- `vehicleId` or `assetTag`
- `plateNumber`
- `type`
- `make`
- `model`
- `year`
- `ownerId`
- `assignedDriverId` (optional)
- `status`
- `documentStatus`
- `mileage`
- `location`
- `createdAt`
- `updatedAt`

## FleetDriver

- `id`
- `organizationId`
- `branchId` (optional)
- `userId` (optional)
- `name`
- `licenceNumber`
- `licenceExpiry`
- `phone`
- `email`
- `assignedVehicleId` (optional)
- `status`
- `employmentStartDate`
- `performanceMetrics`
- `createdAt`
- `updatedAt`

## FleetOwner

- `id`
- `organizationId`
- `branchId` (optional)
- `name`
- `businessName`
- `phone`
- `email`
- `vehiclesOwned`
- `revenueGenerated`
- `history`
- `createdAt`
- `updatedAt`

## FleetMaintenanceRequest

- `id`
- `organizationId`
- `branchId` (optional)
- `vehicleId`
- `requestedById`
- `faultDescription`
- `photoAssetId` (optional)
- `approvalStatus`
- `fleetManagerReview`
- `ownerApprovalStatus`
- `mechanicAssigned`
- `progressStatus`
- `repairCost`
- `completionVerified`
- `requestedAt`
- `completedAt` (optional)
- `createdAt`
- `updatedAt`

## FleetPayment

- `id`
- `organizationId`
- `branchId` (optional)
- `reference`
- `date`
- `type`
- `amount`
- `status`
- `relatedEntity`
- `verified`
- `metadata`
- `createdAt`
- `updatedAt`

## FleetWorkAndPayContract

- `id`
- `organizationId`
- `branchId` (optional)
- `contractName`
- `vehicleId`
- `clientName`
- `contractAmount`
- `depositAmount`
- `weeklyPaymentAmount`
- `amountPaid`
- `outstandingBalance`
- `remainingDuration`
- `completionPercentage`
- `contractStatus`
- `createdAt`
- `updatedAt`

---

## Appendix: Route and Folder Notes

- Marketing website stays separate from the dashboard.
- Fleet is Module 1 and should be a reusable module within the platform.
- GLV Layaway is a future module, designed to reuse platform services.
- The architecture must support multiple organizations and branches, with neutral terminology.

---

This document is intended as the long-term architectural blueprint for Rock Frost Business Suite and the foundation for future development.
