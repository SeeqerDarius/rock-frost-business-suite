# Authentication and Authorization

**Status: authentication, role/module-level authorization, and action-level permissions across all thirteen modules—including Hotel and School—are real and enforced.**

## Current implementation (Phase 3 authentication + Phase 4 authorization)

**Authentication:**
- NextAuth v4, credentials provider (email + password, bcrypt-hashed) — `src/lib/auth/nextauth.ts`. `authorize()` looks up `User` by trimmed, lowercased email, requires `status === "ACTIVE"`, verifies the password with `bcrypt.compare`, and updates `lastLoginAt`.
- JWT session strategy. `Session.user` / `JWT.user` carry `{ id, organizationId, role }` via a type augmentation in `src/lib/auth/next-auth.d.ts`.
- Production authentication is split by host: platform owners sign in at `admin.rockfrostgroup.com`, tenant users at `app.rockfrostgroup.com`. NextAuth's session token is explicitly host-only (no parent `Domain` attribute), allowing independent owner and tenant sessions in the same browser. Login and the authenticated app layout both enforce that the database-resolved identity matches the current host.
- `src/app/api/auth/[...nextauth]/route.ts` is the standard NextAuth route handler.
- `getServerAuthSession()` (`src/lib/auth/session.ts`) wraps `getServerSession(authOptions)` for server components/actions.
- `src/components/session-provider.tsx` wraps the app in NextAuth's client `SessionProvider` (mounted in `src/app/layout.tsx`).
- `src/app/(auth)/login/page.tsx` is a real client-side form (`signIn("credentials", ...)`, `redirect: false`, manual redirect on success, visible error on failure).
- `src/proxy.ts` routes legacy `www` app/authentication URLs and cross-surface paths to the correct subdomain. It does not replace the role checks in layouts/actions.
- **Login rate limiting**: `User.failedLoginAttempts`/`User.lockedUntil` (migration `20260720120000_add_login_lockout`). Five wrong passwords locks the account for 15 minutes; a correct password resets the counter. **Important NextAuth v4 gotcha, confirmed in `node_modules/next-auth/core/routes/callback.js`**: the credentials provider collapses every `authorize()` failure — including a thrown `Error` — to the fixed string `"CredentialsSignin"`; a custom message thrown from `authorize()` never reaches the client. The lock message is therefore surfaced via a separate pre-check, `getAccountLockStatus(email)` in `src/lib/auth/actions.ts`, called by the login page *before* invoking `signIn()` — not by trying to smuggle a message through NextAuth's error channel.
- `src/components/navigation/user-menu.tsx` uses `useSession()` for real name/email/initials and `signOut({ callbackUrl: "/login" })`.

**Password reset and invitations:**
- Both reuse NextAuth's standard `VerificationToken { identifier, token, expires }` model (previously unused), single-use (deleted on consumption), with distinct TTLs: 1 hour for password reset, 7 days for invites. See `src/lib/auth/tokens.ts`.
- Server actions in `src/lib/auth/actions.ts`:
  - `requestPasswordReset` — never reveals whether an email exists (always redirects to `/forgot-password?sent=1` regardless); only issues a token and sends an email if the user exists and is ACTIVE.
  - `resetPassword` — validates password length (≥8) and confirmation match, consumes the token, bcrypt-hashes the new password, redirects to `/login?reset=1`.
  - `acceptInvite` — consumes an invite token, sets the user's password and `status: "ACTIVE"`, and flips the matching `OrganizationMember` from `INVITED` to `ACTIVE` (`joinedAt` set), all inside one `db.$transaction`.
- Pages: `src/app/(auth)/forgot-password/page.tsx`, `src/app/(auth)/reset-password/page.tsx`, `src/app/(auth)/invite/page.tsx`.
- New-account invitation acceptance carries the canonical invited address into
  `/login` and prefills it, preventing the customer from accidentally signing
  in or requesting a reset with a different enquiry/contact address. Password
  fields preserve the exact submitted value, including intentional leading or
  trailing spaces. The login page carries its current email into the forgot-
  password form, and its password field has an accessible visibility toggle.
