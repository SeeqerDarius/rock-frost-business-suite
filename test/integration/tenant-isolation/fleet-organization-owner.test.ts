import { describe, it, expect, afterAll } from "vitest";
import * as fleet from "@/modules/fleet/service";
import { createTestOrg, cleanupTestOrg, type TestOrg } from "../setup/fixtures";
import { testDb } from "../setup/db";

/**
 * Real-Postgres coverage for the org-as-owner migration
 * (20260828063600_fleet_owner_organization_flag): FleetOwner.isOrganizationOwner
 * and ensureOrganizationFleetOwner() (src/modules/fleet/service.ts).
 */
describe("ensureOrganizationFleetOwner against real Postgres", () => {
  let org: TestOrg;

  afterAll(async () => {
    if (org) await cleanupTestOrg(org);
  });

  it("lazily creates one FleetOwner row named after the organization, flagged isOrganizationOwner", async () => {
    org = await createTestOrg("org-as-owner");

    const owners = await fleet.listFleetOwners(org.organizationId);
    const orgOwner = owners.find((o) => o.isOrganizationOwner);
    expect(orgOwner).toBeDefined();
    expect(orgOwner?.name).toBe(`Integration Test Org ${org.tenantCode.replace("itest-", "")}`);
    expect(orgOwner?.userId).toBeNull();
  });

  it("is idempotent - a second call does not create a duplicate row", async () => {
    const before = await fleet.listFleetOwners(org.organizationId);
    const before_orgOwnerCount = before.filter((o) => o.isOrganizationOwner).length;

    const after = await fleet.listFleetOwners(org.organizationId);
    const after_orgOwnerCount = after.filter((o) => o.isOrganizationOwner).length;

    expect(before_orgOwnerCount).toBe(1);
    expect(after_orgOwnerCount).toBe(1);
  });

  it("stays in sync when the organization is renamed", async () => {
    await testDb.organization.update({ where: { id: org.organizationId }, data: { name: "Renamed Test Org" } });

    const owners = await fleet.listFleetOwners(org.organizationId);
    const orgOwner = owners.find((o) => o.isOrganizationOwner);
    expect(orgOwner?.name).toBe("Renamed Test Org");
  });

  it("is selectable as a vehicle's owner", async () => {
    const owners = await fleet.listFleetOwners(org.organizationId);
    const orgOwner = owners.find((o) => o.isOrganizationOwner);
    expect(orgOwner).toBeDefined();

    const vehicle = await fleet.createFleetVehicle(org.organizationId, {
      assetTag: "ORG-OWNED-1",
      plateNumber: "ORG-OWNED-1",
      ownerId: orgOwner!.id,
    });
    expect(vehicle.ownerId).toBe(orgOwner!.id);
  });
});
