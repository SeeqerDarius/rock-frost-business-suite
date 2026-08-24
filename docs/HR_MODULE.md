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

`/app/hr/employees/[employeeId]` is the first individual employee detail view this module has had (previously, editing only happened inline from the list page). It shows a header (photo, name, contact info, tags, status), quick actions (Time off, a History dialog backed by `getEmployeeStatusHistory`), and four tabs: Work (department, job title, hire date, branch, manager, plus an organization chart widget), Personal (contact fields, notes), Payroll (`payrollCompensation` and the 5 most recent `payslips`, both already modeled on `HrEmployee` and now surfaced for the first time), and Settings (the linked platform `User` account, if any).

There is deliberately no Resume tab: it would be Odoo's work-history timeline, and there is no data model backing that in this codebase. Fabricating placeholder content for it would misrepresent what the page actually knows.

## Organization chart

Built entirely on the existing `HrEmployee.managerId` self-relation, no schema addition. The profile page's own chart widget shows just the immediate manager and direct-report count; `getOrgChartTree()` (`src/modules/hr/service.ts`) walks up to the top-most ancestor with no manager and renders every descendant beneath it as a recursive indented tree at `/app/hr/employees/[employeeId]/org-chart`, guarded against a manager-reference cycle with a visited set (defensive: normal edits can't create one, but the query doesn't assume that).

## Termination and offboarding

`HrTerminationRequest` drives a full maker-checker approval workflow (`initiateTermination`, `reviewTermination`, `applyApprovedTermination`, `cancelTermination`, `reinstateEmployee` in `src/modules/hr/service.ts`), with a fixed, hardcoded offboarding checklist (`OFFBOARDING_TASKS`) recorded per termination as `HrOffboardingTask` rows. This workflow is unrelated to, and unaffected by, the Launch Plan system described below.
