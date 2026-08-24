# HR module

## Employee model

`HrEmployee` (`prisma/schema.prisma`) is the core record: `employeeNumber` (unique per organization, generated from a configurable prefix, see `getHrSettings`/`generateEmployeeNumber` in `src/modules/hr/service.ts`), `fullName`, `email`, `phone` (work phone), `mobilePhone`, `tags` (`String[]`, free-form), `photoData` (an optional base64 data-URI, same pattern as `InventoryItem.imageData`/School `photoData` — see "Employee photos" below), `jobTitle`, `department` (plain string, not a separate entity — see "Departments" below), `hireDate`, `terminationDate`, `status` (`HrEmployeeStatus`), `payrollEligible`, `managerId` (a self-relation, `manager`/`reports`, used for the org chart), and `userId` (optional link to a platform `User` account).

Employee rows are also created automatically whenever an organization member with an HR-eligible role becomes active (`ensureHrEmployeeForUser`/`syncActiveOrganizationMembersToHr`) — not every employee is manually entered through the Employees page.

## Departments

There is no separate `Department` table. A department is just the distinct, non-null values of `HrEmployee.department`, with employees who have no department grouped under "Unassigned". `getHrSummary()`'s `departmentCounts` already computes this grouping (excluding terminated employees) for the HR Overview page; the Departments page (`/app/hr/departments`) reuses the same grouping, rendering one tile per department with an employee count, linking to `/app/hr/employees?department={name}`.

## Employees views

`/app/hr/employees` supports two presentations of the same data via `?view=table|kanban` (table is the default): the original table, and a tile-grid kanban view (photo-or-initial avatar, name, job title, work email, work phone, status and tag badges) built on the same tile pattern as the dashboard's Quick launch grid and POS's product picker. `?department=` filters either view to one department, matching the links from the Departments page.

## Employee photos

Employee photos follow the same convention used for Inventory item images and School student/guardian photos: a validated base64 data URI stored directly on the row (`HrEmployee.photoData`), never a separate image table or file storage. Validation and parsing live in `src/lib/hr-employee-image.ts` (`hrEmployeePhotoData()`, `parseHrEmployeePhoto()` — 1 MB cap, JPEG/PNG/WebP only, magic-byte checked). Photos are served through `GET /api/hr/employees/[employeeId]/photo`, a tenant-scoped route mirroring `/api/inventory/items/[itemId]/image`.

## Tags

`HrEmployee.tags` is a free-form `String[]`. The employee form takes a single comma-separated text input (`parseTags()` in `src/app/app/hr/employees/actions.ts`) rather than a dedicated chip/multi-select widget — no such widget exists anywhere else in this codebase yet, so this is the simplest correct mechanism rather than a placeholder.

## Employee profile page

`/app/hr/employees/[employeeId]` is the first individual employee detail view this module has had (previously, editing only happened inline from the list page). It shows a header (photo, name, contact info, tags, status), quick actions (Time off, a History dialog backed by `getEmployeeStatusHistory`), and five tabs: Work (department, job title, hire date, branch, manager, plus an organization chart widget), Resume (a manually-curated list of experience/education/internal-move entries, see below), Personal (contact fields, notes), Payroll (`payrollCompensation` and the 5 most recent `payslips`, both already modeled on `HrEmployee` and now surfaced for the first time), and Settings (the linked platform `User` account, if any).

## Resume

`HrResumeEntry` (`title`, `type`: `EXPERIENCE`/`EDUCATION`/`INTERNAL`, `dateStart`, `dateEnd?`, `description?`) is a manually-curated, employee-scoped log shaped like the existing `HrEmployeeStatusHistory` — an append-only-in-spirit list, but user-editable since it's a resume, not an audit trail. CRUD (`createResumeEntry`/`updateResumeEntry`/`deleteResumeEntry` in `src/modules/hr/service.ts`) is exposed on the Resume tab via `saveResumeEntry`/`removeResumeEntry` (`src/app/app/hr/employees/[employeeId]/actions.ts`), gated the same as the rest of employee editing (`hr.employees.edit`/`hr.employees.manage`).

## Organization chart

Built entirely on the existing `HrEmployee.managerId` self-relation, no schema addition. The profile page's own chart widget shows just the immediate manager and direct-report count; `getOrgChartTree()` (`src/modules/hr/service.ts`) walks up to the top-most ancestor with no manager and returns the full nested tree beneath it, guarded against a manager-reference cycle with a visited set (defensive: normal edits can't create one, but the query doesn't assume that).

