import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { ensureHrEmployeeForUser } from "@/modules/hr/service";
import { testDb } from "../setup/db";
import { cleanupTestOrg, createTestOrg, type TestOrg } from "../setup/fixtures";

let org: TestOrg;
const extraUserIds: string[] = [];

async function createActiveMember(roleName: string) {
  const role = await testDb.role.findFirstOrThrow({ where: { organizationId: null, name: roleName } });
  const user = await testDb.user.create({
    data: {
      name: `${roleName} Member`,
      email: `hr-sync-${roleName.toLowerCase().replaceAll(" ", "-")}-${Date.now()}-${Math.random().toString(36).slice(2)}@example.invalid`,
      status: "ACTIVE",
    },
  });
  extraUserIds.push(user.id);
  const membership = await testDb.organizationMember.create({
    data: { organizationId: org.organizationId, userId: user.id, roleId: role.id, status: "ACTIVE", joinedAt: new Date("2026-08-01T00:00:00.000Z") },
  });
  return { user, membership, role };
}

beforeAll(async () => {
  org = await createTestOrg("hr-member-sync");
});

afterAll(async () => {
  await cleanupTestOrg(org);
  await testDb.user.deleteMany({ where: { id: { in: extraUserIds } } });
});

describe("HR membership synchronization (real Postgres)", () => {
  it("creates exactly one active employee for an internal member under concurrent retries", async () => {
    const { user, membership, role } = await createActiveMember("Fleet Manager");
    const results = await Promise.all([
      db.$transaction((tx) => ensureHrEmployeeForUser(tx, org.organizationId, user.id, role.name, { membershipId: membership.id, joinedAt: membership.joinedAt, actorId: org.userId })),
      db.$transaction((tx) => ensureHrEmployeeForUser(tx, org.organizationId, user.id, role.name, { membershipId: membership.id, joinedAt: membership.joinedAt, actorId: org.userId })),
    ]);
    expect(results.every(Boolean)).toBe(true);
    const employees = await testDb.hrEmployee.findMany({ where: { organizationId: org.organizationId, userId: user.id } });
    expect(employees).toHaveLength(1);
    expect(employees[0]).toMatchObject({ status: "ACTIVE", jobTitle: "Fleet Manager", branchId: null });
    expect(await testDb.hrEmployeeStatusHistory.count({ where: { employeeId: employees[0].id } })).toBe(1);
  });

  it("does not create HR employees for Vehicle Owner or Investor roles", async () => {
    const [owner, investor] = await Promise.all([createActiveMember("Vehicle Owner"), createActiveMember("Investor")]);
    await db.$transaction(async (tx) => {
      await ensureHrEmployeeForUser(tx, org.organizationId, owner.user.id, owner.role.name, { membershipId: owner.membership.id });
      await ensureHrEmployeeForUser(tx, org.organizationId, investor.user.id, investor.role.name, { membershipId: investor.membership.id });
    });
    expect(await testDb.hrEmployee.count({ where: { organizationId: org.organizationId, userId: { in: [owner.user.id, investor.user.id] } } })).toBe(0);
  });

  it("does not create an employee when HR is disabled", async () => {
    const member = await createActiveMember("CRM Manager");
    const hrModule = await testDb.module.findUniqueOrThrow({ where: { code: "hr" } });
    await testDb.organizationModule.update({
      where: { organizationId_moduleId: { organizationId: org.organizationId, moduleId: hrModule.id } },
      data: { enabled: false },
    });
    await db.$transaction((tx) => ensureHrEmployeeForUser(tx, org.organizationId, member.user.id, member.role.name, { membershipId: member.membership.id }));
    expect(await testDb.hrEmployee.count({ where: { organizationId: org.organizationId, userId: member.user.id } })).toBe(0);
    await testDb.organizationModule.update({
      where: { organizationId_moduleId: { organizationId: org.organizationId, moduleId: hrModule.id } },
      data: { enabled: true },
    });
  });
});
