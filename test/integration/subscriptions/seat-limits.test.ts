import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { testDb } from "../setup/db";
import { cleanupTestOrg, createTestOrg, type TestOrg } from "../setup/fixtures";
import { assertRoleHasAvailableSeats, getOrganizationSeatUsage, SeatLimitExceededError } from "@/platform/subscriptions/seats";

let org: TestOrg;
let schoolModuleId: string;
let ownerRoleId: string;

beforeAll(async () => {
  org = await createTestOrg("subscription-seats");
  const [school, ownerRole] = await Promise.all([
    testDb.module.findUniqueOrThrow({ where: { code: "school" } }),
    testDb.role.findFirstOrThrow({ where: { organizationId: null, name: "Organization Owner" } }),
  ]);
  schoolModuleId = school.id;
  ownerRoleId = ownerRole.id;
  await testDb.subscription.create({ data: {
    organizationId: org.organizationId,
    moduleId: school.id,
    mode: "MANUAL_OFFLINE",
    status: "ACTIVE",
    durationMonths: 12,
    amount: "1000.00",
    currency: "GHS",
    startsAt: new Date(Date.now() - 60_000),
    endsAt: new Date(Date.now() + 86_400_000),
    seatLimit: 1,
    createdById: org.userId,
  } });
});

afterAll(async () => cleanupTestOrg(org));

describe("module subscription seats (real PostgreSQL)", () => {
  it("counts a multi-module owner against the subscribed School module", async () => {
    await expect(getOrganizationSeatUsage(org.organizationId)).resolves.toEqual([
      expect.objectContaining({ moduleId: schoolModuleId, moduleCode: "school", used: 1, limit: 1 }),
    ]);
  });

  it("rejects another role assignment when the module has no seats", async () => {
    await expect(testDb.$transaction((tx) => assertRoleHasAvailableSeats(tx, org.organizationId, ownerRoleId)))
      .rejects.toBeInstanceOf(SeatLimitExceededError);
  });

  it("allows an in-place role check when the existing membership is excluded", async () => {
    await expect(testDb.$transaction((tx) => assertRoleHasAvailableSeats(tx, org.organizationId, ownerRoleId, org.membershipId)))
      .resolves.toBeUndefined();
  });
});
