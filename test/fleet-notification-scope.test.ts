import fs from "node:fs";
import { describe, expect, it } from "vitest";
import { scopeBroadcastsToOwnedVehicles } from "@/modules/fleet/notification-scope";

const page = fs.readFileSync("src/app/app/(overview)/notifications/page.tsx", "utf8");
const actions = fs.readFileSync("src/app/app/(overview)/notifications/actions.ts", "utf8");
const permissions = fs.readFileSync("src/lib/auth/permissions.ts", "utf8");

describe("isFleetOwnerRole", () => {
  it("is gated on the seeded Vehicle Owner role holding the narrow permission but lacking fleet-wide reports", () => {
    expect(permissions).toContain('tenant.role === "Vehicle Owner"');
    expect(permissions).toContain("hasPermission(tenant, PERMISSIONS.FLEET_INVESTOR_VIEW)");
    expect(permissions).toContain("!hasPermission(tenant, PERMISSIONS.FLEET_REPORTS_VIEW)");
  });
});

describe("scopeBroadcastsToOwnedVehicles", () => {
  const ownedVehicleIds = new Set(["vehicle-1", "vehicle-2"]);

  it("keeps a broadcast for the owner's own vehicle", () => {
    const notifications = [{ userId: null, metadata: { vehicleId: "vehicle-1" } }];
    expect(scopeBroadcastsToOwnedVehicles(notifications, ownedVehicleIds)).toHaveLength(1);
  });

  it("drops a broadcast for a different owner's vehicle in the same organization", () => {
    const notifications = [{ userId: null, metadata: { vehicleId: "someone-elses-vehicle" } }];
    expect(scopeBroadcastsToOwnedVehicles(notifications, ownedVehicleIds)).toHaveLength(0);
  });

  it("keeps a broadcast with no vehicleId (a general announcement)", () => {
    const notifications = [{ userId: null, metadata: { submissionId: "sub-1" } }, { userId: null, metadata: null }];
    expect(scopeBroadcastsToOwnedVehicles(notifications, ownedVehicleIds)).toHaveLength(2);
  });

  it("always keeps a notification addressed directly to the caller, regardless of metadata", () => {
    const notifications = [{ userId: "user-1", metadata: { vehicleId: "someone-elses-vehicle" } }];
    expect(scopeBroadcastsToOwnedVehicles(notifications, ownedVehicleIds)).toHaveLength(1);
  });
});

describe("Notification recipient scoping wiring", () => {
  it("scopes broadcasts to the owner's own vehicles on both the page and the mark-all-read action", () => {
    expect(page).toContain("isFleetOwnerRole(tenant)");
    expect(page).toContain("scopeBroadcastsToOwnedVehicles(");
    expect(page).toContain("listFleetActorVehicles(tenant.organizationId, userId, { driver: false, owner: true })");
    expect(actions).toContain("isFleetOwnerRole(tenant)");
    expect(actions).toContain("scopeBroadcastsToOwnedVehicles(");
  });

  it("leaves every other role's broadcast visibility unchanged", () => {
    expect(page).toContain("isNarrowFleetSelfServiceRole(tenant) ? { userId } : { OR: [{ userId }, { userId: null }] }");
  });
});
