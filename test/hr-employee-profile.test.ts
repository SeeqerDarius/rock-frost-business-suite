import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const departmentsPage = readFileSync("src/app/app/hr/departments/page.tsx", "utf8");
const employeesPage = readFileSync("src/app/app/hr/employees/page.tsx", "utf8");
const navigation = readFileSync("src/modules/hr/navigation.tsx", "utf8");
const profilePage = readFileSync("src/app/app/hr/employees/[employeeId]/page.tsx", "utf8");
const orgChartPage = readFileSync("src/app/app/hr/employees/[employeeId]/org-chart/page.tsx", "utf8");
const hrService = readFileSync("src/modules/hr/service.ts", "utf8");

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