- The admin-facing "send an invite" UI (`inviteMember` server action, `/app/administration`) was built in Phase 4 — it creates the `User`/`OrganizationMember` rows, issues the token, and sends the email in one `db.$transaction`, logging an `AuditLog` entry. "Super Admin" is excluded from the invitable-role list to prevent a tenant admin from granting Rock Frost's own operator role.
- Email delivery (`src/lib/email.ts`) degrades gracefully: if `RESEND_API_KEY` is unset, `sendEmail()` logs a `console.warn` and returns `{ ok: false }` instead of throwing. Today `RESEND_API_KEY` is unset in this environment, so reset/invite/contact emails are logged, not delivered — the UI and token logic work end-to-end regardless.
- Invitation and billing callback URLs always use the tenant origin. Password-reset links preserve the surface where the reset was requested, so an owner returns to `admin.*` and a tenant returns to `app.*`.

**Route protection:**
- `src/app/app/layout.tsx` wraps every route under `/app/*`. It redirects to `/login` if there is no session, and renders a "No organization access" message if `getCurrentTenant()` (`src/lib/tenant/index.ts`) returns null (session exists but no matching `OrganizationMember`). Otherwise it renders children.
- `getCurrentTenant()`/`requireCurrentTenant()` resolve the current `OrganizationMember`, including `organization`, `branch`, and `role.rolePermissions.permission`, and expose a flattened `permissions: string[]`, `enabledModuleKeys: string[]` (from `OrganizationModule.enabled`), and `memberships` (every organization the user belongs to) on the returned `TenantContext`.
- Tenant users normally start in the organization chosen at login (`session.user.organizationId`) and can switch among their active memberships via the `active_org` cookie (`src/lib/tenant/actions.ts`'s `switchOrganization`, surfaced as `OrganizationSwitcher` in the sidebar).
- Platform identity is immutable across organization selection. `src/lib/auth/platform-identity.ts` recognizes an active global system `Super Admin` membership; NextAuth and `getCurrentTenant()` then canonicalize that user to the internal platform anchor before considering JWT or cookie organization state. A platform user cannot switch into a tenant, be invited into a tenant, or be selected as a new tenant's owner. See `docs/PLATFORM_IDENTITY_BOUNDARY.md`.

## Authorization — real (Phase 4)

Authentication determines who the user is. Authorization determines what they can access. Kept conceptually and structurally separate: `src/lib/auth/` handles identity, `src/lib/auth/permissions.ts` and `src/lib/tenant/` handle access.

- **Platform role** — the "Super Admin" system role (seeded via the archived `seed-rbac.ts`, `isSystem: true`, `organizationId: null`) gates `/app/platform/*`, checked via `isPlatformOperator()` in `src/app/app/platform/layout.tsx`. Deliberately a role-name check rather than a permission key: Organization Owner holds every permission a tenant can have (`ALL_PERMISSIONS` in the RBAC seed) but must never reach Rock Frost's own operator surface.
- **Organization-admin permission** — `org.settings.manage` gates `/app/administration` and `/app/organization`, both at the page level and by filtering them out of the workspace sidebar nav (`src/platform/modules/workspace-navigation.tsx`'s `getWorkspaceNavigation(tenant)`).
- **Permissions** — 104 permission keys are seeded across thirteen module prefixes, including unique `hotel.*` and `school.*` families, plus shared dashboard, organization, AI-assistant, and audit-view/export keys. See `src/lib/auth/permissions.ts` for the current list. **Do not reuse a permission across modules.** Hotel separates properties, rooms, guests, reservations, folios, housekeeping, restaurant, channels, reports, and settings; School separates campuses, students, academics, enrollment, attendance, fees, exams, exam publishing, timetables, transport, library, payroll inputs, reports, and settings.
- **Module access is prefix-based, not a single ".view" permission** — `canAccessModule(tenant, moduleKey)` requires the module enabled for the organization (`OrganizationModule.enabled`) AND at least one permission starting with that module's prefix. This matters concretely for the Investor role: it holds `fleet.investor.view` and `fleet.reports.view` but not `fleet.view`, and still needs to reach the Fleet module shell.
- **Branch-level access** — still not enforced anywhere; Fleet records carry an optional `branchId` (populated on create where relevant) but nothing gates on it yet. Revisit once branch-scoped workflows actually matter (multiple active branches).
- **Action-level permissions within a module** — real for both Fleet (Phase 6) and Installment (Phase 7). Every page's create/edit controls are gated on that specific area's `.manage` permission (`fleet.vehicles.manage`, `hirepurchase.products.manage`, etc.), and each module's Reports page is gated separately on its own `.reports.view` permission — deliberately distinct from module access, since e.g. Fleet's Driver/Mechanic can enter Fleet but don't hold the reports permission. Viewing a list itself only requires reaching the module (`canAccessModule`); only mutations require the specific `.manage` permission.
- **Data-level scoping within a module (Installment only, so far)** — `resolveInstallmentStaffScope()` restricts a field-staff user (holding `hirepurchase.customers.manage` etc. but not `hirepurchase.staff.manage`) to only their own assigned customers/accounts/payments/credits; a manager (`hirepurchase.staff.manage`) sees everyone's. This is a real data-scoping rule migrated from GLV, one level narrower than the module-wide permission checks above — worth applying to Fleet too if a similarly staff-owned data model emerges there.
- **Step-up re-authentication** — `verifyCurrentPassword()` (`src/lib/auth/verify-password.ts`) requires the acting user to re-enter their own current password, checked via `bcrypt.compare` against their own hash, for a short list of irreversible/financial Installment actions: marking a credit refunded or void, and reactivating a dormant/probation/closed account (which deducts a service fee). This is separate from session auth and from the permission check that already gates who can reach the action — migrated from GLV's admin-password-confirmation pattern, generalized to any signed-in user since the permission model already controls who can attempt these actions.

**Enforcement surface — all three real, and now demonstrated at the page level too:**
1. **Permission-aware navigation** — `getWorkspaceNavigation(tenant)` filters Administration/Organization by `org.settings.manage`. The module launcher and `/app/modules` render three real states (open / not enabled for your org / coming soon) driven by `tenant.enabledModuleKeys`, not a hardcoded "available" flag.
2. **Permission-aware server actions** — every Fleet action (e.g. `upsertFleetVehicle`, `reviewMaintenanceRequest`, `verifyPayment`) as well as `inviteMember` and `toggleOrganizationModule` re-check the relevant permission/role server-side (never trust the page-level guard alone, since server actions are directly callable).
3. **Permission-aware page-level guards** — `/app/platform/*`, `/app/administration`, `/app/organization`, `/app/fleet`, `/app/installment` all redirect/block server-side for a user who reaches the URL directly without the right access. Within Fleet, each page additionally hides its own manage controls (buttons, edit links) from a signed-in user who can view but not mutate that area — verified via browser testing across Fleet Manager (full access), Driver (maintenance-only manage, no reports), and Investor (reports-only, no manage anywhere).

## Known gaps carried forward

- No public self-registration/signup flow (the Phase 4 invite UI covers admin-initiated onboarding, not self-signup) — a deliberate choice for an invite-only B2B platform, not an oversight.
- No email verification UI (moot until a registration flow exists).
- No branch-level access enforcement yet (see above).
- No owner-facing approval portal — `FleetOwner` has no login/session concept in this schema, so `FleetMaintenanceRequest.ownerApprovalStatus` is tracked but never set by anyone; only the fleet-manager-side `approvalStatus` is wired to the UI. Building this would mean adding an entirely new authenticated user type, not a small fix.
- No fuzzy duplicate-detection on customer/product creation, no hard deletes for financial records (payments/accounts/customers) — both real GLV features, deliberately deferred as scope-control decisions.
- `RESEND_API_KEY` is unset in this environment — reset/invite/contact emails log via `console.warn` instead of delivering. Set the key to enable real delivery; no code changes required.
