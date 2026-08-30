import fs from "node:fs";
import { describe, it, expect, vi, beforeEach } from "vitest";

const mockDb = {
  fleetMaintenanceRequest: { findFirst: vi.fn(), update: vi.fn() },
  fleetMechanic: { findFirst: vi.fn() },
  fleetMaintenanceEvent: { create: vi.fn() },
  $transaction: vi.fn(),
};

vi.mock("@/lib/db", () => ({ db: mockDb }));

function txPassthrough() {
  mockDb.$transaction.mockImplementation(async (fn: (tx: typeof mockDb) => Promise<unknown>) => fn(mockDb));
}

const fleet = await import("@/modules/fleet/service");

const ORG = "org-1";

beforeEach(() => {
  vi.clearAllMocks();
  txPassthrough();
});

describe("assignMaintenanceMechanic", () => {
  const approvedRequest = { id: "req-1", approvalStatus: "APPROVED", ownerApprovalRequired: false, ownerApprovalStatus: "PENDING", progressStatus: "APPROVED" };

  it("assigns a real mechanic from the caller's own organization", async () => {
    mockDb.fleetMaintenanceRequest.findFirst.mockResolvedValue(approvedRequest);
    mockDb.fleetMechanic.findFirst.mockResolvedValue({ id: "mech-1", organizationId: ORG, name: "Kojo's Garage" });

    await fleet.assignMaintenanceMechanic(ORG, "req-1", "actor-1", "mech-1");

    expect(mockDb.fleetMechanic.findFirst).toHaveBeenCalledWith({ where: { id: "mech-1", organizationId: ORG } });
    expect(mockDb.fleetMaintenanceRequest.update).toHaveBeenCalledWith({ where: { id: "req-1" }, data: { mechanicId: "mech-1" } });
    expect(mockDb.fleetMaintenanceEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ eventType: "MECHANIC_ASSIGNED", note: "Kojo's Garage" }) }),
    );
  });

  it("rejects a mechanicId belonging to a different organization", async () => {
    mockDb.fleetMaintenanceRequest.findFirst.mockResolvedValue(approvedRequest);
    // The mechanic lookup is itself scoped to the caller's own organizationId,
    // so a mechanic id from another org simply never matches.
    mockDb.fleetMechanic.findFirst.mockResolvedValue(null);

    await expect(fleet.assignMaintenanceMechanic(ORG, "req-1", "actor-1", "mech-from-other-org")).rejects.toThrow(fleet.NotFoundError);

    expect(mockDb.fleetMechanic.findFirst).toHaveBeenCalledWith({ where: { id: "mech-from-other-org", organizationId: ORG } });
    expect(mockDb.fleetMaintenanceRequest.update).not.toHaveBeenCalled();
    expect(mockDb.fleetMaintenanceEvent.create).not.toHaveBeenCalled();
  });

  it("still requires prior approval before assigning a mechanic, regardless of org scoping", async () => {
    mockDb.fleetMaintenanceRequest.findFirst.mockResolvedValue({ ...approvedRequest, approvalStatus: "PENDING" });

    await expect(fleet.assignMaintenanceMechanic(ORG, "req-1", "actor-1", "mech-1")).rejects.toThrow(fleet.MaintenanceApprovalRequiredError);
    expect(mockDb.fleetMechanic.findFirst).not.toHaveBeenCalled();
  });
});

describe("Fleet Mechanics roster wiring", () => {
  const rosterPage = fs.readFileSync("src/app/app/fleet/mechanics/page.tsx", "utf8");
  const rosterActions = fs.readFileSync("src/app/app/fleet/mechanics/actions.ts", "utf8");
  const maintenancePage = fs.readFileSync("src/app/app/fleet/maintenance/page.tsx", "utf8");
  const navigationAccess = fs.readFileSync("src/modules/fleet/navigation-access.ts", "utf8");

  it("gates the roster page and its actions on FLEET_MECHANICS_MANAGE", () => {
    expect(rosterPage).toContain("PERMISSIONS.FLEET_MECHANICS_MANAGE");
    expect(rosterActions).toContain("PERMISSIONS.FLEET_MECHANICS_MANAGE");
    expect(navigationAccess).toContain('["/app/fleet/mechanics", hasPermission(tenant, PERMISSIONS.FLEET_MECHANICS_MANAGE)]');
  });

  it("assigns a mechanic through a real roster Select, not free text", () => {
    expect(maintenancePage).toContain('name="mechanicId"');
    expect(maintenancePage).not.toContain("mechanicAssigned");
  });
});

