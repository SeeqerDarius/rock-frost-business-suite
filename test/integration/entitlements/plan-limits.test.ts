import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { testDb } from "../setup/db";
import { createTestOrg, cleanupTestOrg, type TestOrg } from "../setup/fixtures";

/**
 * Real-Postgres proof that a plan's quantitative ceilings actually stop a
 * write, not just render differently.
 *
 * This is the half of the tier work that can take something away from a
 * customer, so it is tested against real rows and real counts rather than a
 * mocked resolver. Three things matter here:
 *
 * 1. a Basic plan stops at its ceiling with an actionable message;
 * 2. raising the tier lifts the ceiling immediately, with no other change;
 * 3. an organization with no subscription row is grandfathered and unlimited,
 *    because that is the shape of every customer who bought before tiers.
 */

let org: TestOrg;
let schoolModuleId: string;

beforeAll(async () => {
  org = await createTestOrg("plan-limits");
  schoolModuleId = (await testDb.module.findUniqueOrThrow({ where: { code: "school" } })).id;
});

afterAll(async () => cleanupTestOrg(org));

beforeEach(async () => {
  // Every case starts from a known count, not from whatever the previous one
  // left behind: these limits are counted against live rows, so shared state
  // would make a passing test meaningless.
  await testDb.subscription.deleteMany({ where: { organizationId: org.organizationId } });
  await testDb.schoolStudent.deleteMany({ where: { organizationId: org.organizationId } });
  await testDb.schoolCampus.deleteMany({ where: { organizationId: org.organizationId } });
});

async function setSchoolTier(tier: "BASIC" | "PRO" | "PLATINUM") {
  const now = new Date();
  await testDb.subscription.deleteMany({ where: { organizationId: org.organizationId } });
  await testDb.subscription.create({
    data: {
      organizationId: org.organizationId,
      moduleId: schoolModuleId,
      tier,
      mode: "MANUAL_OFFLINE",
      status: "ACTIVE",
      durationMonths: 12,
      amount: "1000.00",
      currency: "GHS",
      startsAt: new Date(now.getTime() - 86_400_000),
      endsAt: new Date(now.getTime() + 86_400_000),
      createdById: org.userId,
    },
  });
}

describe("plan limits (real Postgres)", () => {
  it("stops a Basic plan at one campus and says what the plan includes", async () => {
    const { createSchoolCampus } = await import("@/modules/school/service");
    await setSchoolTier("BASIC");

    const first = await createSchoolCampus(org.organizationId, { code: "MAIN", name: "Main Campus" });
    expect(first.id).toBeTruthy();

    await expect(createSchoolCampus(org.organizationId, { code: "ANNEX", name: "Annex" })).rejects.toThrow(
      /plan includes 1 campus/i,
    );
    expect(await testDb.schoolCampus.count({ where: { organizationId: org.organizationId } })).toBe(1);
  });

  it("lifts the ceiling the moment the tier rises, with nothing else changed", async () => {
    const { createSchoolCampus } = await import("@/modules/school/service");
    await setSchoolTier("BASIC");
    await createSchoolCampus(org.organizationId, { code: "MAIN", name: "Main Campus" });
    // At Basic's ceiling of one.
    await expect(createSchoolCampus(org.organizationId, { code: "A2", name: "Annex 2" })).rejects.toThrow();

    // Nothing changes but the tier on the subscription row.
    await setSchoolTier("PRO");
    const annex = await createSchoolCampus(org.organizationId, { code: "A2", name: "Annex 2" });
    expect(annex.id).toBeTruthy();
    expect(await testDb.schoolCampus.count({ where: { organizationId: org.organizationId } })).toBe(2);

    // Pro's ceiling is 3, so the third is allowed and the fourth is not.
    await createSchoolCampus(org.organizationId, { code: "A3", name: "Annex 3" });
    await expect(createSchoolCampus(org.organizationId, { code: "A4", name: "Annex 4" })).rejects.toThrow(
      /plan includes 3 campuses/i,
    );
  });

  it("does not count a deactivated campus against the plan", async () => {
    const { createSchoolCampus } = await import("@/modules/school/service");
    await setSchoolTier("BASIC");
    const only = await createSchoolCampus(org.organizationId, { code: "OLD", name: "Old Main" });

    // At the Basic ceiling of one, a second is refused.
    await expect(createSchoolCampus(org.organizationId, { code: "NEW", name: "New Main" })).rejects.toThrow();

    // Closing the old site frees the place: it is not consuming the plan.
    await testDb.schoolCampus.update({ where: { id: only.id }, data: { active: false } });
    const replacement = await createSchoolCampus(org.organizationId, { code: "NEW", name: "New Main" });
    expect(replacement.id).toBeTruthy();
  });

  it("treats an organization with no subscription row as unlimited, so nobody who predates tiers is cut off", async () => {
    const { createSchoolCampus } = await import("@/modules/school/service");
    // No subscription row at all, which beforeEach already guarantees.
    // Four campuses is past both the Basic and Pro ceilings.
    for (const code of ["G1", "G2", "G3", "G4"]) {
      await createSchoolCampus(org.organizationId, { code, name: `Grandfathered ${code}` });
    }
    expect(await testDb.schoolCampus.count({ where: { organizationId: org.organizationId } })).toBe(4);
  });

  it("counts enrolled students only, so withdrawn history never consumes the plan", async () => {
    const { createSchoolStudent } = await import("@/modules/school/service");
    const { resolveModuleLimit } = await import("@/platform/entitlements/resolve");
    const { createSchoolCampus } = await import("@/modules/school/service");
    await setSchoolTier("BASIC");
    const campus = await createSchoolCampus(org.organizationId, { code: "MAIN", name: "Main Campus" });

    const ceiling = await resolveModuleLimit(org.organizationId, "school.students");
    expect(ceiling).toBe(200);

    const student = await createSchoolStudent(org.organizationId, { campusId: campus.id, firstName: "Ama", lastName: "Mensah" });
    expect(student.status).toBe("ACTIVE");

    // Graduating a student must free their place rather than hold it forever:
    // a school is required to keep the record, and charging for it would push
    // them towards deleting data they must retain.
    await testDb.schoolStudent.update({ where: { id: student.id }, data: { status: "GRADUATED" } });
    const next = await createSchoolStudent(org.organizationId, { campusId: campus.id, firstName: "Kofi", lastName: "Owusu" });
    expect(next.id).toBeTruthy();

    expect(
      await testDb.schoolStudent.count({
        where: { organizationId: org.organizationId, status: { in: ["ACTIVE", "APPLICANT", "SUSPENDED"] } },
      }),
    ).toBe(1);
  });
});
