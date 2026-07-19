> **OBSOLETE — ARCHIVED DOCUMENT**
>
> This document describes the previous Rock Frost Business Suite implementation, which was fully retired during the clean rebuild that began 2026-07-19. It is kept for historical reference only.
>
> **Coding agents must NOT follow this document.** It is not authoritative. See the current `docs/` directory and `OPERATOR_HANDOFF.md` at the repository root for the active architecture and roadmap.

# Rock Frost Business Suite Authentication Plan

This document defines the authentication architecture for Rock Frost Business Suite as preparation for Phase 2.
It is based on the platform blueprint in `docs/ARCHITECTURE_BIBLE.md` and the roadmap in `docs/DEVELOPMENT_ROADMAP.md`.

## 1. Authentication goals

- Establish a secure identity layer for the SaaS dashboard.
- Support tenant-aware user sessions and organization context.
- Preserve the public marketing website as unauthenticated.
- Ensure future support for email/password, OAuth, and external identity providers.
- Lay the groundwork for session security, route protection, and role-based access.

## 2. User types

- **Administrator**: Platform tenant admin with access to organization settings and module management.
- **Fleet Manager**: Primary fleet operations user responsible for drivers, vehicles, and maintenance.
- **Driver**: Operational user with access to assigned vehicles, requests, and schedules.
- **Vehicle Owner**: Business partner or asset owner with access to owned vehicle information.
- **Mechanic**: Service provider user for maintenance and repair workflows.
- **Investor**: Read-only stakeholder with access to performance reports.
- **Guest / Public user**: Visitor on the marketing site only.

## 3. Login flow

### Objective
- Authenticate users with secure credentials and establish a dashboard session.

### Flow
1. User navigates to `/login`.
2. The login page collects email and password.
3. Credentials are submitted to the authentication API.
4. The server verifies credentials, resolves the user, and loads organization membership.
5. A secure session token is issued and stored in an HTTP-only cookie.
6. User is redirected to `/dashboard` or the last visited protected page.

### Notes
- The current `app/login/page.tsx` is a static UI-only form.
- This page should be updated later to connect to the auth API and handle validation errors.

## 4. Signup/onboarding flow

### Objective
- Allow new tenant creation and user onboarding in a controlled flow.

### Flow
1. A user chooses to sign up from the marketing site.
2. The system collects organization details and primary administrator information.
3. A new organization record is created in the platform.
4. The primary user is created and assigned the Administrator role.
5. The user receives credentials and a session is established.

### Notes
- Signup is a future capability and should be supported by the same auth stack as login.
- The onboarding flow may be versioned separately from the core login page.

## 5. Organization invite flow

### Objective
- Enable tenant administrators to invite team members into an organization.

### Flow
1. Admin triggers an invite from organization settings.
2. The platform sends an invite email containing a secure token.
3. The invitee follows the link and either signs in or registers.
4. The system binds the user to the organization and role upon acceptance.

### Notes
- The invite flow requires token safety, expiration, and audit logging.
- Invitations should include tenant context but avoid preloading sensitive data.

## 6. Password reset flow

### Objective
- Provide a secure and user-friendly password recovery process.

### Flow
1. User requests a password reset from the login page.
2. The platform issues a time-limited reset link to the user email.
3. The user clicks the link and enters a new password.
4. The server validates the token, updates the password hash, and invalidates existing sessions if necessary.

### Notes
- Password reset should be implemented as a future secure API route.
- Reset tokens must be one-time use and should expire quickly.

## 7. Session strategy

### Recommended approach
- Use HTTP-only cookies for session persistence.
- Store a secure session token or JWT with tenant and role claims.
- Use `SameSite=Strict` or `Lax` and `Secure` for production.
- Minimize session payloads: user ID, organizationId, role IDs, and expiration.

### Session renewal
- Support session refresh or rolling expiration for logged-in users.
- Invalidate sessions on logout, password change, or permission changes.

### Notes
- The initial setup should avoid client-side storage of sensitive tokens.
- Auth state should be available at the server route-layer to protect dashboard pages.

## 8. Route protection strategy

### Current state
- Dashboard routes are grouped under `app/(dashboard)`.
- The marketing site is separate and remains public.

### Recommended strategy
- Protect all `app/(dashboard)` routes with an authentication check.
- Use a root dashboard layout or middleware to redirect unauthenticated users to `/login`.
- Keep marketing routes public and separate from dashboard auth logic.
- Ensure `/login` remains available without requiring authentication.

### Later changes
- Add auth guards to `app/(dashboard)/layout.tsx` or route middleware.
- Publish a route map of protected pages and exceptions.

