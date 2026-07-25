# Platform Organization Lifecycle

Organization lifecycle management is restricted to the system `Super Admin` role under
`/app/platform/organizations`. Tenant Organization Owners cannot access these controls.

## Onboarding

`/app/platform/organizations/new` creates a `TRIAL` organization, creates or reuses the first owner's global
user account, creates an invited Organization Owner membership, and sends a seven-day invitation. Creation and
invitation records are organization-scoped and audited. A failed email does not roll back the organization or
invitation; the platform organization detail page can resend a pending invitation.

## Management

The organization list supports status filtering and search by name, tenant code, or billing email. The detail page
provides:

- profile and localization editing;
- lifecycle status changes;
- member and role visibility;
- pending-invitation resend;
- module enablement and organization-specific configuration;
- recent module/customization requests; and
- organization-level operational counts.

`TRIAL` and `ACTIVE` organizations can resolve tenant sessions. `SUSPENDED` and `CANCELLED` organizations cannot,
because `getCurrentTenant()` admits only `ACTIVE` and `TRIAL`.

## Protected platform organizations

An organization containing an active membership with the system `Super Admin` role is a platform-administration
anchor. It cannot be suspended, cancelled, scheduled for deletion, or permanently deleted. This prevents the SaaS
owner from removing the organization context required to reach platform administration.

## Deletion

Permanent deletion is deliberately not immediate:

1. A Super Admin enters the exact tenant code and their current password.
2. The organization becomes `CANCELLED`.
3. Deletion is scheduled 30 days ahead, preserving the previous status.
4. During the recovery period, a Super Admin can cancel deletion and restore the previous status.
5. After the deadline, permanent deletion becomes available and again requires the exact tenant code and current
   password.

Permanent deletion cascades through organization-owned module and platform records according to the Prisma schema.
Users are global identities and are not automatically deleted because they may belong to other organizations.
Organization-scoped audit rows cascade with the tenant; therefore the final deletion action writes a platform-level
audit record with a null `organizationId` so evidence of who deleted which tenant remains after the tenant is gone.

Database migrations are not applied from the UI. The organization lifecycle does not alter the shared-database,
row-scoped tenancy architecture.

