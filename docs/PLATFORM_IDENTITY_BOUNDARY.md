# Platform identity boundary

## Identity types

Rock Frost Business Suite has two operational identity contexts:

- **Platform operator** — a user whose active membership carries the global system `Super Admin` role. This identity manages the SaaS and must remain in `/app/platform/*`.
- **Tenant user** — a user with a non-Super-Admin organization membership. This identity works in `/app/dashboard`, `/app/organization`, `/app/administration`, and enabled business modules.

The current session model requires every authenticated user to have an organization membership. The platform owner's membership therefore points to an internal platform anchor. That anchor is an authorization implementation detail, not a tenant: it is excluded from tenant lists, counts, selectors, module adoption, and direct organization-management routes.

## Route rules

- `/app` resolves the signed-in identity and sends a Super Admin to `/app/platform/dashboard`; tenant users go to `/app/dashboard`.
- `/app/platform/account` is the platform owner's profile and password-management route.
- `/app/account` is the tenant-user profile route.
- The account menu chooses the correct profile and settings links from the session role.
- The tenant `(overview)` layout rejects a Super Admin and redirects to `/app/platform/dashboard`.
- Business-module access rejects a Super Admin even if the global role contains broad permissions.
- The platform shell has no organization switcher, tenant name, tenant module launcher, or tenant-dashboard logo link.

Authorization remains enforced in server layouts/actions and is not dependent on hidden navigation.
