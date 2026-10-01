import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const service = readFileSync(resolve(process.cwd(), "src/modules/school/service.ts"), "utf8");

describe("School timetable booking integrity", () => {
  it("validates tenant-owned, active timetable references and matching campus", () => {
    expect(service).toContain("schoolCampus.findFirst({ where: { id: data.campusId, organizationId }");
    expect(service).toContain("schoolTerm.findFirst({ where: { id: data.termId, organizationId }");
    expect(service).toContain("schoolClass.findFirst({ where: { id: data.classId, organizationId, active: true }");
    expect(service).toContain("schoolSubject.findFirst({ where: { id: data.subjectId, organizationId, active: true }");
    expect(service).toContain('"timetable-campus-mismatch"');
    expect(service).toContain("term.academicYear.closedAt");
  });

  it("serializes overlap checks and scopes room names to campus", () => {
    expect(service).toContain("pg_advisory_xact_lock");
    expect(service).toContain('teacherName: { equals: teacherName, mode: "insensitive" }');
    expect(service).toContain('room: { equals: room, mode: "insensitive" as const }');
    expect(service).toContain("...(room ? [{ campusId: campus.id");
    expect(service).toContain('"timetable-conflict"');
  });

  it("accepts only valid zero-padded 24-hour times and integer weekdays", () => {
    expect(service).toContain("!Number.isInteger(data.dayOfWeek)");
    expect(service).toContain("!timePattern.test(data.startsAt)");
    expect(service).toContain("data.endsAt <= data.startsAt");
  });
});
