import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { cleanupTestOrg, createTestOrg, type TestOrg } from "../setup/fixtures";
import { testDb } from "../setup/db";

/**
 * `listSchoolStudentChoices()` answers two different questions, and the
 * pages that call it need both kept apart.
 *
 * `total` is how many students matched the search. `totalWithoutQuery` is
 * whether this school has any students at all. Conflating them is not
 * cosmetic: Fees used the filtered count for its "Admit a student"
 * prerequisite, so a bursar searching for a name nobody has was told to go
 * and admit a student before using the page, and Library and Transport used
 * it to decide whether to offer "Issue loan" and "Assign to route", so an
 * unmatched search silently removed the action the page exists for.
 *
 * Real rows, because the distinction only appears once a query actually
 * filters something out.
 */

let org: TestOrg;
let campusId: string;

beforeAll(async () => {
  org = await createTestOrg("student-choice-totals");
  const { createSchoolCampus, createSchoolStudent } = await import("@/modules/school/service");
  const campus = await createSchoolCampus(org.organizationId, { code: "MAIN", name: "Main Campus" });
  campusId = campus.id;
  for (const [firstName, lastName] of [["Ama", "Mensah"], ["Kofi", "Owusu"], ["Esi", "Boateng"]]) {
    await createSchoolStudent(org.organizationId, { campusId, firstName, lastName });
  }
});

afterAll(async () => cleanupTestOrg(org));

describe("listSchoolStudentChoices separates 'matched the search' from 'has any students'", () => {
  it("reports both totals as the same number when no search is active", async () => {
    const { listSchoolStudentChoices } = await import("@/modules/school/service");
    const choices = await listSchoolStudentChoices(org.organizationId);
    expect(choices.total).toBe(3);
    expect(choices.totalWithoutQuery).toBe(3);
  });

  it("keeps totalWithoutQuery at the school's real size when a search narrows the list", async () => {
    const { listSchoolStudentChoices } = await import("@/modules/school/service");
    const choices = await listSchoolStudentChoices(org.organizationId, { query: "Mensah" });
    expect(choices.total).toBe(1);
    expect(choices.totalWithoutQuery).toBe(3);
  });

  it("still reports the school's size when the search matches nobody", async () => {
    // The case that produced the bug: a page reading `total` here concluded
    // the school had no students and demanded one be admitted.
    const { listSchoolStudentChoices } = await import("@/modules/school/service");
    const choices = await listSchoolStudentChoices(org.organizationId, { query: "Nobodyhasthisname" });
    expect(choices.total).toBe(0);
    expect(choices.rows).toHaveLength(0);
    expect(choices.totalWithoutQuery).toBe(3);
  });

  it("counts only active students under activeOnly, in both totals", async () => {
    const { listSchoolStudentChoices, createSchoolStudent } = await import("@/modules/school/service");
    const graduating = await createSchoolStudent(org.organizationId, { campusId, firstName: "Yaa", lastName: "Darko" });
    await testDb.schoolStudent.update({ where: { id: graduating.id }, data: { status: "GRADUATED" } });

    const all = await listSchoolStudentChoices(org.organizationId, { activeOnly: true });
    expect(all.totalWithoutQuery).toBe(3);

    // A search that matches only the graduated student finds nobody, and the
    // school's active size is still reported correctly beside it.
    const searched = await listSchoolStudentChoices(org.organizationId, { query: "Darko", activeOnly: true });
    expect(searched.total).toBe(0);
    expect(searched.totalWithoutQuery).toBe(3);
  });
});
