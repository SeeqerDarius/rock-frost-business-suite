import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const departmentsPage = readFileSync("src/app/app/hr/departments/page.tsx", "utf8");
const employeesPage = readFileSync("src/app/app/hr/employees/page.tsx", "utf8");
const navigation = readFileSync("src/modules/hr/navigation.tsx", "utf8");
const profilePage = readFileSync("src/app/app/hr/employees/[employeeId]/page.tsx", "utf8");
const orgChartPage = readFileSync("src/app/app/hr/employees/[employeeId]/org-chart/page.tsx", "utf8");
const orgChartNode = readFileSync("src/app/app/hr/employees/[employeeId]/org-chart/org-chart-node.tsx", "utf8");
const personAvatar = readFileSync("src/app/app/hr/employees/person-avatar.tsx", "utf8");
const hrService = readFileSync("src/modules/hr/service.ts", "utf8");
const settingsPage = readFileSync("src/app/app/hr/settings/page.tsx", "utf8");
const settingsActions = readFileSync("src/app/app/hr/settings/actions.ts", "utf8");
const employeeActions = readFileSync("src/app/app/hr/employees/[employeeId]/actions.ts", "utf8");
const launchPlanDialog = readFileSync("src/app/app/hr/employees/[employeeId]/launch-plan-dialog.tsx", "utf8");
const permissions = readFileSync("src/lib/auth/permissions.ts", "utf8");
const directoryPage = readFileSync("src/app/app/hr/directory/page.tsx", "utf8");
const configurationPage = readFileSync("src/app/app/hr/configuration/page.tsx", "utf8");
const configurationActions = readFileSync("src/app/app/hr/configuration/actions.ts", "utf8");
const namedLookupSection = readFileSync("src/app/app/hr/configuration/named-lookup-section.tsx", "utf8");
const reportsPage = readFileSync("src/app/app/hr/reports/page.tsx", "utf8");
const employeeFields = readFileSync("src/app/app/hr/employees/employee-fields.tsx", "utf8");

describe("HR Skills subsystem", () => {
  it("no stored progress percentage - the schema keeps only level, UI derives progress", () => {
    expect(hrService).toContain("level: number");
    expect(hrService).not.toContain("levelProgress");
  });

  it("Configuration lives as a tab on HR Settings, managing Skill Types and Skills together, gated on hr.settings.manage", () => {
    expect(settingsPage).toContain('await requireModuleAccess("hr")');
    expect(settingsPage).toContain("PERMISSIONS.HR_SETTINGS_MANAGE");
    expect(settingsPage).toContain("listSkillTypes");
    expect(settingsPage).toContain('<TabsTrigger value="configuration">Configuration</TabsTrigger>');
    expect(configurationActions).toContain("export async function addSkillType");
    expect(configurationActions).toContain("export async function addSkill");
    expect(navigation).not.toContain('href: "/app/hr/configuration"');
  });

  it("the old /app/hr/configuration URL redirects into HR Settings rather than 404ing", () => {
    expect(configurationPage).toContain('await requireModuleAccess("hr")');
    expect(configurationPage).toContain('redirect("/app/hr/settings")');
  });

  it("employee skill assignment lives on the profile's Work tab, not a dedicated Skills tab", () => {
    expect(profilePage).toContain("listEmployeeSkills");
    expect(profilePage).toContain("saveEmployeeSkill");
    expect(profilePage).not.toContain('<TabsTrigger value="skills"');
  });

  it("Skills Inventory report aggregates employee count and average level per skill", () => {
    expect(reportsPage).toContain("getSkillsInventory");
    expect(reportsPage).toContain("Skills inventory");
  });
});

