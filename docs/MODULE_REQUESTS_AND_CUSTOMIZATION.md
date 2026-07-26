# Module Requests and Organization Customization

## Scope

The platform keeps its existing shared-database, row-scoped multi-tenant architecture. Module requests and
organization-specific configuration do not create a database or schema per organization.

## Request entry points

Organization administrators with `org.settings.manage` can use `/app/module-requests` to request:

- activation of an existing module;
- customization of an existing module;
- a purpose-built module;
- an integration; or
- a data migration.

The request stores the organization and authenticated requester automatically. The requester can see the
customer-visible timeline, status, decision, assignee, and quotation/reference value, and can add more information.
Internal operator notes are never returned by the tenant page.

Prospects can choose **Request a module** or **Request a custom module** on `/contact`. These submissions appear
as unlinked inquiries in `/app/platform/requests`. A platform operator must explicitly link the inquiry to an
existing organization before converting it. This avoids guessing tenant identity from a company name or email
domain.

## Platform workflow

`/app/platform/requests` is restricted to the system `Super Admin` role. Operators can:

- assign a platform operator;
- set priority and lifecycle status;
- add customer-visible or internal notes;
- record a quotation or external reference;
- record an approval/rejection reason;
- convert a public inquiry into an organization request; and
- approve and enable an existing-module request atomically.

Every request mutation writes an audit event. Customer-visible changes create an in-app notification for the
authenticated requester. Enabling a module still does not bypass RBAC: users need an appropriate module permission
before they can enter it.

## Lifecycle

The supported request statuses are:

`SUBMITTED`, `UNDER_REVIEW`, `NEEDS_INFORMATION`, `QUOTED`, `APPROVED`, `REJECTED`,
`IMPLEMENTING`, `READY`, `COMPLETED`, and `CANCELLED`.

The platform work queue shows only active, actionable requests. Approving and
enabling an existing module transitions the request directly to `COMPLETED`,
so it leaves the queue immediately while remaining available in the database,
audit log, and organization history. Rejected and cancelled requests are also
excluded from the active queue.

## Organization-specific configuration

Platform operators can open an organization's module configuration from `/app/platform/organizations`.
Configuration is stored in `OrganizationModule.configuration` and validated against this versioned shape:

```json
{
  "version": 1,
  "features": {},
  "limits": {},
  "workflow": {},
  "terminology": {},
  "extensions": []
}
```

This is a configuration contract, not arbitrary executable code. A configuration key only changes behavior after
the relevant module explicitly supports and reads that key through
`getOrganizationModuleConfiguration(organizationId, moduleCode)`. Unsupported keys are inert.

Do not add organization-id conditionals to shared module code. Add a reusable configuration key or deployed
extension key, document it, validate it, test it for both enabled and disabled organizations, and then assign it
only to the intended organization.

## Purpose-built modules

A `CUSTOM_MODULE` request records discovery, scope, assignment, quotation, implementation, and acceptance status.
It does not dynamically generate or execute code. A real custom module still requires normal engineering:

1. a registry entry and module database row;
2. isolated routes, service layer, permissions, models, and migrations;
3. tenant-scoped tests and authorization checks;
4. deployment through the normal release process; and
5. `OrganizationModule` enablement only for the purchasing organization.

This preserves reviewability and prevents customer-supplied configuration from becoming an arbitrary-code path.
