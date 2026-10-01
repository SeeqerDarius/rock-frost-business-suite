import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { PERMISSIONS, ROLE_PERMISSIONS } from "../prisma/seed-data";

const root = process.cwd();
const actions = readFileSync(resolve(root, "src/app/app/school/actions.ts"), "utf8");
const page = readFileSync(resolve(root, "src/app/app/school/attendance/page.tsx"), "utf8");
const service = readFileSync(resolve(root, "src/modules/school/service.ts"), "utf8");
const schema = readFileSync(resolve(root, "prisma/schema.prisma"), "utf8");

describe("School published attendance workflow", () => {
  it("grants publication to school leadership but not class-entry teachers", () => {
    expect(ROLE_PERMISSIONS["School Administrator"]).toContain(PERMISSIONS.SCHOOL_ATTENDANCE_PUBLISH);
    expect(ROLE_PERMISSIONS["Academic Head"]).toContain(PERMISSIONS.SCHOOL_ATTENDANCE_PUBLISH);
    expect(ROLE_PERMISSIONS.Teacher).not.toContain(PERMISSIONS.SCHOOL_ATTENDANCE_PUBLISH);
  });

  it("authorizes publication separately and preserves the selected register after submission", () => {
    expect(actions).toContain("auth(PERMISSIONS.SCHOOL_ATTENDANCE_PUBLISH, path)");
    expect(actions).toContain("publishSchoolAttendanceRegister");
    expect(actions).toContain('termId: p.data.termId, classId: p.data.classId, date: clean(f.get("date"))');
    expect(page).toContain("publishAttendanceRegisterAction");
    expect(page).toContain("revision history");
  });

  it("requires complete registers and records an actor-attributed revision for published changes", () => {
    expect(service).toContain("FOR UPDATE");
    expect(service).toContain("attendance-register-incomplete");
    expect(service).toContain("correction-reason-required");
    expect(service).toContain("schoolAttendanceRevision.create");
    expect(schema).toContain("model SchoolAttendanceRevision {");
    expect(schema).toContain("publishedAt");
  });
});