describe("HR Configuration: remaining lookups and Job Position wiring", () => {
  it("Configuration tab adds all 7 remaining lookups, built on the shared NamedLookupSection component", () => {
    for (const listFn of ["listEmployeeTypes", "listWorkLocations", "listDepartureReasons", "listWorkingSchedules", "listTimeTypes", "listJobPositions", "listContractTemplates"]) {
      expect(settingsPage).toContain(listFn);
    }
    expect(settingsPage).toContain("NamedLookupSection");
    expect(settingsPage.match(/<NamedLookupSection/g)?.length).toBe(7);
  });

  it("Configuration actions expose add/remove for all 7 remaining lookups", () => {
    for (const name of ["EmployeeType", "WorkLocation", "DepartureReason", "WorkingSchedule", "TimeType", "JobPosition", "ContractTemplate"]) {
      expect(configurationActions).toContain(`export async function add${name}`);
      expect(configurationActions).toContain(`export async function remove${name}`);
    }
  });

  it("service layer ships real CRUD for the lookups without deeper logic (no calendar engine, no document generation)", () => {
    expect(hrService).toContain("export function listWorkingSchedules");
    expect(hrService).toContain("export function listContractTemplates");
    expect(hrService).not.toContain("generateContract");
  });

  it("NamedLookupSection renders a name list, an inline add form, and a delete button per row", () => {
    expect(namedLookupSection).toContain("addAction");
    expect(namedLookupSection).toContain("removeAction");
    expect(namedLookupSection).toContain('name="name"');
  });

  it("Work Location lookup carries a locationType (Office/Remote/Hybrid), the one lookup with an extra field", () => {
    expect(settingsPage).toContain("WORK_LOCATION_TYPE_LABELS");
    expect(settingsPage).toContain("extraField");
  });

  it("Job Position seeds a creatable combobox on the employee jobTitle field, which stays free-text", () => {
    expect(employeeFields).toContain("jobPositionNames");
    expect(employeeFields).toContain("<datalist");
    expect(employeeFields).toContain('name="jobTitle"');
  });
});

describe("HR Directory page", () => {
  it("is HR-gated, same access model as Employees, not opened company-wide", () => {
    expect(directoryPage).toContain('await requireModuleAccess("hr")');
    expect(navigation).toContain('href: "/app/hr/directory"');
  });

  it("is a read-only contact lookup: photo, name, job title, email, phone, no status or tag badges", () => {
    expect(directoryPage).toContain("employee.jobTitle");
    expect(directoryPage).toContain("employee.email");
    expect(directoryPage).toContain("employee.phone");
    expect(directoryPage).not.toContain("STATUS_BADGE");
    expect(directoryPage).not.toContain("employee.tags");
  });

  it("filters by department via a sidebar list built on the existing departmentCounts grouping", () => {
    expect(directoryPage).toContain("getHrSummary");
    expect(directoryPage).toContain("departmentCounts");
    expect(directoryPage).toContain("Promise<{ department?: string }>");
  });
});

describe("HR Departments and Employees kanban views", () => {
  it("adds a guarded Departments page grouping employees by department, linked from HR navigation", () => {
    expect(departmentsPage).toContain('await requireModuleAccess("hr")');
    expect(departmentsPage).toContain("getHrSummary");
    expect(departmentsPage).toContain("departmentCounts");
    expect(navigation).toContain('href: "/app/hr/departments"');
  });

  it("Employees page supports a department filter and defaults to the kanban view, with table as the opt-in alternative", () => {
    expect(employeesPage).toContain("department?: string; view?: string");
    expect(employeesPage).toContain('view !== "table"');
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

  it("presents Work, Resume, Personal, Payroll, and Settings tabs", () => {
    expect(profilePage).toContain('<TabsTrigger value="work">Work</TabsTrigger>');
    expect(profilePage).toContain('<TabsTrigger value="resume">Resume</TabsTrigger>');
    expect(profilePage).toContain('<TabsTrigger value="personal">Personal</TabsTrigger>');
    expect(profilePage).toContain('<TabsTrigger value="payroll">Payroll</TabsTrigger>');
    expect(profilePage).toContain('<TabsTrigger value="settings">Settings</TabsTrigger>');
  });

  it("Resume tab supports real CRUD (Odoo's own experience/education/internal-move entries), not a placeholder", () => {
    expect(profilePage).toContain("employee.resumeEntries");
    expect(profilePage).toContain("saveResumeEntry");
    expect(profilePage).toContain("removeResumeEntry");
    expect(employeeActions).toContain("export async function saveResumeEntry");
    expect(employeeActions).toContain("export async function removeResumeEntry");
    expect(hrService).toContain("export async function createResumeEntry");
    expect(hrService).toContain("export async function updateResumeEntry");
    expect(hrService).toContain("export async function deleteResumeEntry");
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

  it("renders a real photo-card-and-connector-line tree with expand/collapse, not a plain indented list", () => {
    expect(orgChartPage).toContain("OrgChartNode");
    expect(orgChartNode).toContain('"use client"');
    expect(orgChartNode).toContain("useState");
    expect(orgChartNode).toContain("PersonAvatar");
    expect(orgChartNode).not.toContain("<ul");
  });

  it("computes each child's horizontal connector position from its index among equal-width siblings", () => {
    expect(orgChartNode).toContain("50 / node.children.length");
  });

  it("PersonAvatar is shared between the profile page and the org chart, not duplicated", () => {
    expect(personAvatar).toContain("export function PersonAvatar");
    expect(orgChartNode).toContain('from "../../person-avatar"');
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
