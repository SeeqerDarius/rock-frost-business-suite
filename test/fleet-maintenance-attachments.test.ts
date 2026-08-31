import fs from "node:fs";
import { describe, it, expect, vi, beforeEach } from "vitest";

const mockDb = {
  fleetVehicle: { findFirst: vi.fn() },
  fleetMaintenanceRequest: { create: vi.fn() },
  fleetMaintenanceAttachment: { findFirst: vi.fn(), create: vi.fn() },
  fileAsset: { create: vi.fn() },
  fleetMaintenanceEvent: { create: vi.fn() },
  notification: { create: vi.fn() },
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

function photo(name: string) {
  return { fileName: name, mimeType: "image/png", size: 100, dataUrl: `data:image/png;base64,${name}` };
}

describe("createFleetMaintenanceRequest with multiple attachments", () => {
  it("creates one FleetMechanicAttachment row per uploaded photo", async () => {
    mockDb.fleetVehicle.findFirst.mockResolvedValue({ id: "veh-1", organizationId: ORG, plateNumber: "GR-1" });
    mockDb.fleetMaintenanceRequest.create.mockResolvedValue({ id: "req-1" });
    mockDb.fileAsset.create
      .mockResolvedValueOnce({ id: "asset-1" })
      .mockResolvedValueOnce({ id: "asset-2" })
      .mockResolvedValueOnce({ id: "asset-3" });

    await fleet.createFleetMaintenanceRequest(ORG, {
      vehicleId: "veh-1",
      faultDescription: "Brakes squeal",
      requestedById: "user-1",
      photos: [photo("a"), photo("b"), photo("c")],
    });

    expect(mockDb.fileAsset.create).toHaveBeenCalledTimes(3);
    expect(mockDb.fleetMaintenanceAttachment.create).toHaveBeenCalledTimes(3);
    expect(mockDb.fleetMaintenanceAttachment.create).toHaveBeenCalledWith({
      data: { organizationId: ORG, requestId: "req-1", fileAssetId: "asset-1", uploadedById: "user-1" },
    });
    expect(mockDb.fleetMaintenanceRequest.create).toHaveBeenCalledTimes(1);
  });

  it("creates the request with zero attachments when no photos are supplied", async () => {
    mockDb.fleetVehicle.findFirst.mockResolvedValue({ id: "veh-1", organizationId: ORG, plateNumber: "GR-1" });
    mockDb.fleetMaintenanceRequest.create.mockResolvedValue({ id: "req-1" });

    await fleet.createFleetMaintenanceRequest(ORG, { vehicleId: "veh-1", faultDescription: "Brakes squeal" });

    expect(mockDb.fileAsset.create).not.toHaveBeenCalled();
  });
});

describe("getFleetMaintenanceAttachment scoping", () => {
  it("bypasses vehicle/mechanic scoping entirely for a caller who can view all", async () => {
    mockDb.fleetMaintenanceAttachment.findFirst.mockResolvedValue({ fileAsset: { url: "data:image/png;base64,x", updatedAt: new Date() } });

    await fleet.getFleetMaintenanceAttachment(ORG, "att-1", "user-1", true);

    expect(mockDb.fleetMaintenanceAttachment.findFirst).toHaveBeenCalledWith({
      where: { id: "att-1", organizationId: ORG },
      select: { fileAsset: { select: { url: true, updatedAt: true } } },
    });
  });

  it("scopes to the caller's own vehicle assignment/ownership or their own mechanic assignment when not privileged", async () => {
    mockDb.fleetMaintenanceAttachment.findFirst.mockResolvedValue(null);

    await fleet.getFleetMaintenanceAttachment(ORG, "att-1", "user-1", false);

    expect(mockDb.fleetMaintenanceAttachment.findFirst).toHaveBeenCalledWith({
      where: {
        id: "att-1",
        organizationId: ORG,
        request: { OR: [{ vehicle: { OR: [{ assignedDriver: { userId: "user-1" } }, { owner: { userId: "user-1" } }] } }, { mechanic: { userId: "user-1" } }] },
      },
      select: { fileAsset: { select: { url: true, updatedAt: true } } },
    });
  });
});

describe("Multi-attachment UI wiring", () => {
  const maintenancePage = fs.readFileSync("src/app/app/fleet/maintenance/page.tsx", "utf8");
  const maintenanceActions = fs.readFileSync("src/app/app/fleet/maintenance/actions.ts", "utf8");
  const driverPortalPage = fs.readFileSync("src/app/app/fleet/driver-portal/page.tsx", "utf8");
  const driverPortalActions = fs.readFileSync("src/app/app/fleet/driver-portal/actions.ts", "utf8");
  const mechanicPortalPage = fs.readFileSync("src/app/app/fleet/mechanic-portal/page.tsx", "utf8");
  const ownerVehiclePage = fs.readFileSync("src/app/app/fleet/investor/vehicles/[vehicleId]/page.tsx", "utf8");
  const attachmentRoute = fs.readFileSync("src/app/api/fleet/maintenance/attachments/[attachmentId]/route.ts", "utf8");

  it("accepts multiple files via a single multi-select input, not a single-file input", () => {
    expect(maintenancePage).toContain('name="photos" type="file"');
    expect(maintenancePage).toContain("multiple");
    expect(driverPortalPage).toContain('name="photos" type="file"');
  });

  it("caps the number of attachments per report and rejects an over-limit upload", () => {
    expect(maintenanceActions).toContain("MAX_FLEET_MAINTENANCE_ATTACHMENTS");
    expect(maintenanceActions).toContain("too-many-photos");
    expect(driverPortalActions).toContain("MAX_FLEET_MAINTENANCE_ATTACHMENTS");
  });

  it("every read surface links to attachments by id, not a single request-level photo route", () => {
    for (const page of [maintenancePage, driverPortalPage, mechanicPortalPage, ownerVehiclePage]) {
      expect(page).toContain("/api/fleet/maintenance/attachments/");
      expect(page).not.toContain("photoAssetId");
      expect(page).not.toContain("photoAsset");
    }
  });

  it("the attachment route is independently permission-gated, same as the old single-photo route was", () => {
    expect(attachmentRoute).toContain("canAccessModule(tenant,");
    expect(attachmentRoute).toContain("getFleetMaintenanceAttachment");
  });

  it("removed the old single-photo request-scoped route entirely", () => {
    expect(fs.existsSync("src/app/api/fleet/maintenance/[requestId]/photo/route.ts")).toBe(false);
  });
});

describe("Open-maintenance counters correctly exclude every terminal status (regression: a gap missed in D3's own sweep)", () => {
  const service = fs.readFileSync("src/modules/fleet/service.ts", "utf8");

  it("getFleetSummary's org-wide pending/vehicle-under-maintenance counts exclude VERIFIED and REJECTED, not just COMPLETED/CANCELLED", () => {
    expect(service).toContain('notIn: ["COMPLETED", "VERIFIED", "REJECTED", "CANCELLED"]');
  });

  it("the driver dashboard stats' open-maintenance count uses the same full terminal-state exclusion", () => {
    expect(service).toContain('!["COMPLETED", "VERIFIED", "REJECTED", "CANCELLED"].includes(request.progressStatus)');
  });
});

describe("Verified repair cost posts to Accounting (Phase D5)", () => {
  const maintenanceActions = fs.readFileSync("src/app/app/fleet/maintenance/actions.ts", "utf8");

  it("posts the verified repair's cost as a module expense, mirroring the payments action's postModuleRevenue call site", () => {
    expect(maintenanceActions).toContain("postModuleExpense");
    expect(maintenanceActions).toContain('from "@/lib/accounting-integration"');
    expect(maintenanceActions).toContain("const request = await verifyMaintenanceCompletion(tenant.organizationId, id, userId);");
    expect(maintenanceActions).toContain('sourceType: "FLEET_MAINTENANCE_REPAIR"');
    expect(maintenanceActions).toContain('postingPurpose: "VERIFIED"');
  });

  it("skips posting entirely when there is no repair cost (e.g. warranty work) rather than posting a zero amount", () => {
    expect(maintenanceActions).toContain("if (request.repairCost && !request.repairCost.isZero())");
  });

  it("verifyMaintenanceCompletion returns the request (repairCost/branchId/completedAt/vehicle) so the action layer can post after the transaction commits", () => {
    const service = fs.readFileSync("src/modules/fleet/service.ts", "utf8");
    expect(service).toContain("export async function verifyMaintenanceCompletion(organizationId: string, id: string, actorId: string) {");
    const fnStart = service.indexOf("export async function verifyMaintenanceCompletion");
    const fnBody = service.slice(fnStart, fnStart + 3000);
    expect(fnBody).toContain("return db.$transaction(async (tx) => {");
    expect(fnBody).toContain("return request;");
  });
});
