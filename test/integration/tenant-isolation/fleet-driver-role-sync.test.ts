import { describe, it, expect, beforeAll, afterAll } from "vitest";
import * as fleet from "@/modules/fleet/service";
import { testDb } from "../setup/db";
import { createTestOrg, cleanupTestOrg, type TestOrg } from "../setup/fixtures";

/**
 * Real-Postgres proof that assigning the seeded "Driver" system role to an
 * active member results in a linked FleetDriver row — the fix for the
 * reported bug where /app/fleet/drivers stayed empty after a driver was
 * invited/assigned from Administration. Exercises the service functions
 * directly (ensureFleetDriverForUser, listFleetDrivers' backfill) rather
 * than the Server Actions that call them, per this suite's established
 * pattern for logic that needs a real Next.js request context to invoke
 * directly (see administration.test.ts's header comment).
 */

let org: TestOrg;

beforeAll(async () => {
  org = await createTestOrg("fleet-driver-role-sync");
});

afterAll(async () => {
  await cleanupTestOrg(org);
});

describe("Fleet driver role sync (real Postgres)", () => {
  it("ensureFleetDriverForUser creates exactly one linked FleetDriver row, and is idempotent on a second call", async () => {
    const driverUser = await testDb.user.create({
      data: { name: "Test Driver", email: `driver-${org.organizationId}@example.invalid`, status: "ACTIVE" },
    });

    const first = await testDb.$transaction((tx) => fleet.ensureFleetDriverForUser(tx, org.organizationId, driverUser.id));
    expect(first?.userId).toBe(driverUser.id);
    expect(first?.name).toBe("Test Driver");

    const second = await testDb.$transaction((tx) => fleet.ensureFleetDriverForUser(tx, org.organizationId, driverUser.id));
    expect(second?.id).toBe(first?.id);

    const rows = await testDb.fleetDriver.findMany({ where: { organizationId: org.organizationId, userId: driverUser.id } });
    expect(rows).toHaveLength(1);
  });

  it("listFleetDrivers backfills a FleetDriver for an active member holding the seeded Driver role, with no manual step", async () => {
    const driverRole = await testDb.role.findFirst({ where: { organizationId: null, name: "Driver" } });
    expect(driverRole).not.toBeNull();

    const memberUser = await testDb.user.create({
      data: { name: "Backfilled Driver", email: `backfill-${org.organizationId}@example.invalid`, status: "ACTIVE" },
    });
    await testDb.organizationMember.create({
      data: { organizationId: org.organizationId, userId: memberUser.id, roleId: driverRole!.id, status: "ACTIVE", joinedAt: new Date() },
    });

    const drivers = await fleet.listFleetDrivers(org.organizationId);
    expect(drivers.some((d) => d.userId === memberUser.id)).toBe(true);
  });

  it("does not create a FleetDriver for an active member holding a role without driver self-service", async () => {
    // "Organization Owner" is deliberately not used here — it holds
    // ALL_PERMISSIONS (see prisma/seed-data.ts), which legitimately
    // includes fleet.driver.self_service, so an Owner *should* get a
    // FleetDriver row too. "Mechanic" is Fleet-related but has no driver
    // self-service permission, making it the real negative case.
    const mechanicRole = await testDb.role.findFirst({ where: { organizationId: null, name: "Mechanic" } });
    expect(mechanicRole).not.toBeNull();

    const memberUser = await testDb.user.create({
      data: { name: "Non Driver", email: `nondriver-${org.organizationId}@example.invalid`, status: "ACTIVE" },
    });
    await testDb.organizationMember.create({
      data: { organizationId: org.organizationId, userId: memberUser.id, roleId: mechanicRole!.id, status: "ACTIVE", joinedAt: new Date() },
    });

    const drivers = await fleet.listFleetDrivers(org.organizationId);
    expect(drivers.some((d) => d.userId === memberUser.id)).toBe(false);
  });

  it("does not allow one workspace login to be linked to two driver profiles", async () => {
    const user = await testDb.user.create({
      data: { name: "Unique Login Driver", email: `unique-driver-${org.organizationId}@example.invalid`, status: "ACTIVE" },
    });
    await fleet.createFleetDriver(org.organizationId, { name: "First profile", userId: user.id });
    await expect(fleet.createFleetDriver(org.organizationId, { name: "Second profile", userId: user.id }))
      .rejects.toThrow(fleet.FleetDriverLoginConflictError);
  });
});
