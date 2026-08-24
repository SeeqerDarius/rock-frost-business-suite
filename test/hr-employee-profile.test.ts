import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const departmentsPage = readFileSync("src/app/app/hr/departments/page.tsx", "utf8");
const employeesPage = readFileSync("src/app/app/hr/employees/page.tsx", "utf8");
const navigation = readFileSync("src/modules/hr/navigation.tsx", "utf8");
const profilePage = readFileSync("src/app/app/hr/employees/[employeeId]/page.tsx", "utf8");
const orgChartPage = readFileSync("src/app/app/hr/employees/[employeeId]/org-chart/page.tsx", "utf8");
const hrService = readFileSync("src/modules/hr/service.ts", "utf8");
const settingsPage = readFileSync("src/app/app/hr/settings/page.tsx", "utf8");
const settingsActions = readFileSync("src/app/app/hr/settings/actions.ts", "utf8");
const employeeActions = readFileSync("src/app/app/hr/employees/[employeeId]/actions.ts", "utf8");
const launchPlanDialog = readFileSync("src/app/app/hr/employees/[employeeId]/launch-plan-dialog.tsx", "utf8");
const permissions = readFileSync("src/lib/auth/permissions.ts", "utf8");

describe("HR Departments and Employees kanban views", () => {
  it("adds a guarded Departments page grouping employees by department, linked from HR navigation", () => {
    expect(departmentsPage).toContain('await requireModuleAccess("hr")');
    expect(departmentsPage).toContain("getHrSummary");
    expect(departmentsPage).toContain("departmentCounts");
    expect(navigation).toContain('href: "/app/hr/departments"');
  });

  it("Employees page supports a department filter and a kanban view alongside the existing table", () => {
    expect(employeesPage).toContain("department?: string; view?: string");
    expect(employeesPage).toContain('view === "kanban"');
    expect(employeesPage).toContain("isKanban");
    expect(employeesPage).toContain("employee.tags.map");
  });

  it("Employees page links each row to a guarded employee profile page", () => {
    expect(employeesPage).toContain("`/app/hr/employees/${employee.id}`");
  });
});

describe("HR employee profile page", () => {
  it("is guarded and 404s for an unknown or cross-tenant employee id", () => {
    expect(profilePage).toContain('await requireModuleAccess("hr")');
    expect(profilePage).toContain("getEmployeeProfile(tenant.organizationId, employeeId)");
    expect(profilePage).toContain("if (!employee) notFound();");
  });

  it("presents Work, Personal, Payroll, and Settings tabs, but not a Resume tab (no backing data model)", () => {
    expect(profilePage).toContain('<TabsTrigger value="work">Work</TabsTrigger>');
    expect(profilePage).toContain('<TabsTrigger value="personal">Personal</TabsTrigger>');
    expect(profilePage).toContain('<TabsTrigger value="payroll">Payroll</TabsTrigger>');
    expect(profilePage).toContain('<TabsTrigger value="settings">Settings</TabsTrigger>');
    expect(profilePage).not.toContain("Resume");
  });

  it("renders an organization chart widget built on the existing manager/reports relation, with a link to the full chart", () => {
    expect(profilePage).toContain("employee.manager");
    expect(profilePage).toContain("employee.reports.length");
    expect(profilePage).toContain("`/app/hr/employees/${employee.id}/org-chart`");
  });

  it("shows real Payroll data already modeled on HrEmployee rather than a placeholder", () => {
    expect(profilePage).toContain("employee.payrollCompensation");
    expect(profilePage).toContain("employee.payslips");
  });
});

describe("HR full organization chart page", () => {
  it("is guarded and renders the employee's ancestor-to-descendant tree from getOrgChartTree", () => {
    expect(orgChartPage).toContain('await requireModuleAccess("hr")');
    expect(orgChartPage).toContain("getOrgChartTree(tenant.organizationId, employeeId)");
    expect(orgChartPage).toContain("if (!tree) notFound();");
  });

  it("getOrgChartTree guards against a manager cycle with a visited set", () => {
    expect(hrService).toContain("export async function getOrgChartTree");
    expect(hrService).toContain("seen.add(root.id)");
    expect(hrService).toContain("visited.has(child.id)");
  });
});

