# Account and tenant settings

## Personal account

`/app/account` allows an authenticated user to:

- edit their name, phone number, and sign-in email;
- upload a JPG, PNG, or WebP profile image up to 1 MB;
- change their password after confirming the current password; and
- use the existing forgot-password flow.

Changing the sign-in email requires the current password. Email and password changes invalidate existing sessions so stolen or stale sessions cannot remain active.

Images are stored as bounded data URLs in the existing `User.image` and `Organization.logoUrl` fields. This avoids introducing an undeclared object-storage dependency. A later object-storage migration can retain the same UI and replace only the persistence layer.

## Tenant administration

Organization administrators with `org.settings.manage` can open `/app/organization/settings` from Administration. They can upload a company logo and configure:

- the tenant interface theme (`system`, `light`, or `dark`);
- backup frequency;
- backup retention;
- the tenant data-recovery window; and
- whether tenant recovery requests are allowed.

The policy is stored under `Organization.metadata.workspaceSettings` so existing tenants receive safe defaults without a schema backfill. These fields express the tenant policy. Physical database snapshots and restoration remain platform-operated infrastructure and must follow these limits when the backup worker/provider is configured.

Organization administrators can remove another member's access from `/app/administration`. Removal changes the tenant membership to `REMOVED` and revokes a pending invitation; it does not hard-delete the shared user identity or data owned by another tenant. An administrator cannot remove themselves or the final active Organization Owner.

## Platform recovery control

`/app/platform/settings` is restricted to platform operators. `organizationDeletionRecoveryDays` controls the recoverable delay applied when an organization deletion is scheduled. The setting is persisted in the platform anchor organization's metadata and replaces the former hard-coded 30-day constant without requiring a database migration.
