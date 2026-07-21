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
        clientName: "Client",
        contractAmount: "1000.00",
        depositAmount: "100.00",
        weeklyPaymentAmount: "50.00",
      }),
    ).rejects.toThrow(fleet.NotFoundError);
  });

  it("listFleetVehicles scoped to Org A never returns Org B's vehicle", async () => {
    const list = await fleet.listFleetVehicles(orgA.organizationId);
    expect(list.map((v) => v.id)).not.toContain(vehicleB.id);
    expect(list.map((v) => v.id)).toContain(vehicleA.id);
  });
});
