# Installment Module Audit and Upgrade

## Scope

This audit compares the current `glv-management-system` codebase with Rock Frost Business Suite's Installment module. GLV is a single-organization application; Rock Frost is a multi-tenant SaaS. Business behavior is migrated, but every data operation remains scoped by `organizationId`, uses Rock Frost permissions, and writes to the shared audit trail.

## Architecture decision

- Keep the current shared PostgreSQL database and organization-scoped tables.
- Do not copy GLV's global singleton settings, global roles, owner-email checks, or single-tenant backup/restore behavior.
- Keep authentication, invitations, profiles, appearance, presence, notifications, 2FA, and backups at the platform layer. They are not Installment-domain records.
- Preserve legacy staff-inventory data for compatibility, but stop requiring staff inventory allocation when an account is opened. Current GLV no longer uses that workflow.
- Use precise decimal arithmetic for persisted money calculations and row locking/guarded writes for payment and credit operations.

## Capability matrix

| Capability | Status in Rock Frost |
|---|---|
| Organization-scoped staff, customers, products, accounts, payments, credits and settings | Complete |
| Staff-to-login linkage and staff data visibility | Complete |
| Customer create/edit and staff assignment | Complete |
| Bulk customer reassignment | Added in this upgrade |
| Product categories | Complete |
| Category edit, activation, ordering and safe deletion | Added in this upgrade |
| Product create/edit, computed installment price and validation | Complete |
| Product activation/deactivation and safe deletion | Added in this upgrade |
| Account creation with optional first deposit | Complete |
| Account creation without obsolete staff-stock requirement | Added in this upgrade |
| Administration fee and minimum-deposit policy | Complete |
| Effective overdue state and lifecycle sweep | Complete |
| Dormant/probation/closed reactivation and refund deduction | Complete |
| Suspend, resume, cancel, complete, archive and delivery lifecycle | Complete |
| Account price correction with password confirmation | Added in this upgrade |
| Account product correction with schedule/balance/credit recalculation | Added in this upgrade |
| Payment recording, edit window and overpayment credit | Complete |
| Payment reversal with account recomputation and audit event | Added in this upgrade |
| Credit refund, void and apply-to-account | Complete |
| Staff salaries and effective salary history | Complete |
| Salary payment history and reversal | Added in this upgrade |
| Procurement threshold and cost projection | Complete |
| Financial summary, staff performance and weekly collection activity | Complete |
| Audit logging for sensitive corrections and reversals | Complete |

## Platform-level GLV features

GLV also contains features that should not be duplicated inside each module:

- login throttling and account security;
- two-factor authentication;
- appearance preferences;
- profile-change approvals;
- staff signup/application onboarding;
- user presence and notifications;
- automated database backup and restore;
- support assistant;
- PWA/offline shell.

These require a platform-wide audit against Rock Frost's existing implementations. Database restore in particular cannot be copied from the single-tenant GLV app because it could overwrite other organizations in the shared SaaS database. Any future tenant export/import must enforce organization ownership and must never restore global identity or platform tables.

## Safety controls

- All service functions accept `organizationId`; reads and writes verify tenant ownership.
- Staff users retain customer/account ownership scoping.
- Price and product corrections require the acting user's password.
- Payment deletion requires the acting user's password and is blocked when its credit has already been resolved or partially consumed.
- Products with accounts cannot be deleted; they must be deactivated.
- Categories in use cannot be deleted.
- Recalculation retains payment history and creates customer credit for overpayment.

## Validation required before release

1. Generate Prisma Client and type-check.
2. Run lint and production build.
3. Exercise account creation, correction, payment reversal, bulk reassignment, product/category lifecycle and salary reversal.
4. Commit and push the reviewed source.
5. Deploy the exact commit through Vercel and verify production routes and logs.