describe("acceptMaintenanceAssignment", () => {
  const assignedRequest = { id: "req-1", progressStatus: "APPROVED", mechanicId: "mech-1" };

  it("records the scheduled repair date and logs a REPAIR_SCHEDULED event for the caller's own assignment", async () => {
    mockDb.fleetMechanic.findFirst.mockResolvedValue({ id: "mech-1", organizationId: ORG, userId: "user-1" });
    mockDb.fleetMaintenanceRequest.findFirst.mockResolvedValue(assignedRequest);
    const scheduledRepairAt = new Date("2026-09-01T00:00:00.000Z");

    await fleet.acceptMaintenanceAssignment(ORG, "req-1", "user-1", scheduledRepairAt);

    expect(mockDb.fleetMechanic.findFirst).toHaveBeenCalledWith({ where: { organizationId: ORG, userId: "user-1" } });
    expect(mockDb.fleetMaintenanceRequest.findFirst).toHaveBeenCalledWith({ where: { id: "req-1", organizationId: ORG, mechanicId: "mech-1" } });
    expect(mockDb.fleetMaintenanceRequest.update).toHaveBeenCalledWith({ where: { id: "req-1" }, data: { scheduledRepairAt } });
    expect(mockDb.fleetMaintenanceEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ eventType: "REPAIR_SCHEDULED" }) }),
    );
  });

  it("rejects when the caller has no linked mechanic profile in this organization", async () => {
    mockDb.fleetMechanic.findFirst.mockResolvedValue(null);

    await expect(fleet.acceptMaintenanceAssignment(ORG, "req-1", "user-1", new Date())).rejects.toThrow(fleet.NotFoundError);
    expect(mockDb.fleetMaintenanceRequest.findFirst).not.toHaveBeenCalled();
    expect(mockDb.fleetMaintenanceRequest.update).not.toHaveBeenCalled();
  });

  it("rejects a request that isn't assigned to the caller's own mechanic profile", async () => {
    mockDb.fleetMechanic.findFirst.mockResolvedValue({ id: "mech-1", organizationId: ORG, userId: "user-1" });
    // The request lookup is itself scoped to mechanicId: mechanic.id, so a
    // request assigned to a different mechanic (or with no mechanic at all)
    // simply never matches.
    mockDb.fleetMaintenanceRequest.findFirst.mockResolvedValue(null);

    await expect(fleet.acceptMaintenanceAssignment(ORG, "req-1", "user-1", new Date())).rejects.toThrow(fleet.NotFoundError);
    expect(mockDb.fleetMaintenanceRequest.update).not.toHaveBeenCalled();
  });
});

describe("isMechanicRole / isNarrowFleetSelfServiceRole", () => {
  const permissions = fs.readFileSync("src/lib/auth/permissions.ts", "utf8");

  it("gates isMechanicRole on the seeded Mechanic role holding the narrow permission but lacking fleet-wide maintenance management", () => {
    expect(permissions).toContain('tenant.role === "Mechanic"');
    expect(permissions).toContain("hasPermission(tenant, PERMISSIONS.FLEET_MECHANIC_SELF_SERVICE)");
    expect(permissions).toContain("!hasPermission(tenant, PERMISSIONS.FLEET_MAINTENANCE_MANAGE)");
  });

  it("combines Driver and Mechanic into one narrow-self-service check", () => {
    expect(permissions).toContain("export function isNarrowFleetSelfServiceRole");
    expect(permissions).toContain("isFleetDriverRole(tenant) || isMechanicRole(tenant)");
  });
});

describe("Mechanic role/permission fix (D2)", () => {
  const seedData = fs.readFileSync("prisma/seed-data.ts", "utf8");

  it("scopes the seeded Mechanic role to assignment-based self-service, not fleet-wide management", () => {
    expect(seedData).toContain("Mechanic: [PERMISSIONS.DASHBOARD_VIEW, PERMISSIONS.FLEET_MECHANIC_SELF_SERVICE, PERMISSIONS.AI_ASSISTANT_USE]");
  });

  it("cleans up the old fleet-wide grants for installations seeded before this fix", () => {
    expect(seedData).toContain('const mechanicRole = roles.find((role) => role.name === "Mechanic");');
    expect(seedData).toContain("deleteMany({ where: { roleId: mechanicRole.id, permissionId: fleetViewPermission.id } })");
    expect(seedData).toContain("deleteMany({ where: { roleId: mechanicRole.id, permissionId: fleetMaintenanceManagePermission.id } })");
  });
});

describe("Mechanic self-service portal wiring", () => {
  const portalPage = fs.readFileSync("src/app/app/fleet/mechanic-portal/page.tsx", "utf8");
  const portalActions = fs.readFileSync("src/app/app/fleet/mechanic-portal/actions.ts", "utf8");
  const navigationAccess = fs.readFileSync("src/modules/fleet/navigation-access.ts", "utf8");
  const fleetOverview = fs.readFileSync("src/app/app/fleet/page.tsx", "utf8");

  it("gates the mechanic portal on FLEET_MECHANIC_SELF_SERVICE, independently on the page and every action", () => {
    expect(portalPage).toContain("PERMISSIONS.FLEET_MECHANIC_SELF_SERVICE");
    expect(portalActions).toContain("PERMISSIONS.FLEET_MECHANIC_SELF_SERVICE");
    expect(navigationAccess).toContain('["/app/fleet/mechanic-portal", hasPermission(tenant, PERMISSIONS.FLEET_MECHANIC_SELF_SERVICE)]');
  });

  it("routes a Mechanic without fleet-wide view to their own portal from the Fleet Overview page", () => {
    expect(fleetOverview).toContain('if (hasPermission(tenant, PERMISSIONS.FLEET_MECHANIC_SELF_SERVICE)) redirect("/app/fleet/mechanic-portal");');
  });

  it("scopes the workspace read to the mechanic profile linked to the caller's own userId", () => {
    const workspace = fs.readFileSync("src/modules/fleet/mechanic-workspace.ts", "utf8");
    expect(workspace).toContain("db.fleetMechanic.findFirst({ where: { organizationId, userId } })");
  });
});
