import { describe, expect, it, vi, beforeEach } from "vitest";
import type { TenantContext } from "@/lib/tenant";
import type { OfflineMutationInput } from "@/lib/offline-sync/contract";

/**
 * Regression tests for the milestone 4 POS offline adapters
 * (src/lib/offline-sync/modules/pos.adapters.ts): permission gating per
 * action, the pos.register UPDATE staleness check (the desktop expansion's
 * first real optimistic-concurrency case), and that every new action calls
 * the exact same @/modules/pos/service function the web UI calls -
 * exercised through the real dispatcher (applyOfflineMutation), not a
 * fake registry handler, since these entity types are now genuinely wired.
 */

const mockPosService = {
  createRegister: vi.fn(),
  updateRegister: vi.fn(),
  openSession: vi.fn(),
  closeSession: vi.fn(),
  createSale: vi.fn(),
  refundSale: vi.fn(),
  updateSettings: vi.fn(),
  updateSaleNumberPrefix: vi.fn(),
};

const mockDb = {
  posRegister: { findFirst: vi.fn() },
  posSettings: { findUnique: vi.fn() },
  organizationModule: { findFirst: vi.fn() },
};

vi.mock("@/modules/pos/service", () => mockPosService);
vi.mock("@/lib/db", () => ({ db: mockDb }));
// Only pos.adapters.ts is under test; the other 3 modules' adapters import
// real service functions too, but this file never exercises their entity
// types, so no further mocking is needed for applyOfflineMutation to load.

const { applyOfflineMutation, OfflineMutationDeniedError } = await import("@/lib/offline-sync/adapters");

function tenant(permissions: string[]): TenantContext {
  return { organizationId: "org-1", userId: "user-1", enabledModuleKeys: ["pos"], permissions } as unknown as TenantContext;
}

function mutation(overrides: Partial<OfflineMutationInput> & { entityType: string; operation: "CREATE" | "UPDATE" }): OfflineMutationInput {
  return {
    mutationId: "3b12f1df-5232-4804-897e-917bf397618a",
    organizationId: "org-1",
    moduleKey: "pos",
    entityId: "e1",
    baseVersion: 0,
    changedAt: new Date("2026-08-16T00:00:00.000Z"),
    payload: {},
    ...overrides,
  } as OfflineMutationInput;
}

const ALL_POS_PERMISSIONS = ["pos.registers.manage", "pos.sessions.manage", "pos.sales.manage", "pos.settings.manage"];

beforeEach(() => {
  vi.clearAllMocks();
});

describe("pos.register", () => {
  it("CREATE requires pos.registers.manage and calls createRegister", async () => {
    mockPosService.createRegister.mockResolvedValue({ id: "r1", name: "Front" });
    const result = await applyOfflineMutation(
      tenant(ALL_POS_PERMISSIONS),
      mutation({ entityType: "pos.register", operation: "CREATE", payload: { name: "Front", warehouseId: null } }),
    );
    expect(mockPosService.createRegister).toHaveBeenCalledWith("org-1", { name: "Front", warehouseId: null });
    expect(result).toEqual({ id: "r1", name: "Front" });
  });

  it("CREATE is denied without pos.registers.manage, and createRegister is never called", async () => {
    await expect(
      applyOfflineMutation(tenant([]), mutation({ entityType: "pos.register", operation: "CREATE", payload: { name: "Front" } })),
    ).rejects.toBeInstanceOf(OfflineMutationDeniedError);
    expect(mockPosService.createRegister).not.toHaveBeenCalled();
  });

  it("UPDATE rejects a stale baseVersion as a conflict without calling updateRegister", async () => {
    mockDb.posRegister.findFirst.mockResolvedValue({ updatedAt: new Date("2026-08-16T00:00:00.000Z") });
    await expect(
      applyOfflineMutation(
        tenant(ALL_POS_PERMISSIONS),
        mutation({ entityType: "pos.register", operation: "UPDATE", entityId: "r1", baseVersion: 1, payload: { name: "Renamed" } }),
      ),
    ).rejects.toMatchObject({ conflictType: "STALE_VERSION" });
    expect(mockPosService.updateRegister).not.toHaveBeenCalled();
  });

  it("UPDATE succeeds and calls updateRegister when baseVersion matches the current server version", async () => {
    const updatedAt = new Date("2026-08-16T00:00:00.000Z");
    mockDb.posRegister.findFirst.mockResolvedValue({ updatedAt });
    mockPosService.updateRegister.mockResolvedValue({ id: "r1", name: "Renamed" });
    const result = await applyOfflineMutation(
      tenant(ALL_POS_PERMISSIONS),
      mutation({ entityType: "pos.register", operation: "UPDATE", entityId: "r1", baseVersion: updatedAt.getTime(), payload: { name: "Renamed" } }),
    );
    expect(mockPosService.updateRegister).toHaveBeenCalledWith("org-1", "r1", { name: "Renamed" });
    expect(result).toEqual({ id: "r1", name: "Renamed" });
  });

  it("UPDATE against a register that no longer exists conflicts as ENTITY_DELETED", async () => {
    mockDb.posRegister.findFirst.mockResolvedValue(null);
    await expect(
      applyOfflineMutation(
        tenant(ALL_POS_PERMISSIONS),
        mutation({ entityType: "pos.register", operation: "UPDATE", entityId: "gone", baseVersion: 0, payload: { name: "X" } }),
      ),
    ).rejects.toMatchObject({ conflictType: "ENTITY_DELETED" });
  });
});

