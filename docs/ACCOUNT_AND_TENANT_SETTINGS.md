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

**Both appearance settings are consumed, not just stored.** The theme was already applied via `OrganizationThemeSync` (`src/components/theme/organization-theme-sync.tsx`, mounted in `src/app/app/layout.tsx`). The uploaded logo previously was **not** — it rendered only as a preview on the settings page itself. `src/app/app/layout.tsx` now also reads `Organization.logoUrl`/`name` and provides them through `OrganizationBrandingProvider` (`src/components/theme/organization-branding-context.tsx`), a React Context available to every authenticated route without prop-drilling it through each module's own `layout.tsx`. `AppShell`'s `WorkspaceLogo` (`src/components/layout/app-shell.tsx`) reads that context and, when the organization has uploaded a logo, renders it plus the organization's name in place of the Rock Frost mark in the sidebar header (desktop rail and the mobile sheet) — for tenant-scoped shells only (`organization` prop present). Platform scope never passes that prop, so platform operators always see the Rock Frost brand regardless of any tenant's uploaded logo. An organization with no uploaded logo sees the unchanged default Rock Frost mark.

Organization administrators can remove another member's access from `/app/administration`. Removal changes the tenant membership to `REMOVED` and revokes a pending invitation; it does not hard-delete the shared user identity or data owned by another tenant. An administrator cannot remove themselves or the final active Organization Owner.

## Platform recovery control

`/app/platform/settings` is restricted to platform operators. `organizationDeletionRecoveryDays` controls the recoverable delay applied when an organization deletion is scheduled. The setting is persisted in the platform anchor organization's metadata and replaces the former hard-coded 30-day constant without requiring a database migration.
