# Authentication and Authorization

**Status: authentication is real (Phase 3, complete). Authorization enforcement is partial** — organization/tenant scoping is real; fine-grained navigation/action-level permission filtering is deferred to Phase 4.

## Current implementation (as of Phase 3)

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
- **Deferred to Phase 4**: there is no admin-facing UI yet to actually *create* an invite (issue the token, create the `User`/`OrganizationMember` rows). The accept-invite flow is built and works against tokens issued directly in the database; the "send an invite" admin screen is Phase 4 (Platform Workspace / user management) scope.
- Email delivery (`src/lib/email.ts`) degrades gracefully: if `RESEND_API_KEY` is unset, `sendEmail()` logs a `console.warn` and returns `{ ok: false }` instead of throwing. Today `RESEND_API_KEY` is unset in this environment, so reset/invite/contact emails are logged, not delivered — the UI and token logic work end-to-end regardless.

**Route protection:**
- `src/app/app/layout.tsx` wraps every route under `/app/*`. It redirects to `/login` if there is no session, and renders a "No organization access" message if `getCurrentTenant()` (`src/lib/tenant/index.ts`) returns null (session exists but no matching `OrganizationMember`). Otherwise it renders children.
- `getCurrentTenant()`/`requireCurrentTenant()` resolve the current `OrganizationMember` (by session `userId` + `organizationId`), including `organization`, `branch`, and `role.rolePermissions.permission`, and expose a flattened `permissions: string[]` on the returned `TenantContext`.

## Authorization — planned, partially built

Authentication determines who the user is. Authorization determines what they can access. Keep these conceptually and structurally separate.

- **Platform roles** — for Rock Frost operators (`platform.super_admin`, etc.) — gate `/app/platform/*`. Not yet enforced at the layout level (Phase 4).
- **Organization roles** — `organization.owner`, `organization.admin` — gate `/app/administration`, `/app/organization`, etc. Not yet enforced (Phase 4).
- **Module permissions** — one permission namespace per module, e.g. `fleet.manager`, `fleet.driver`, `fleet.maintenance_officer`, `installment.manager`, `installment.staff`. **Do not reuse a Fleet role for Installment** or vice versa — this is a module-boundary rule, not just a naming convention (see `docs/MODULE_BOUNDARIES.md`).
- **Branch-level access** where a module has branch granularity (Fleet likely will; confirm per-module during Phase 6/7).
- **Action-level permissions** within a module where needed (e.g. `fleet.vehicles.manage` vs `fleet.vehicles.view`).

**Enforcement surface — all three required, only the third exists today:**
1. **Permission-aware navigation** — `SidebarNav`/`AppShell` still show every nav item for a module regardless of role. Not yet built (Phase 4).
2. **Permission-aware APIs / server actions** — not yet built; Fleet/Installment have no real mutations yet (Phase 6/7).
3. **Permission-aware page-level guards** — partially real today: `/app/*` requires a session and organization membership, but does not yet check module- or role-specific permissions beyond that.

## Known gaps carried forward into Phase 4+

- No rate limiting or account lockout on failed logins.
- No admin-facing "send invite" UI (tokens must currently be issued directly against the database).
- No public self-registration/signup flow.
- No email verification UI (moot until a registration flow exists).
- `RESEND_API_KEY` is unset in this environment — reset/invite/contact emails log via `console.warn` instead of delivering. Set the key to enable real delivery; no code changes required.