## 9. Role-based access preparation

### Objective
- Prepare the platform for RBAC without fully implementing it yet.

### Recommended preparation
- Define roles and permissions in documentation and planning.
- Ensure session tokens carry a minimal set of role identifiers.
- Design UI navigation so it can hide or show links based on role claims.
- Keep backend checks separate from UI-only role assumptions.

### Notes
- Current UI should not depend on roles yet.
- The next step after auth is to connect roles to organization membership.

## 10. Recommended Auth.js setup

### Why Auth.js
- It provides a battle-tested authentication framework for Next.js.
- Supports credential providers, OAuth, sessions, and callbacks.
- Works well with server components and API route handlers.

### Minimal setup
- Install `next-auth` or the current recommended Auth.js package for the Next.js version.
- Configure a credentials provider for email/password login.
- Add future providers for Google, Microsoft, or SAML.
- Define callbacks to add `organizationId` and role claims to the session.

### Suggested files/folders
- `app/api/auth/[...nextauth]/route.ts` or equivalent.
- `lib/auth/next-auth.ts`
- `lib/auth/session.ts`
- `components/auth/LoginForm.tsx`
- `components/auth/ProtectedRoute.tsx`

### Notes
- The first implementation should use the credentials provider only.
- Keep Auth.js configuration decoupled from tenant and role logic.

## 11. Required future environment variables

- `NEXTAUTH_URL` - platform base URL.
- `NEXTAUTH_SECRET` - secure session signing secret.
- `DATABASE_URL` - future database connection string.
- `EMAIL_SERVER` - future email delivery service.
- `EMAIL_FROM` - sender address for invites and password resets.
- `AUTH_COOKIE_NAME` - optional custom cookie name.
- `JWT_SECRET` - if JWT sessions are used.
- `NEXTAUTH_URL_INTERNAL` - optional internal callback URL.

## 12. Security risks and mitigations

### Risks
- Credential leaks from insecure storage.
- Session fixation or replay attacks.
- Cross-tenant session confusion.
- Unauthorized dashboard access.
- Weak invite or reset token handling.

### Mitigations
- Use HTTP-only secure cookies and `SameSite` policy.
- Store password hashes with a strong algorithm like bcrypt or argon2.
- Include `organizationId` in session claims and validate on every request.
- Implement one-time tokens for invites and password resets.
- Enforce route protection at the root dashboard level.

## 13. Step-by-step implementation plan

### Step 1: Define auth architecture
- Document login, signup, invite, password reset, and session flows.
- Keep the marketing site separate from the dashboard.

### Step 2: Prepare auth routing
- Keep `app/login/page.tsx` as the login entry point.
- Plan `app/api/auth/[...nextauth]/route.ts` for future Auth.js integration.
- Reserve authenticated dashboard route protection in `app/(dashboard)/layout.tsx`.

### Step 3: Build auth scaffolding
- Create placeholder auth utilities in `lib/auth/`.
- Add shared session helpers and interface definitions.
- Keep actual implementation offline until database support is ready.

### Step 4: Enable secure sessions later
- Implement HTTP-only cookie sessions with tenant and role claims.
- Ensure dashboard route guards use these sessions.

### Step 5: Add role-based access
- Extend session claims with role identifiers.
- Add role-aware navigation preparation in the dashboard shell.
- Plan permission enforcement for module routes.

### Step 6: Deploy in phases
- Start with email/password credentials provider.
- Add signup and invite flows once tenant models exist.
- Introduce password reset after email infrastructure is available.

## Current login page and dashboard routing inspection

### Current login page
- Located at `app/login/page.tsx`.
- Presents a styled email/password form.
- Does not currently submit data or authenticate users.
- This page is a good placeholder for the future login implementation.

### Dashboard route grouping
- Dashboard routes are contained in `app/(dashboard)/...`.
- `app/(dashboard)/layout.tsx` currently provides the dashboard shell.
- This route group is the correct place to enforce authenticated access.
- No changes are needed now, but future auth should wrap this layout.

## Suggestions for later changes

- Convert the static login form into a real Auth.js-backed sign-in form.
- Add a `/api/auth` route group for credentials and future provider support.
- Protect `app/(dashboard)` with authentication middleware or a server-side auth guard.
- Preserve the marketing route separation while enabling dashboard security.
- Ensure session tokens include `organizationId` and role claims before implementing RBAC.

## Summary

This authentication plan defines the foundation for Phase 2 without changing current app behavior. It documents goals, flows, session strategy, route protection, and recommended Auth.js setup while leaving actual implementation for later.
