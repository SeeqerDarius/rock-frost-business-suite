# Platform Organization Lifecycle

Organization lifecycle management is restricted to the system `Super Admin` role under
`/app/platform/organizations`. Tenant Organization Owners cannot access these controls.

## Onboarding

`/app/platform/organizations/new` creates a `TRIAL` organization, creates or reuses the first owner's global
user account, creates an invited Organization Owner membership, and sends a seven-day invitation. Creation and
invitation records are organization-scoped and audited. A failed email does not roll back the organization or
invitation; the platform organization detail page can resend a pending invitation.

## Management

The organization list supports status filtering and search by name, tenant code, or billing email.

### The Organization Configuration pane

`/app/platform/organizations/[organizationId]` is a sectioned pane, not one long scroll. Sections are addressed by
`?section=`, the same convention the School student profile uses, so a section is linkable and the browser Back
button works. `src/app/app/platform/organizations/[organizationId]/page.tsx` holds only the notices, the section
nav, and the dispatch; each section is its own component under `sections/`, typed from the one shared query shape
in `sections/data.ts`.

| Section | Contains |
| --- | --- |
| Overview | Read-only. Member/branch/module/open-request counts, plan at a glance, usage and health, active modules, recent requests. Nothing here changes the tenant. |
| Plan and billing | Module subscriptions grouped per module (mode, status, window, amount, seats, payment reference, suite entitlements, earlier agreements), seat usage per module, and the billing contact. Creating, activating, and cancelling subscriptions stays on `/app/platform/subscriptions`, which works across every tenant. |
| Modules and features | Module activation split into what is on for this organization and what is available, with each paid feature add-on rendered beside the modules it affects. |
| Members and access | Pending invitations (the only rows with an action) separated from settled memberships. |
| Profile and showcase | Identity, contact, location, and localization as four labelled groups, plus the public customer showcase. |
| Lifecycle and deletion | Account state changes, each stating its effect on the tenant's users, and the delayed-deletion flow. Both destructive surfaces are here and nowhere else. |

Server Actions redirect back with only their own notice parameter (`?saved=1`, `?error=wrong-password`). The page
maps each parameter to the section that produced it, so an operator lands where the change happened and every
pre-existing redirect target and bookmarked notice URL stays valid.

### Feature add-ons

`src/platform/organizations/feature-addons.ts` declares every operator-granted, per-organization add-on once: the
`Organization` columns holding the grant, the modules it affects, and its `scope`.

- `scope: "module"` means the grant can only ever affect that one module, so the pane nests its toggle inside that
  module's own row. The Parent and Student portal is one.
- `scope: "organization"` means one column covers several modules at once. Those appear under Shared capabilities,
  each naming the modules it reaches **for this organization** (the overlap with what the tenant has enabled)
  rather than the abstract list of modules that could use it. Offline access and SMS notifications are both this
  today.

Granting an add-on never turns a feature on. It only makes the tenant's own switch usable: offline access still
needs the organization's Owner to choose modules and a lease length, SMS still needs each module's own
`smsNotificationsEnabled`, and the portal still needs School staff to invite each guardian or student.

`test/platform-organization-configuration.test.ts` holds the catalogue to the schema: it asserts every declared
grant column exists on the `Organization` model, that `SMS_NOTIFICATION_MODULES` is exactly the set of
`*Settings` models carrying `smsNotificationsEnabled`, and that every add-on is rendered in exactly one place.

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

