# Account and tenant settings

## Personal account

`/app/account` allows an authenticated user to:

- edit their name, phone number, and sign-in email;
- upload a JPG, PNG, or WebP profile image up to 1 MB;
- change their password after confirming the current password; and
- use the existing forgot-password flow.

Changing the sign-in email requires the current password. Email and password changes invalidate existing sessions so stolen or stale sessions cannot remain active.

Profile photos are rejected immediately in the browser when they exceed 1
MiB, and the Server Action repeats the type/size validation. Next.js allows a
bounded 2 MB action envelope so multipart overhead cannot reject an otherwise
valid 1 MiB photo before application validation runs.

Images are stored as bounded data URLs in the existing `User.image` and `Organization.logoUrl` fields. This avoids introducing an undeclared object-storage dependency. A later object-storage migration can retain the same UI and replace only the persistence layer.

The account header retrieves the current image through the authenticated `/api/account/profile` endpoint with private, no-store caching. Images are deliberately not embedded in the NextAuth JWT cookie: even a bounded image can exceed browser cookie limits. A successful upload refreshes the header thumbnail immediately.

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
