import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { PERMISSIONS, ROLE_PERMISSIONS } from "../prisma/seed-data";

const root = process.cwd();
const page = readFileSync(resolve(root, "src/app/app/school/staff/page.tsx"), "utf8");
const actions = readFileSync(resolve(root, "src/app/app/school/staff/actions.ts"), "utf8");

describe("School staff management", () => {
  it("gives only the School Administrator the dedicated staff-management permission", () => {
    expect(ROLE_PERMISSIONS["School Administrator"]).toContain(PERMISSIONS.SCHOOL_STAFF_MANAGE);
    expect(ROLE_PERMISSIONS.Teacher).not.toContain(PERMISSIONS.SCHOOL_STAFF_MANAGE);
    expect(ROLE_PERMISSIONS["Admissions Officer"]).not.toContain(PERMISSIONS.SCHOOL_STAFF_MANAGE);
  });

  it("keeps staff writes tenant scoped and School-role restricted", () => {
    expect(actions).toContain('requireModuleAccess("school")');
    expect(actions).toContain("PERMISSIONS.SCHOOL_STAFF_MANAGE");
    expect(actions).toContain("organizationId: tenant.organizationId");
    expect(actions).toContain("SCHOOL_STAFF_ROLE_NAMES");
    expect(actions).toContain("assertRoleHasAvailableSeats");
    expect(actions).toContain("ensureHrEmployeeForUser");
  });

  it("exposes invitation, role, status, and class-assignment context", () => {
    expect(page).toContain("Send staff invitation");
    expect(page).toContain("updateSchoolStaffAction");
    expect(page).toContain("Assigned classes");
    expect(page).toContain("SUSPENDED");
  });
});
