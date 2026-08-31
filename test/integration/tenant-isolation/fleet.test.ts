import { describe, it, expect, beforeAll, afterAll } from "vitest";
import * as fleet from "@/modules/fleet/service";
import { createTestOrg, cleanupTestOrg, type TestOrg } from "../setup/fixtures";

/**
 * Real-Postgres equivalent of the mocked IDOR coverage for
 * src/modules/fleet/service.ts (see test/idor-crm-hr-fleet.test.ts for the
 * mocked version). Every foreign-id validation here goes through
 * validateVehicleRefs() (ownerId/assignedDriverId) or requireVehicle()
 * (vehicleId), both of which throw the module's own exported
 * fleet.NotFoundError.
 */

let orgA: TestOrg;
let orgB: TestOrg;

let ownerB: Awaited<ReturnType<typeof fleet.createFleetOwner>>;
let driverB: Awaited<ReturnType<typeof fleet.createFleetDriver>>;
let vehicleB: Awaited<ReturnType<typeof fleet.createFleetVehicle>>;
let vehicleA: Awaited<ReturnType<typeof fleet.createFleetVehicle>>;

beforeAll(async () => {
  orgA = await createTestOrg("orgA-fleet");
  orgB = await createTestOrg("orgB-fleet");

  ownerB = await fleet.createFleetOwner(orgB.organizationId, { name: "Org B Owner" });
  driverB = await fleet.createFleetDriver(orgB.organizationId, { name: "Org B Driver" });
  vehicleB = await fleet.createFleetVehicle(orgB.organizationId, { assetTag: "AT-B1", plateNumber: "PL-B1" });
  vehicleA = await fleet.createFleetVehicle(orgA.organizationId, { assetTag: "AT-A1", plateNumber: "PL-A1" });
});

afterAll(async () => {
  await cleanupTestOrg(orgA);
  await cleanupTestOrg(orgB);
});

describe("Fleet service — cross-tenant isolation against real Postgres", () => {
  it("createFleetVehicle rejects an ownerId from another organization", async () => {
    await expect(
      fleet.createFleetVehicle(orgA.organizationId, { assetTag: "AT-A2", plateNumber: "PL-A2", ownerId: ownerB.id }),
    ).rejects.toThrow(fleet.NotFoundError);
  });

  it("createFleetVehicle rejects an assignedDriverId from another organization", async () => {
    await expect(
      fleet.createFleetVehicle(orgA.organizationId, {
        assetTag: "AT-A3",
        plateNumber: "PL-A3",
        assignedDriverId: driverB.id,
      }),
    ).rejects.toThrow(fleet.NotFoundError);
  });

  it("updateFleetVehicle rejects an ownerId from another organization", async () => {
    await expect(
      fleet.updateFleetVehicle(orgA.organizationId, vehicleA.id, {
        assetTag: vehicleA.assetTag,
        plateNumber: vehicleA.plateNumber,
        ownerId: ownerB.id,
      }),
    ).rejects.toThrow(fleet.NotFoundError);
  });

  it("updateFleetVehicle rejects an assignedDriverId from another organization", async () => {
    await expect(
      fleet.updateFleetVehicle(orgA.organizationId, vehicleA.id, {
        assetTag: vehicleA.assetTag,
        plateNumber: vehicleA.plateNumber,
        assignedDriverId: driverB.id,
      }),
    ).rejects.toThrow(fleet.NotFoundError);
  });

  it("createFleetVehicleDocument rejects a vehicleId from another organization", async () => {
    await expect(
      fleet.createFleetVehicleDocument(orgA.organizationId, {
        vehicleId: vehicleB.id,
        provider: "Acme Insurance",
        policyNumber: "P-1",
        insuranceExpiresAt: new Date(),
        roadworthyExpiresAt: new Date(),
      }),
    ).rejects.toThrow(fleet.NotFoundError);
  });

  it("updateFleetVehicleDocument rejects a vehicleId from another organization", async () => {
    const docA = await fleet.createFleetVehicleDocument(orgA.organizationId, {
      vehicleId: vehicleA.id,
      provider: "Acme Insurance",
      policyNumber: "P-2",
      insuranceExpiresAt: new Date(),
      roadworthyExpiresAt: new Date(),
    });

    await expect(
      fleet.updateFleetVehicleDocument(orgA.organizationId, docA.id, {
        vehicleId: vehicleB.id,
        provider: "Acme Insurance",
        policyNumber: "P-2",
        insuranceExpiresAt: new Date(),
        roadworthyExpiresAt: new Date(),
      }),
    ).rejects.toThrow(fleet.NotFoundError);
  });

  it("createFleetMaintenanceRequest rejects a vehicleId from another organization", async () => {
    await expect(
      fleet.createFleetMaintenanceRequest(orgA.organizationId, {
        vehicleId: vehicleB.id,
        faultDescription: "Engine noise",
      }),
    ).rejects.toThrow(fleet.NotFoundError);
  });

  it("createFleetWorkAndPayContract rejects a vehicleId from another organization", async () => {
    await expect(
      fleet.createFleetWorkAndPayContract(orgA.organizationId, {
        contractName: "Contract 1",
        vehicleId: vehicleB.id,
        contractAmount: "1000.00",
        depositAmount: "100.00",
        paymentSchedule: "WEEKLY",
        scheduledPaymentAmount: "50.00",
      }),
    ).rejects.toThrow(fleet.NotFoundError);
  });

  it("listFleetVehicles scoped to Org A never returns Org B's vehicle", async () => {
    const list = await fleet.listFleetVehicles(orgA.organizationId);
    expect(list.map((v) => v.id)).not.toContain(vehicleB.id);
    expect(list.map((v) => v.id)).toContain(vehicleA.id);
  });

  it("assignDriverToVehicle rejects a driverId from another organization", async () => {
    await expect(
      fleet.assignDriverToVehicle(orgA.organizationId, vehicleA.id, null, driverB.id),
    ).rejects.toThrow(fleet.NotFoundError);
  });
});

