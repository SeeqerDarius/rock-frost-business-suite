import { describe, it, expect, vi, beforeEach } from "vitest";

const mockCookies = { get: vi.fn(() => undefined) };
const mockDb = {
  organizationMember: { findMany: vi.fn(), findFirst: vi.fn() },
  organizationModule: { findMany: vi.fn() },
  subscription: { findMany: vi.fn() },
};
const mockGetServerAuthSession = vi.fn();

vi.mock("@/lib/db", () => ({ db: mockDb }));
vi.mock("@/lib/auth/session", () => ({ getServerAuthSession: mockGetServerAuthSession }));
vi.mock("next/headers", () => ({ cookies: async () => mockCookies }));

const { getCurrentTenant } = await import("@/lib/tenant");

const ORG = { id: "org-1", name: "Org", tenantCode: "org", status: "ACTIVE" };

beforeEach(() => {
  vi.clearAllMocks();
  mockDb.subscription.findMany.mockResolvedValue([]);
  mockCookies.get.mockReturnValue(undefined);
  mockGetServerAuthSession.mockResolvedValue({ user: { id: "user-1", organizationId: ORG.id } });
  mockDb.organizationMember.findMany.mockResolvedValue([
    { id: "mem-1", organizationId: ORG.id, userId: "user-1", roleId: "role-1", status: "ACTIVE", organization: ORG },
  ]);
});

/**
 * Regression test for the confirmed dashboard/module-launcher leak: a module
 * enabled for the organization but with no matching permission for the
 * current user must not appear in accessibleModuleKeys, even though it
 * legitimately appears in enabledModuleKeys (org-level enablement only).
 */
describe("accessibleModuleKeys — dashboard/module-launcher permission leak fix", () => {
  it("excludes an enabled module the user has no permission for", async () => {
    mockDb.organizationMember.findFirst.mockResolvedValue({
      id: "mem-1",
      organizationId: ORG.id,
      roleId: "role-1",
      organization: ORG,
      branch: null,
      role: { name: "Limited", rolePermissions: [{ permission: { key: "crm.view" } }] },
    });
    // Accounting is enabled for the org, but this user's role only holds crm.view.
    mockDb.organizationModule.findMany.mockResolvedValue([
      { module: { code: "accounting" } },
      { module: { code: "crm" } },
    ]);

    const tenant = await getCurrentTenant();
    expect(tenant?.enabledModuleKeys).toEqual(expect.arrayContaining(["accounting", "crm"]));
    expect(tenant?.accessibleModuleKeys).not.toContain("accounting");
    expect(tenant?.accessibleModuleKeys).toContain("crm");
  });

  it("includes an enabled module the user does hold a permission for", async () => {
    mockDb.organizationMember.findFirst.mockResolvedValue({
      id: "mem-1",
      organizationId: ORG.id,
      roleId: "role-1",
      organization: ORG,
      branch: null,
      role: { name: "Accountant", rolePermissions: [{ permission: { key: "accounting.reports.view" } }] },
    });
    mockDb.organizationModule.findMany.mockResolvedValue([{ module: { code: "accounting" } }]);

    const tenant = await getCurrentTenant();
    expect(tenant?.accessibleModuleKeys).toContain("accounting");
  });
});