describe("HR Launch Plan onboarding/offboarding automation", () => {
  it("is gated behind a dedicated hr.onboarding.manage permission, separate from hr.employees.manage", () => {
    expect(permissions).toContain('HR_ONBOARDING_MANAGE: "hr.onboarding.manage"');
  });

  it("HR Settings gets a plan-template CRUD section with no auto-seeded default templates", () => {
    expect(settingsPage).toContain("Onboarding &amp; offboarding plans");
    expect(settingsPage).toContain("listPlanTemplates");
    expect(settingsPage).toContain("No {PLAN_KIND_LABEL[kind].toLowerCase()} templates yet.");
    expect(settingsActions).toContain("export async function savePlanTemplate");
    expect(settingsActions).toContain("export async function removePlanTemplate");
  });

  it("launchPlan resolves each activity's owner rule to a concrete user id or null (never guessed), matching the EMPLOYEE/MANAGER/HR_MANAGER/UNASSIGNED rules", () => {
    expect(hrService).toContain("async function resolvePlanOwner");
    expect(hrService).toContain('rule === "EMPLOYEE"');
    expect(hrService).toContain('rule === "MANAGER"');
    expect(hrService).toContain('rule === "HR_MANAGER"');
    expect(hrService).toContain("PERMISSIONS.HR_EMPLOYEES_MANAGE");
  });

  it("Launch Plan is decoupled from the termination maker-checker workflow, not a replacement for it", () => {
    expect(hrService).toContain("Deliberately independent of HrTerminationRequest/HrOffboardingTask");
  });

  it("the employee-profile actions file previews before committing and only mutates through launchPlan/completePlanActivity", () => {
    expect(employeeActions).toContain("export async function previewLaunchPlan");
    expect(employeeActions).toContain("export async function launchEmployeePlan");
    expect(employeeActions).toContain("export async function markPlanActivityDone");
    expect(employeeActions).toContain("PERMISSIONS.HR_ONBOARDING_MANAGE");
  });

  it("the Launch Plan dialog previews via a Server Action RPC call (startTransition), not a client-side fetch layer", () => {
    expect(launchPlanDialog).toContain("useTransition");
    expect(launchPlanDialog).toContain("previewLaunchPlan(formData)");
    expect(launchPlanDialog).not.toMatch(/\bfetch\(/);
    expect(launchPlanDialog).toContain("No user to assign");
  });

  it("profile page surfaces pending plan activities with a Mark done action", () => {
    expect(profilePage).toContain("listPendingPlanActivities");
    expect(profilePage).toContain("markPlanActivityDone");
    expect(profilePage).toContain("Pending activities");
  });
});

describe("HR Create User button", () => {
  it("reuses inviteMember's exact membership-creation transaction shape rather than new logic", () => {
    expect(employeeActions).toContain("export async function createUserForEmployee");
    expect(employeeActions).toContain("tx.user.upsert");
    expect(employeeActions).toContain("tx.organizationMember.upsert");
    expect(employeeActions).toContain("assertRoleHasAvailableSeats");
    expect(employeeActions).toContain("createInvitation(");
  });

  it("links the created user back to HrEmployee.userId inside the same transaction", () => {
    expect(employeeActions).toContain("tx.hrEmployee.update({ where: { id: employee.id }, data: { userId: user.id } })");
  });

  it("blocks a Super Admin role and an employee with no email or an already-linked account", () => {
    expect(employeeActions).toContain('role.name === "Super Admin"');
    expect(employeeActions).toContain("if (employee.userId) redirect");
    expect(employeeActions).toContain("if (!employee.email) redirect");
  });

  it("profile page only offers Create User once there is no linked account, and needs a work email first", () => {
    expect(profilePage).toContain("createUserForEmployee");
    expect(profilePage).toContain("Add a work email for this employee before creating an account.");
  });
});
