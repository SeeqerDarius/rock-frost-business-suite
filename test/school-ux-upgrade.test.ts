import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const read = (file: string) => fs.readFileSync(path.join(process.cwd(), file), "utf8");

describe("School UX upgrade", () => {
  it("keeps the tabbed people and academics navigation with an explicit profile action", () => {
    const students = read("src/app/app/school/students/page.tsx");
    const classes = read("src/app/app/school/classes/page.tsx");
    expect(students).toContain('<TabsTrigger value="students">Students</TabsTrigger>');
    expect(students).toContain('<TabsTrigger value="guardians">Guardians</TabsTrigger>');
    expect(students).toContain("View profile");
    expect(classes).toContain('<TabsTrigger value="classes">Classes</TabsTrigger>');
    expect(classes).toContain('<TabsTrigger value="subjects">Subjects</TabsTrigger>');
  });

  it("uses one-tap roster controls and full report states", () => {
    const roster = read("src/app/app/school/attendance/attendance-roster-form.tsx");
    const reports = read("src/app/app/school/reports/page.tsx");
    expect(roster).toContain("Mark all Present");
    expect(roster).toContain("aria-pressed={selected}");
    expect(roster).toContain("Unsaved attendance changes");
    expect(reports).toContain("PeriodicTrendChart");
    expect(reports).toContain("Period comparison");
    expect(read("src/app/app/school/reports/loading.tsx")).toContain("Loading School reports");
    expect(read("src/app/app/school/reports/error.tsx")).toContain("School reports could not load");
  });
});
