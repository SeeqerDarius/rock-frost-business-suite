# Platform identity boundary

## Identity types

Rock Frost Business Suite has two operational identity contexts:

- **Platform operator** — a user whose active membership carries the global system `Super Admin` role. This identity manages the SaaS and must remain in `/app/platform/*`.
- **Tenant user** — a user with a non-Super-Admin organization membership. This identity works in `/app/dashboard`, `/app/organization`, `/app/administration`, and enabled business modules.

The current session model requires every authenticated user to have an organization membership. The platform owner's membership therefore points to an internal platform anchor. That anchor is an authorization implementation detail, not a tenant: it is excluded from tenant lists, counts, selectors, module adoption, and direct organization-management routes.

The contexts also have separate browser origins:

- `https://admin.rockfrostgroup.com` — platform-owner authentication and `/app/platform/*`.
- `https://app.rockfrostgroup.com` — tenant authentication and tenant workspace routes.
- `https://www.rockfrostgroup.com` — public marketing and acquisition pages.

NextAuth session cookies deliberately omit the `Domain` attribute. They are host-only, so the same browser profile can hold one owner session on `admin.*` and a different tenant session on `app.*` without either login replacing the other.

## Immutable identity rules

- An active membership with the global system `Super Admin` role makes the user a platform identity. This classification is resolved from the database and is not inferred from the selected organization, URL, or `active_org` cookie.
- A platform identity's effective organization is always its internal platform anchor. Tenant cookies, stale JWT organization claims, and additional historical memberships cannot override it.
- The tenant switch action refuses platform identities, clears `active_org`, and returns them to `/app/platform/dashboard`.
- Tenant creation and tenant invitations reject an email already belonging to a platform identity. The checks run both before and inside the write transaction to prevent partial organizations or race-condition membership creation.
- The tenant context exposes only the platform-anchor membership to platform identities, so future UI components cannot accidentally present tenant workspaces as switch targets.
- Credentials login rejects a platform identity on `app.*` and a tenant identity on `admin.*`. The authenticated app layout repeats the host/identity check server-side; the routing proxy is convenience and defense-in-depth, not the authorization boundary.
- Migration `20260726050000_enforce_platform_owner_isolation` removes historical non-platform memberships from platform identities, revokes their pending tenant invitations, and increments `sessionVersion` to invalidate contaminated sessions. The idempotent operator check/repair is `npm run db:repair-platform-owner-isolation`.

## Route rules

- `/app` resolves the signed-in identity and sends a Super Admin to `/app/platform/dashboard`; tenant users go to `/app/dashboard`.
- Legacy `/app/*` and authentication URLs on `www.*` are redirected to the corresponding `admin.*` or `app.*` origin. Cross-surface workspace URLs are redirected to the correct origin.
- `/app/platform/account` is the platform owner's profile and password-management route.
- `/app/account` is the tenant-user profile route.
- The account menu chooses the correct profile and settings links from the session role.
- The tenant `(overview)` layout rejects a Super Admin and redirects to `/app/platform/dashboard`.
- Business-module access rejects a Super Admin even if the global role contains broad permissions.
- The platform shell has no organization switcher, tenant name, tenant module launcher, or tenant-dashboard logo link.

Authorization remains enforced in server layouts/actions and is not dependent on hidden navigation.
