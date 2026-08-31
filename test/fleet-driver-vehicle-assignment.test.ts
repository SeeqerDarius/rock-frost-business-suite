import { beforeEach, describe, expect, it, vi } from "vitest";

const mockDb = {
  fleetVehicle: { findFirst: vi.fn(), create: vi.fn(), update: vi.fn() },
  fleetDriver: { findFirst: vi.fn(), findMany: vi.fn() },
  fleetOwner: { findFirst: vi.fn() },
  fleetVehicleDriverHistory: { create: vi.fn() },
  fleetVehicleOwnershipHistory: { create: vi.fn() },
  $transaction: vi.fn(),
};

vi.mock("@/lib/db", () => ({ db: mockDb }));

function p2002(target: string[]) {
  const error = new Error("Unique constraint failed") as Error & { code: string; meta: { target: string[] } };
  error.code = "P2002";
  error.meta = { target };
  return error;
}

function txPassthrough() {
  mockDb.$transaction.mockImplementation(async (fn: (tx: typeof mockDb) => Promise<unknown>) => fn(mockDb));
}

const fleet = await import("@/modules/fleet/service");

const ORG = "org-1";

beforeEach(() => {
  vi.clearAllMocks();
  txPassthrough();
});

const ACTIVE_DRIVER = { id: "driver-1", name: "Kwame Mensah", status: "ACTIVE" };
const INACTIVE_DRIVER = { id: "driver-2", name: "Ama Boateng", status: "INACTIVE" };

