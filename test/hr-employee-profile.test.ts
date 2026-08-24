import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const departmentsPage = readFileSync("src/app/app/hr/departments/page.tsx", "utf8");
const employeesPage = readFileSync("src/app/app/hr/employees/page.tsx", "utf8");
const navigation = readFileSync("src/modules/hr/navigation.tsx", "utf8");

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
});