/**
 * Real-Postgres coverage for Track 1 of the Fleet/Accounting redesign: the
 * DB-enforced "one active vehicle per driver" partial unique index
 * (organizationId, assignedDriverId) WHERE assignedDriverId IS NOT NULL,
 * added in migration 20260831120000_fleet_driver_assignment_integrity, and
 * the concurrency behavior it backstops. Runs only against a disposable
 * TEST_DATABASE_URL (see test/integration/setup/guard.ts) - never against
 * production or the real dev database.
 */
describe("Fleet driver-vehicle assignment integrity against real Postgres", () => {
  let org: TestOrg;
  let activeDriver: Awaited<ReturnType<typeof fleet.createFleetDriver>>;
  let inactiveDriver: Awaited<ReturnType<typeof fleet.createFleetDriver>>;
  let vehicle1: Awaited<ReturnType<typeof fleet.createFleetVehicle>>;
  let vehicle2: Awaited<ReturnType<typeof fleet.createFleetVehicle>>;

  beforeAll(async () => {
    org = await createTestOrg("fleet-driver-assignment");
    activeDriver = await fleet.createFleetDriver(org.organizationId, { name: "Kwame Mensah", status: "ACTIVE" });
    inactiveDriver = await fleet.createFleetDriver(org.organizationId, { name: "Ama Boateng", status: "INACTIVE" });
    vehicle1 = await fleet.createFleetVehicle(org.organizationId, { assetTag: "GH-AT-1", plateNumber: "GR 1234-26" });
    vehicle2 = await fleet.createFleetVehicle(org.organizationId, { assetTag: "GH-AT-2", plateNumber: "GR 5678-26" });
  });

  afterAll(async () => {
    await cleanupTestOrg(org);
  });

  it("assigns an active, unassigned driver and preserves the assignment in history", async () => {
    const updated = await fleet.assignDriverToVehicle(org.organizationId, vehicle1.id, org.userId, activeDriver.id);
    expect(updated.assignedDriverId).toBe(activeDriver.id);
  });

  it("rejects assigning that same driver to a second vehicle - one active vehicle per driver", async () => {
    await expect(
      fleet.assignDriverToVehicle(org.organizationId, vehicle2.id, org.userId, activeDriver.id),
    ).rejects.toThrow(fleet.FleetDriverAlreadyAssignedError);
  });

  it("rejects assigning an inactive driver", async () => {
    await expect(
      fleet.assignDriverToVehicle(org.organizationId, vehicle2.id, org.userId, inactiveDriver.id),
    ).rejects.toThrow(fleet.FleetDriverNotEligibleError);
  });

  it("reassigning the driver away from vehicle1 frees them up for vehicle2", async () => {
    await fleet.assignDriverToVehicle(org.organizationId, vehicle1.id, org.userId, null);
    const updated = await fleet.assignDriverToVehicle(org.organizationId, vehicle2.id, org.userId, activeDriver.id);
    expect(updated.assignedDriverId).toBe(activeDriver.id);
    // Move back to vehicle1 for the concurrency test below, which needs the
    // driver free again on a clean slate.
    await fleet.assignDriverToVehicle(org.organizationId, vehicle2.id, org.userId, null);
  });

  it("under true concurrency, exactly one of two simultaneous assignments to the same driver succeeds and the other gets a clear conflict error", async () => {
    const results = await Promise.allSettled([
      fleet.assignDriverToVehicle(org.organizationId, vehicle1.id, org.userId, activeDriver.id),
      fleet.assignDriverToVehicle(org.organizationId, vehicle2.id, org.userId, activeDriver.id),
    ]);

    const fulfilled = results.filter((r) => r.status === "fulfilled");
    const rejected = results.filter((r) => r.status === "rejected");
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect((rejected[0] as PromiseRejectedResult).reason).toBeInstanceOf(fleet.FleetDriverAlreadyAssignedError);

    // The database's own partial unique index is the actual guarantee here,
    // not just application-level luck - confirm only one vehicle ended up
    // with the driver.
    const [v1, v2] = await Promise.all([
      fleet.listFleetVehicles(org.organizationId).then((list) => list.find((v) => v.id === vehicle1.id)),
      fleet.listFleetVehicles(org.organizationId).then((list) => list.find((v) => v.id === vehicle2.id)),
    ]);
    const assignedCount = [v1?.assignedDriverId, v2?.assignedDriverId].filter((id) => id === activeDriver.id).length;
    expect(assignedCount).toBe(1);
  });
});
