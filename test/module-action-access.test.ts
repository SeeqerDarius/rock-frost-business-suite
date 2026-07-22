import { beforeEach, describe, expect, it, vi } from "vitest";

const mockRequireModuleAccess = vi.fn();
const mockCreateFleetVehicle = vi.fn();
const mockUpdateFleetVehicle = vi.fn();

vi.mock("@/lib/auth/module-access", () => ({ requireModuleAccess: mockRequireModuleAccess }));
vi.mock("@/modules/fleet/service", () => ({
  createFleetVehicle: mockCreateFleetVehicle,
  updateFleetVehicle: mockUpdateFleetVehicle,
  NotFoundError: class NotFoundError extends Error {},
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));

const { upsertFleetVehicle } = await import("@/app/app/fleet/vehicles/actions");

beforeEach(() => {
  vi.clearAllMocks();
});

describe("module action boundary", () => {
  it("stops a representative action before validation or service access when the module is denied", async () => {
    mockRequireModuleAccess.mockRejectedValue(new Error("module denied"));

    await expect(upsertFleetVehicle(new FormData())).rejects.toThrow("module denied");
    expect(mockRequireModuleAccess).toHaveBeenCalledWith("fleet");
    expect(mockCreateFleetVehicle).not.toHaveBeenCalled();
    expect(mockUpdateFleetVehicle).not.toHaveBeenCalled();
  });
});
