# Authentication and Authorization

**Status: authentication (Phase 3) and role/module-level authorization (Phase 4) are both real and enforced.** Action-level permission checks inside a module's own pages (e.g. `fleet.vehicles.manage` vs `fleet.vehicles.view` on a single Fleet page) remain a Phase 6/7 concern, since those pages don't exist yet.

## Current implementation (Phase 3 authentication + Phase 4 authorization)

**Authentication:**
- NextAuth v4, credentials provider (email + password, bcrypt-hashed) — `src/lib/auth/nextauth.ts`. `authorize()` looks up `User` by lowercased email, requires `status === "ACTIVE"`, verifies the password with `bcrypt.compare`, and updates `lastLoginAt`.
- JWT session strategy. `Session.user` / `JWT.user` carry `{ id, organizationId, role }` via a type augmentation in `src/lib/auth/next-auth.d.ts`.
- `src/app/api/auth/[...nextauth]/route.ts` is the standard NextAuth route handler.
- `getServerAuthSession()` (`src/lib/auth/session.ts`) wraps `getServerSession(authOptions)` for server components/actions.
- `src/components/session-provider.tsx` wraps the app in NextAuth's client `SessionProvider` (mounted in `src/app/layout.tsx`).
- `src/app/(auth)/login/page.tsx` is a real client-side form (`signIn("credentials", ...)`, `redirect: false`, manual redirect on success, visible error on failure).
- `src/components/navigation/user-menu.tsx` uses `useSession()` for real name/email/initials and `signOut({ callbackUrl: "/login" })`.

**Password reset and invitations:**
- Both reuse NextAuth's standard `VerificationToken { identifier, token, expires }` model (previously unused), single-use (deleted on consumption), with distinct TTLs: 1 hour for password reset, 7 days for invites. See `src/lib/auth/tokens.ts`.
- Server actions in `src/lib/auth/actions.ts`:
  - `requestPasswordReset` — never reveals whether an email exists (always redirects to `/forgot-password?sent=1` regardless); only issues a token and sends an email if the user exists and is ACTIVE.
  - `resetPassword` — validates password length (≥8) and confirmation match, consumes the token, bcrypt-hashes the new password, redirects to `/login?reset=1`.
  - `acceptInvite` — consumes an invite token, sets the user's password and `status: "ACTIVE"`, and flips the matching `OrganizationMember` from `INVITED` to `ACTIVE` (`joinedAt` set), all inside one `db.$transaction`.
- Pages: `src/app/(auth)/forgot-password/page.tsx`, `src/app/(auth)/reset-password/page.tsx`, `src/app/(auth)/invite/page.tsx`.
- The admin-facing "send an invite" UI (`inviteMember` server action, `/app/administration`) was built in Phase 4 — it creates the `User`/`OrganizationMember` rows, issues the token, and sends the email in one `db.$transaction`, logging an `AuditLog` entry. "Super Admin" is excluded from the invitable-role list to prevent a tenant admin from granting Rock Frost's own operator role.
- Email delivery (`src/lib/email.ts`) degrades gracefully: if `RESEND_API_KEY` is unset, `sendEmail()` logs a `console.warn` and returns `{ ok: false }` instead of throwing. Today `RESEND_API_KEY` is unset in this environment, so reset/invite/contact emails are logged, not delivered — the UI and token logic work end-to-end regardless.

