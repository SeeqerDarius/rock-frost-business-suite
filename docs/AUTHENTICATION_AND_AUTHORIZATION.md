# Authentication and Authorization

**Status: not implemented.** This document describes the plan (Phase 3 of `docs/DEVELOPMENT_ROADMAP.md`), not current behavior. Everything user/session-related in the current codebase is static placeholder UI — see below for exactly what.

## Current placeholder state (as of Phase 1)

- `src/app/(auth)/login/page.tsx` — a real-looking form with no submit handler. Submitting it does a harmless default browser form GET; nothing is authenticated.
- `src/app/(auth)/forgot-password/page.tsx` — same: UI only.
- `src/components/navigation/user-menu.tsx` — shows a static "U" avatar. "Sign out" just links to `/login`; there is no session to actually clear.
- No middleware, no route guards. Every route under `/app/*` renders for anyone regardless of auth state.

**Do not treat any of the above as a real security boundary.** Nothing in this phase should be mistaken for working authentication.

## Planned approach (Phase 3)

Authentication determines who the user is. Authorization determines what they can access. Keep these conceptually and structurally separate.

**Authentication:**
- NextAuth, credentials provider (email + password, bcrypt-hashed), against the `User` model already in `prisma/schema.prisma`.
- Real sessions (JWT strategy, matching the previous implementation's approach unless a reason to change surfaces during the work).
- Invitations, account approval, password reset, and email verification — at minimum the data model and route structure for these; delivery (email sending) can lag behind if needed, but the architecture should not preclude it.

**Authorization:**
- **Platform roles** — for Rock Frost operators (`platform.super_admin`, etc.) — gate `/app/platform/*`.
- **Organization roles** — `organization.owner`, `organization.admin` — gate `/app/administration`, `/app/organization`, etc.
- **Module permissions** — one permission namespace per module, e.g. `fleet.manager`, `fleet.driver`, `fleet.maintenance_officer`, `installment.manager`, `installment.staff`. **Do not reuse a Fleet role for Installment** or vice versa — this is a module-boundary rule, not just a naming convention (see `docs/MODULE_BOUNDARIES.md`).
- **Branch-level access** where a module has branch granularity (Fleet likely will; confirm per-module during Phase 6/7).
- **Action-level permissions** within a module where needed (e.g. `fleet.vehicles.manage` vs `fleet.vehicles.view`) — mirror the granularity the previous implementation's `lib/permissions/constants.ts` had (archived at `docs/archive/previous-implementation/`), re-validated rather than copied verbatim.

**Enforcement surface — all three required, not just one:**
1. **Permission-aware navigation** — `SidebarNav`/`AppShell` should filter nav items by the current user's permissions once real sessions exist (today, everything shown is hardcoded per module regardless of any role).
2. **Permission-aware APIs / server actions** — every mutation must check both organization scope and the specific permission it requires.
3. **Permission-aware page-level guards** — a user without the right role hitting a URL directly must be redirected/blocked server-side, not just "not linked to" in the nav.

## Known gap carried forward

The previous implementation never built real rate limiting or account lockout on failed logins, and its forgot-password/reset-password/invite flows were UI-only placeholders with no backing logic (see the archived `OPERATOR_HANDOFF.md` entries). Phase 3 should treat these as real requirements, not optional polish, if this platform is meant for production use.