The "full chart" page (`/app/hr/employees/[employeeId]/org-chart`) renders that tree as a real photo-card-and-connector-line chart (`org-chart-node.tsx`, a client component for per-node expand/collapse — the first two levels auto-expand): each node is a card (photo, name, job title), connected to its children by hand-built flexbox + `<div>` border lines, not a CSS `:first-child`/`:last-child` trick or a charting dependency (none exists in this codebase, and none is justified at the realistic scale here — a few dozen employees, 2-4 reporting levels). A child's horizontal connector position is computed directly from its index among equal-width flex siblings (`(i + 0.5) / n`), which is more robust to asymmetric subtrees than the classic CSS-pseudo-selector org-chart pattern. `PersonAvatar` (photo, or an initial on a colored circle) is shared between the profile page and the chart via `src/app/app/hr/employees/person-avatar.tsx`.

## Termination and offboarding

`HrTerminationRequest` drives a full maker-checker approval workflow (`initiateTermination`, `reviewTermination`, `applyApprovedTermination`, `cancelTermination`, `reinstateEmployee` in `src/modules/hr/service.ts`), with a fixed, hardcoded offboarding checklist (`OFFBOARDING_TASKS`) recorded per termination as `HrOffboardingTask` rows. This workflow is unrelated to, and unaffected by, the Launch Plan system described below.

## Launch Plan (onboarding/offboarding automation)

A standalone, manually-triggered checklist generator — deliberately independent of the termination maker-checker workflow above, not a replacement for it (Odoo's own "Launch Plan" is the same: a checklist tool with no approval chain). If both a termination request and a launched offboarding plan exist for the same employee at once, they show as distinct sections in the UI ("Termination Checklist" vs. the profile's "Pending activities" list) rather than being merged.

**Schema**: `HrPlanTemplate` (organization-configured, `kind` ONBOARDING/OFFBOARDING) has ordered `HrPlanTemplateActivity` rows (title, `activityType` TODO/EMAIL/CALL/MEETING/DOCUMENT, `dueDateOffsetDays` relative to a target date, `ownerRule`). Launching a template for an employee creates an `HrPlanInstance` with concrete `HrPlanActivity` rows (computed `dueDate`, a resolved `ownerId` or `null`, `status` PENDING/DONE).

**Owner-rule resolution** (`resolvePlanOwner()` in `src/modules/hr/service.ts`, run at launch time by `launchPlan()`): `EMPLOYEE` → the employee's own linked `userId`; `MANAGER` → their manager's linked `userId`; `HR_MANAGER` → the earliest active `OrganizationMember` whose role grants `hr.employees.manage` (the same permission-based lookup pattern Fleet already uses for role resolution, not a new mechanism); `UNASSIGNED` → always `null`. Any rule that can't resolve to someone with a linked platform account (no manager, no HR-permission holder, employee has no account) resolves to `null` and is surfaced as an explicit "no user to assign" warning in the launch preview and on the profile's Pending activities list — never guessed or silently dropped, matching Odoo's own behavior.

**No auto-seeded default templates.** Organizations configure their own via HR Settings → "Onboarding & offboarding plans" (`src/app/app/hr/settings/{page,actions,plan-template-form}.tsx`), gated on a new `hr.onboarding.manage` permission (separate from `hr.employees.manage`, since template configuration and plan launching are a distinct capability).

**Launching a plan**: the "Launch plan" button on an employee's profile page opens `launch-plan-dialog.tsx` (kind toggle, target date, template picker). A "Preview" step calls `previewLaunchPlan()` — a Server Action invoked via `startTransition`, the same RPC pattern already used for `createPosQuickItem`/`completeSale`, not a client-side fetch layer — to compute and display the resolved activities (including any "no user" warnings) before the user commits with "Schedule" (`launchEmployeePlan()`, which actually creates the `HrPlanInstance`). Pending activities across all of an employee's plan instances are listed on their profile with a "Mark done" action (`completePlanActivity()`/`markPlanActivityDone()`).

## Create User

An employee with no linked platform account (`HrEmployee.userId` is `null`) and a work email on file gets a "Create user" button on the profile's Settings tab. `createUserForEmployee()` (`src/app/app/hr/employees/[employeeId]/actions.ts`) is a thin employee-specific wrapper around the exact same membership-creation transaction `inviteMember()` (`src/app/app/(overview)/administration/actions.ts`) already establishes for the "invite a new org member" flow — upsert `User`, check seat limits, upsert `OrganizationMember`, send the invitation email — with one addition: it also sets `HrEmployee.userId` to the created user's id inside the same transaction. An employee with no email on file is told to add one first, rather than the button silently doing nothing.