describe("assignDriverToVehicle", () => {
  it("assigns an eligible active, unassigned driver and writes history", async () => {
    // First call: the vehicle lookup. Second call: validateDriverEligibility's
    // conflict check, finding no other vehicle already holding this driver.
    mockDb.fleetVehicle.findFirst.mockImplementationOnce(async () => ({ id: "veh-1", assignedDriverId: null, assignedDriver: null }));
    mockDb.fleetVehicle.findFirst.mockImplementationOnce(async () => null);
    mockDb.fleetDriver.findFirst.mockResolvedValue(ACTIVE_DRIVER);
    mockDb.fleetVehicle.update.mockResolvedValue({ id: "veh-1", assignedDriverId: "driver-1" });

    const result = await fleet.assignDriverToVehicle(ORG, "veh-1", "actor-1", "driver-1");

    expect(result).toEqual({ id: "veh-1", assignedDriverId: "driver-1" });
    expect(mockDb.fleetVehicle.update).toHaveBeenCalledWith({ where: { id: "veh-1" }, data: { assignedDriverId: "driver-1" } });
    expect(mockDb.fleetVehicleDriverHistory.create).toHaveBeenCalledWith({
      data: {
        organizationId: ORG,
        vehicleId: "veh-1",
        previousDriverId: undefined,
        previousDriverName: undefined,
        newDriverId: "driver-1",
        newDriverName: "Kwame Mensah",
        changedById: "actor-1",
      },
    });
  });

  it("rejects a driver already assigned to a different vehicle", async () => {
    mockDb.fleetVehicle.findFirst.mockImplementationOnce(async () => ({ id: "veh-2", assignedDriverId: null, assignedDriver: null }));
    mockDb.fleetDriver.findFirst.mockResolvedValue(ACTIVE_DRIVER);
    mockDb.fleetVehicle.findFirst.mockImplementationOnce(async () => ({ id: "veh-other" })); // conflict found

    await expect(fleet.assignDriverToVehicle(ORG, "veh-2", "actor-1", "driver-1")).rejects.toThrow(fleet.FleetDriverAlreadyAssignedError);
    expect(mockDb.fleetVehicle.update).not.toHaveBeenCalled();
    expect(mockDb.fleetVehicleDriverHistory.create).not.toHaveBeenCalled();
  });

  it("rejects an inactive driver", async () => {
    mockDb.fleetVehicle.findFirst.mockImplementationOnce(async () => ({ id: "veh-1", assignedDriverId: null, assignedDriver: null }));
    mockDb.fleetDriver.findFirst.mockResolvedValue(INACTIVE_DRIVER);

    await expect(fleet.assignDriverToVehicle(ORG, "veh-1", "actor-1", "driver-2")).rejects.toThrow(fleet.FleetDriverNotEligibleError);
    expect(mockDb.fleetVehicle.update).not.toHaveBeenCalled();
  });

  it("rejects a driver from another organization", async () => {
    mockDb.fleetVehicle.findFirst.mockImplementationOnce(async () => ({ id: "veh-1", assignedDriverId: null, assignedDriver: null }));
    mockDb.fleetDriver.findFirst.mockResolvedValue(null);

    await expect(fleet.assignDriverToVehicle(ORG, "veh-1", "actor-1", "driver-foreign")).rejects.toThrow(fleet.NotFoundError);
  });

  it("rejects reassignment of a vehicle from another organization", async () => {
    mockDb.fleetVehicle.findFirst.mockResolvedValue(null);
    await expect(fleet.assignDriverToVehicle(ORG, "veh-foreign", "actor-1", "driver-1")).rejects.toThrow(fleet.NotFoundError);
  });

  it("re-assigning the vehicle's own current driver is a safe no-op - no history written", async () => {
    mockDb.fleetVehicle.findFirst.mockResolvedValue({ id: "veh-1", assignedDriverId: "driver-1", assignedDriver: ACTIVE_DRIVER });

    const result = await fleet.assignDriverToVehicle(ORG, "veh-1", "actor-1", "driver-1");

    expect(result).toEqual({ id: "veh-1", assignedDriverId: "driver-1", assignedDriver: ACTIVE_DRIVER });
    expect(mockDb.fleetVehicle.update).not.toHaveBeenCalled();
    expect(mockDb.fleetVehicleDriverHistory.create).not.toHaveBeenCalled();
  });

  it("preserves history across a reassignment from one driver to another", async () => {
    const previousDriver = { id: "driver-1", name: "Kwame Mensah" };
    mockDb.fleetVehicle.findFirst.mockImplementationOnce(async () => ({ id: "veh-1", assignedDriverId: "driver-1", assignedDriver: previousDriver }));
    mockDb.fleetDriver.findFirst.mockResolvedValue({ id: "driver-3", name: "Yaw Owusu", status: "ACTIVE" });
    mockDb.fleetVehicle.findFirst.mockImplementationOnce(async () => null); // no conflict for driver-3
    mockDb.fleetVehicle.update.mockResolvedValue({ id: "veh-1", assignedDriverId: "driver-3" });

    await fleet.assignDriverToVehicle(ORG, "veh-1", "actor-1", "driver-3");

    expect(mockDb.fleetVehicleDriverHistory.create).toHaveBeenCalledWith({
      data: {
        organizationId: ORG,
        vehicleId: "veh-1",
        previousDriverId: "driver-1",
        previousDriverName: "Kwame Mensah",
        newDriverId: "driver-3",
        newDriverName: "Yaw Owusu",
        changedById: "actor-1",
      },
    });
  });

  it("unassigning (driverId: null) writes history with a null new driver", async () => {
    const previousDriver = { id: "driver-1", name: "Kwame Mensah" };
    mockDb.fleetVehicle.findFirst.mockResolvedValue({ id: "veh-1", assignedDriverId: "driver-1", assignedDriver: previousDriver });
    mockDb.fleetVehicle.update.mockResolvedValue({ id: "veh-1", assignedDriverId: null });

    await fleet.assignDriverToVehicle(ORG, "veh-1", "actor-1", null);

    expect(mockDb.fleetVehicle.update).toHaveBeenCalledWith({ where: { id: "veh-1" }, data: { assignedDriverId: null } });
    expect(mockDb.fleetVehicleDriverHistory.create).toHaveBeenCalledWith({
      data: {
        organizationId: ORG,
        vehicleId: "veh-1",
        previousDriverId: "driver-1",
        previousDriverName: "Kwame Mensah",
        newDriverId: undefined,
        newDriverName: undefined,
        changedById: "actor-1",
      },
    });
  });

  it("translates a concurrent-assignment race (P2002 on the driver partial unique index) into a clear error", async () => {
    mockDb.fleetVehicle.findFirst.mockImplementationOnce(async () => ({ id: "veh-1", assignedDriverId: null, assignedDriver: null }));
    mockDb.fleetDriver.findFirst.mockResolvedValue(ACTIVE_DRIVER);
    mockDb.fleetVehicle.findFirst.mockImplementationOnce(async () => null); // pre-check saw no conflict
    mockDb.fleetVehicle.update.mockRejectedValue(p2002(["organizationId", "assignedDriverId"]));

    await expect(fleet.assignDriverToVehicle(ORG, "veh-1", "actor-1", "driver-1")).rejects.toThrow(fleet.FleetDriverAlreadyAssignedError);
  });

  it("does not mistake an assetTag/plateNumber conflict for a driver-assignment conflict", async () => {
    mockDb.fleetVehicle.findFirst.mockImplementationOnce(async () => ({ id: "veh-1", assignedDriverId: null, assignedDriver: null }));
    mockDb.fleetDriver.findFirst.mockResolvedValue(ACTIVE_DRIVER);
    mockDb.fleetVehicle.findFirst.mockImplementationOnce(async () => null);
    mockDb.fleetVehicle.update.mockRejectedValue(p2002(["organizationId", "plateNumber"]));

    await expect(fleet.assignDriverToVehicle(ORG, "veh-1", "actor-1", "driver-1")).rejects.not.toThrow(fleet.FleetDriverAlreadyAssignedError);
  });
});

describe("filterEligibleDrivers", () => {
  const unassigned = { id: "d1", assignedVehicles: [] };
  const assignedElsewhere = { id: "d2", assignedVehicles: [{ id: "veh-other" }] };
  const assignedToThisVehicle = { id: "d3", assignedVehicles: [{ id: "veh-1" }] };

  it("includes only unassigned drivers when no current vehicle is given (new-vehicle dialog)", () => {
    const result = fleet.filterEligibleDrivers([unassigned, assignedElsewhere, assignedToThisVehicle], null);
    expect(result.map((d) => d.id)).toEqual(["d1"]);
  });

  it("includes unassigned drivers plus the vehicle's own current driver when editing that vehicle", () => {
    const result = fleet.filterEligibleDrivers([unassigned, assignedElsewhere, assignedToThisVehicle], "veh-1");
    expect(result.map((d) => d.id).sort()).toEqual(["d1", "d3"]);
  });

  it("excludes a driver assigned to a different vehicle even when editing another vehicle", () => {
    const result = fleet.filterEligibleDrivers([assignedElsewhere], "veh-1");
    expect(result).toEqual([]);
  });
});
