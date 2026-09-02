import { beforeEach, describe, expect, it, vi } from "vitest";

const mockRequireCurrentTenant = vi.fn();
const mockIsPlatformOperator = vi.fn();
const mockGetServerAuthSession = vi.fn();
const mockLogAuditEvent = vi.fn();

const mockDb = {
  module: { findUnique: vi.fn(), update: vi.fn() },
};

vi.mock("@/lib/db", () => ({ db: mockDb }));
vi.mock("@/lib/tenant", () => ({ requireCurrentTenant: mockRequireCurrentTenant }));
vi.mock("@/lib/auth/permissions", () => ({ isPlatformOperator: mockIsPlatformOperator }));
vi.mock("@/lib/auth/session", () => ({ getServerAuthSession: mockGetServerAuthSession }));
vi.mock("@/lib/audit", () => ({ logAuditEvent: mockLogAuditEvent }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const { toggleModuleAvailability } = await import("@/app/app/platform/modules/actions");

function data(fields: Record<string, string>) {
  const formData = new FormData();
  for (const [key, value] of Object.entries(fields)) formData.set(key, value);
  return formData;
}

/**
 * Marks a product ACTIVE or INACTIVE in the catalogue - deliberately
 * distinct from toggleOrganizationModule (../actions.ts), which flips
 * OrganizationModule.enabled for one org. This action never touches that
 * table, so an organization already using a module keeps working
 * regardless of the module's own catalogue status.
 */
describe("toggleModuleAvailability", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireCurrentTenant.mockResolvedValue({ userId: "user-platform", organizationId: "platform-org" });
    mockIsPlatformOperator.mockReturnValue(true);
    mockGetServerAuthSession.mockResolvedValue({ user: { id: "user-platform" } });
    mockDb.module.findUnique.mockResolvedValue({ id: "module-1", code: "fleet", name: "Fleet Management" });
    mockDb.module.update.mockResolvedValue({ id: "module-1" });
  });

  it("rejects a non-platform-operator", async () => {
    mockIsPlatformOperator.mockReturnValue(false);
    const result = await toggleModuleAvailability(data({ moduleId: "module-1", available: "true" }));
    expect(result).toEqual({ ok: false, error: expect.any(String) });
    expect(mockDb.module.update).not.toHaveBeenCalled();
  });

  it("rejects a missing module id", async () => {
    const result = await toggleModuleAvailability(data({ moduleId: "", available: "true" }));
    expect(result.ok).toBe(false);
    expect(mockDb.module.update).not.toHaveBeenCalled();
  });

  it("rejects a module that does not exist", async () => {
    mockDb.module.findUnique.mockResolvedValue(null);
    const result = await toggleModuleAvailability(data({ moduleId: "module-1", available: "true" }));
    expect(result.ok).toBe(false);
    expect(mockDb.module.update).not.toHaveBeenCalled();
  });

  it("marks a module available by setting status to ACTIVE", async () => {
    const result = await toggleModuleAvailability(data({ moduleId: "module-1", available: "true" }));
    expect(result).toEqual({ ok: true });
    expect(mockDb.module.update).toHaveBeenCalledWith({ where: { id: "module-1" }, data: { status: "ACTIVE" } });
    expect(mockLogAuditEvent).toHaveBeenCalledWith(expect.objectContaining({ action: "module.marked_available", module: "platform" }));
  });

  it("marks a module unavailable by setting status to INACTIVE, never COMING_SOON", async () => {
    const result = await toggleModuleAvailability(data({ moduleId: "module-1", available: "false" }));
    expect(result).toEqual({ ok: true });
    expect(mockDb.module.update).toHaveBeenCalledWith({ where: { id: "module-1" }, data: { status: "INACTIVE" } });
    expect(mockLogAuditEvent).toHaveBeenCalledWith(expect.objectContaining({ action: "module.marked_unavailable", module: "platform" }));
  });
});