describe("pos.session_open / pos.session_close", () => {
  it("session_open requires pos.sessions.manage and calls openSession with the acting user as opener", async () => {
    mockPosService.openSession.mockResolvedValue({ id: "sess1", status: "OPEN" });
    const result = await applyOfflineMutation(
      tenant(ALL_POS_PERMISSIONS),
      mutation({ entityType: "pos.session_open", operation: "CREATE", payload: { registerId: "r1", openingFloat: "50.00" } }),
    );
    expect(mockPosService.openSession).toHaveBeenCalledWith("org-1", { registerId: "r1", openingFloat: "50.00", openedById: "user-1" });
    expect(result).toEqual({ id: "sess1", status: "OPEN" });
  });

  it("session_close carries the real sessionId in the payload, not the mutation's own client-generated entityId", async () => {
    mockPosService.closeSession.mockResolvedValue({ id: "sess1", status: "CLOSED" });
    await applyOfflineMutation(
      tenant(ALL_POS_PERMISSIONS),
      mutation({ entityType: "pos.session_close", operation: "CREATE", entityId: "local-correlation-id", payload: { sessionId: "sess1", closingCash: "40.00" } }),
    );
    expect(mockPosService.closeSession).toHaveBeenCalledWith("org-1", "sess1", { closingCash: "40.00", closedById: "user-1" });
  });

  it("both are denied without pos.sessions.manage", async () => {
    await expect(
      applyOfflineMutation(tenant(["pos.sales.manage"]), mutation({ entityType: "pos.session_open", operation: "CREATE", payload: { registerId: "r1", openingFloat: "0" } })),
    ).rejects.toBeInstanceOf(OfflineMutationDeniedError);
  });
});

describe("pos.sale_refund", () => {
  it("requires pos.sales.manage (the same permission that authorizes creating a sale) and calls refundSale", async () => {
    mockPosService.refundSale.mockResolvedValue({ id: "sale1", status: "REFUNDED" });
    const result = await applyOfflineMutation(
      tenant(ALL_POS_PERMISSIONS),
      mutation({ entityType: "pos.sale_refund", operation: "CREATE", payload: { saleId: "sale1" } }),
    );
    expect(mockPosService.refundSale).toHaveBeenCalledWith("org-1", "sale1", "user-1");
    expect(result).toEqual({ id: "sale1", status: "REFUNDED" });
  });

  it("a refund that no longer applies (already refunded) surfaces as a conflict, not a silent success", async () => {
    class SaleStateError extends Error {}
    mockPosService.refundSale.mockRejectedValue(new SaleStateError("Only completed sales can be refunded."));
    await expect(
      applyOfflineMutation(tenant(ALL_POS_PERMISSIONS), mutation({ entityType: "pos.sale_refund", operation: "CREATE", payload: { saleId: "sale1" } })),
    ).rejects.toMatchObject({ conflictType: "SERVER_STATE_CHANGED" });
  });

  it("is denied without pos.sales.manage", async () => {
    await expect(
      applyOfflineMutation(tenant(["pos.sessions.manage"]), mutation({ entityType: "pos.sale_refund", operation: "CREATE", payload: { saleId: "sale1" } })),
    ).rejects.toBeInstanceOf(OfflineMutationDeniedError);
  });
});

describe("pos.settings_receipt_footer / pos.settings_sale_prefix", () => {
  it("receipt footer UPDATE treats a missing PosSettings row as version 0 (never configured), not ENTITY_DELETED", async () => {
    mockDb.posSettings.findUnique.mockResolvedValue(null);
    mockPosService.updateSettings.mockResolvedValue({ receiptFooterText: "Thanks!" });
    const result = await applyOfflineMutation(
      tenant(ALL_POS_PERMISSIONS),
      mutation({ entityType: "pos.settings_receipt_footer", operation: "UPDATE", entityId: "default", baseVersion: 0, payload: { receiptFooterText: "Thanks!" } }),
    );
    expect(mockPosService.updateSettings).toHaveBeenCalledWith("org-1", "Thanks!");
    expect(result).toEqual({ receiptFooterText: "Thanks!" });
  });

  it("sale prefix UPDATE reads its version from the OrganizationModule configuration row's own updatedAt, not PosSettings", async () => {
    const updatedAt = new Date("2026-08-16T00:00:00.000Z");
    mockDb.organizationModule.findFirst.mockResolvedValue({ updatedAt });
    const result = await applyOfflineMutation(
      tenant(ALL_POS_PERMISSIONS),
      mutation({ entityType: "pos.settings_sale_prefix", operation: "UPDATE", entityId: "default", baseVersion: updatedAt.getTime(), payload: { saleNumberPrefix: "SL" } }),
    );
    expect(mockDb.organizationModule.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { organizationId: "org-1", module: { code: "pos" } } }),
    );
    expect(mockPosService.updateSaleNumberPrefix).toHaveBeenCalledWith("org-1", "SL", "user-1");
    expect(result).toEqual({ saleNumberPrefix: "SL" });
  });

  it("both settings updates are denied without pos.settings.manage", async () => {
    await expect(
      applyOfflineMutation(tenant(["pos.sales.manage"]), mutation({ entityType: "pos.settings_receipt_footer", operation: "UPDATE", entityId: "default", payload: { receiptFooterText: null } })),
    ).rejects.toBeInstanceOf(OfflineMutationDeniedError);
  });
});
