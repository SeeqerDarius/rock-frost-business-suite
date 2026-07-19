# Product Vision

## What this is

Rock Frost Business Suite is a modular business operating platform. An organization signs up once and activates whichever independent management modules it needs — Fleet Management, Installment Management, and (over time) CRM, Inventory, Accounting, HR, Payroll, Procurement, Project Management, and Analytics.

The platform provides shared infrastructure: authentication, organization and branch management, roles and permissions, notifications, audit logging, file storage, search, and billing. Each module provides its own isolated business functionality on top of that shared infrastructure.

## What this is not

- **Not one large application where every feature is mixed together.** A user working in Fleet Management should never see installment customers, layaway payments, or installment products — and vice versa. See `docs/MODULE_BOUNDARIES.md` for the enforced rules.
- **Not a generic dashboard template with business logic bolted on.** The platform's navigation, dashboards, and permissions are structured around the concept of independent modules from the ground up, not retrofitted onto a single shared shell.
- **Not a single-tenant product wearing multi-tenant clothing.** Every module-owned record is scoped to an organization (and, where relevant, a branch). Tenant isolation is enforced server-side, not just hidden in the UI.

## Why this rebuild

The previous implementation (see `docs/archive/previous-implementation/` and `docs/DECISIONS.md`) mixed Fleet and Installment (Hire Purchase) navigation, dashboards, and shared-component branding together — there was no enforced concept of module boundaries, so bleed between unrelated business domains kept recurring as new features were bolted onto a single shared dashboard shell. This rebuild treats module isolation as a first-class architectural constraint, not something to patch reactively.

## Target quality bar

The finished product should look and behave like it was built by an experienced enterprise product, engineering, and design team — restrained, consistent, and calm, not experimental or template-spammed. See `docs/DESIGN_SYSTEM.md` for the concrete UI/UX standards this implies.
