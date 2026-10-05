import { beforeEach, describe, expect, it, vi } from "vitest";

const moduleFindMany = vi.fn();
const moduleFindUnique = vi.fn();
const requestCreate = vi.fn();
const mockLogAuditEvent = vi.fn();

const tx = {
  moduleRequest: { create: requestCreate },
  contactSubmission: { update: vi.fn() },
};

vi.mock("@/lib/db", () => ({
  db: {
    module: { findMany: moduleFindMany, findUnique: moduleFindUnique },
    $transaction: (callback: (client: typeof tx) => unknown) => callback(tx),
  },
}));
vi.mock("@/lib/audit", () => ({ logAuditEvent: mockLogAuditEvent }));
vi.mock("@/lib/accounting-integration", () => ({ ensureRevenueAccountsForOrg: vi.fn() }));
vi.mock("@/platform/trials/service", () => ({ assertTrialProductLimit: vi.fn() }));

const { createModuleRequestsForModules, moduleScopedTitle } = await import("@/platform/module-requests/service");

const base = {
  organizationId: "org-1",
  requestedById: "user-1",
  type: "ENABLE_EXISTING" as const,
  title: "Enable operations modules",
  businessJustification: "Moving fleet and stock onto the platform.",
};

beforeEach(() => {
  vi.clearAllMocks();
  let counter = 0;
  requestCreate.mockImplementation(async ({ data }: { data: { title: string; moduleId: string | null } }) => ({
    id: `request-${++counter}`,
    ...data,
  }));
});

describe("multi-module requests", () => {
  it("creates one request per selected module with module-scoped titles", async () => {
    moduleFindMany.mockResolvedValue([
      { id: "mod-fleet", name: "Fleet" },
      { id: "mod-inventory", name: "Inventory" },
    ]);

    const requests = await createModuleRequestsForModules({ ...base, moduleIds: ["mod-fleet", "mod-inventory", "mod-fleet"] });

    expect(requests).toHaveLength(2);
    expect(requestCreate).toHaveBeenCalledTimes(2);
    expect(requestCreate.mock.calls.map(([args]) => [args.data.moduleId, args.data.title])).toEqual([
      ["mod-fleet", "Enable operations modules (Fleet)"],
      ["mod-inventory", "Enable operations modules (Inventory)"],
    ]);
    expect(mockLogAuditEvent).toHaveBeenCalledTimes(2);
  });

  it("keeps the requester's title unchanged for a single module", async () => {
    moduleFindMany.mockResolvedValue([{ id: "mod-fleet", name: "Fleet" }]);

    await createModuleRequestsForModules({ ...base, moduleIds: ["mod-fleet"] });

    expect(requestCreate.mock.calls[0][0].data).toMatchObject({ moduleId: "mod-fleet", title: base.title });
  });

  it("rejects the whole submission when any selected module does not exist", async () => {
    moduleFindMany.mockResolvedValue([{ id: "mod-fleet", name: "Fleet" }]);

    await expect(createModuleRequestsForModules({ ...base, moduleIds: ["mod-fleet", "mod-missing"] })).rejects.toThrow(
      "A selected module does not exist.",
    );
    expect(requestCreate).not.toHaveBeenCalled();
  });

  it("creates a single module-less request when nothing is selected", async () => {
    const requests = await createModuleRequestsForModules({ ...base, type: "CUSTOM_MODULE", moduleIds: [] });

    expect(requests).toHaveLength(1);
    expect(requestCreate.mock.calls[0][0].data).toMatchObject({ moduleId: null, title: base.title });
    expect(moduleFindMany).not.toHaveBeenCalled();
  });

  it("keeps module-scoped titles within the 200 character limit", () => {
    const title = moduleScopedTitle("x".repeat(200), "Inventory and Procurement");
    expect(title.length).toBeLessThanOrEqual(200);
    expect(title.endsWith("... (Inventory and Procurement)")).toBe(true);
  });
});