**Route protection:**
- `src/app/app/layout.tsx` wraps every route under `/app/*`. It redirects to `/login` if there is no session, and renders a "No organization access" message if `getCurrentTenant()` (`src/lib/tenant/index.ts`) returns null (session exists but no matching `OrganizationMember`). Otherwise it renders children.
- `getCurrentTenant()`/`requireCurrentTenant()` resolve the current `OrganizationMember`, including `organization`, `branch`, and `role.rolePermissions.permission`, and expose a flattened `permissions: string[]`, `enabledModuleKeys: string[]` (from `OrganizationModule.enabled`), and `memberships` (every organization the user belongs to) on the returned `TenantContext`.
- The active organization is normally the one chosen at login (`session.user.organizationId`), but a user in more than one organization can switch via the `active_org` cookie (`src/lib/tenant/actions.ts`'s `switchOrganization`, surfaced as `OrganizationSwitcher` in the sidebar) — honored only if a real `OrganizationMember` row for that organization still exists, so a stale/tampered cookie can't grant access to an organization the user has since left.

## Authorization — real (Phase 4)

Authentication determines who the user is. Authorization determines what they can access. Kept conceptually and structurally separate: `src/lib/auth/` handles identity, `src/lib/auth/permissions.ts` and `src/lib/tenant/` handle access.

- **Platform role** — the "Super Admin" system role (seeded via the archived `seed-rbac.ts`, `isSystem: true`, `organizationId: null`) gates `/app/platform/*`, checked via `isPlatformOperator()` in `src/app/app/platform/layout.tsx`. Deliberately a role-name check rather than a permission key: Organization Owner holds every permission a tenant can have (`ALL_PERMISSIONS` in the RBAC seed) but must never reach Rock Frost's own operator surface.
- **Organization-admin permission** — `org.settings.manage` gates `/app/administration` and `/app/organization`, both at the page level and by filtering them out of the workspace sidebar nav (`src/platform/modules/workspace-navigation.tsx`'s `getWorkspaceNavigation(tenant)`).
- **Module permissions** — 22 permission keys seeded across two prefixes, `fleet.*` and `hirepurchase.*` (see `src/lib/auth/permissions.ts`'s `PERMISSIONS` object for the full list — it mirrors the previous implementation's `lib/permissions/constants.ts`, archived at `docs/archive/previous-implementation/`, re-validated against the live database rather than copied blindly). **Do not reuse a Fleet permission for Installment** or vice versa — this is a module-boundary rule, not just a naming convention (see `docs/MODULE_BOUNDARIES.md`).
- **Module access is prefix-based, not a single ".view" permission** — `canAccessModule(tenant, moduleKey)` requires the module enabled for the organization (`OrganizationModule.enabled`) AND at least one permission starting with that module's prefix. This matters concretely for the Investor role: it holds `fleet.investor.view` and `fleet.reports.view` but not `fleet.view`, and still needs to reach the Fleet module shell.
- **Branch-level access** — not yet enforced anywhere; revisit per-module during Phase 6/7 once Fleet/Installment have real branch-scoped data to query.
- **Action-level permissions** within a module (e.g. `fleet.vehicles.manage` vs `fleet.vehicles.view` on a single page) — deferred to Phase 6/7, since neither module has real pages yet to gate.

**Enforcement surface — all three now real:**
1. **Permission-aware navigation** — `getWorkspaceNavigation(tenant)` filters Administration/Organization by `org.settings.manage`. The module launcher and `/app/modules` render three real states (open / not enabled for your org / coming soon) driven by `tenant.enabledModuleKeys`, not a hardcoded "available" flag.
2. **Permission-aware server actions** — `inviteMember` and `toggleOrganizationModule` both re-check the relevant permission/role server-side (never trust the page-level guard alone, since server actions are directly callable).
3. **Permission-aware page-level guards** — `/app/platform/*`, `/app/administration`, `/app/organization`, `/app/fleet`, `/app/installment` all redirect/block server-side for a user who reaches the URL directly without the right access, not just "not linked to" in the nav.

## Known gaps carried forward into Phase 5+

- No rate limiting or account lockout on failed logins.
- No public self-registration/signup flow (the Phase 4 invite UI covers admin-initiated onboarding, not self-signup).
- No email verification UI (moot until a registration flow exists).
- No action-level (in-page) permission checks yet — Fleet and Installment have no real pages to check against (Phase 6/7).
- No branch-level access enforcement yet.
- `RESEND_API_KEY` is unset in this environment — reset/invite/contact emails log via `console.warn` instead of delivering. Set the key to enable real delivery; no code changes required.
