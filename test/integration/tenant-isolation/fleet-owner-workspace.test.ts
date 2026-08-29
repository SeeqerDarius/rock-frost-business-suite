import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { testDb } from "../setup/db";
import { cleanupTestOrg, createTestOrg, type TestOrg } from "../setup/fixtures";
import { createFleetOwner, createFleetVehicle } from "@/modules/fleet/service";
import { getFleetOwnerVehicleWorkspace, getFleetOwnerWorkspace } from "@/modules/fleet/owner-workspace";

let orgA: TestOrg;
let orgB: TestOrg;
let ownerAUserId: string;
let ownerBUserId: string;
let vehicleAId: string;
let vehicleBId: string;

beforeAll(async () => {
  [orgA, orgB] = await Promise.all([createTestOrg("owner-workspace-a"), createTestOrg("owner-workspace-b")]);
  const [userA, userB] = await Promise.all([
    testDb.user.create({ data: { name: "Owner A", email: `owner-a-${orgA.organizationId}@example.invalid`, status: "ACTIVE" } }),
    testDb.user.create({ data: { name: "Owner B", email: `owner-b-${orgB.organizationId}@example.invalid`, status: "ACTIVE" } }),
  ]);
  ownerAUserId = userA.id;
  ownerBUserId = userB.id;
  const [ownerA, ownerB] = await Promise.all([
    createFleetOwner(orgA.organizationId, { name: "Owner A", userId: ownerAUserId }),
    createFleetOwner(orgB.organizationId, { name: "Owner B", userId: ownerBUserId }),
  ]);
  const [vehicleA, vehicleB] = await Promise.all([
    createFleetVehicle(orgA.organizationId, { assetTag: "OWNER-A", plateNumber: "OWN-A-1", ownerId: ownerA.id, salesTargetPeriod: "DAILY", salesTargetAmount: "200" }),
    createFleetVehicle(orgB.organizationId, { assetTag: "OWNER-B", plateNumber: "OWN-B-1", ownerId: ownerB.id, salesTargetPeriod: "WEEKLY", salesTargetAmount: "1000" }),
  ]);
  vehicleAId = vehicleA.id;
  vehicleBId = vehicleB.id;
});

afterAll(async () => {
  await Promise.all([cleanupTestOrg(orgA), cleanupTestOrg(orgB)]);
  await testDb.user.deleteMany({ where: { id: { in: [ownerAUserId, ownerBUserId] } } });
});

describe("Vehicle Owner Workspace tenant and portfolio isolation", () => {
  it("returns only vehicles linked to the authenticated owner", async () => {
    const workspace = await getFleetOwnerWorkspace(orgA.organizationId, ownerAUserId);
    expect(workspace?.vehicles.map((vehicle) => vehicle.id)).toEqual([vehicleAId]);
    expect(workspace?.vehicles.map((vehicle) => vehicle.id)).not.toContain(vehicleBId);
  });

  it("rejects a direct vehicle id from another owner or organization", async () => {
    expect(await getFleetOwnerVehicleWorkspace(orgA.organizationId, ownerAUserId, vehicleBId)).toBeNull();
    expect(await getFleetOwnerWorkspace(orgA.organizationId, ownerBUserId)).toBeNull();
  });
});
