import { describe, it, expect, vi, beforeEach } from "vitest";

const mockCookies = { get: vi.fn(() => undefined) };
const mockDb = {
  organizationMember: { findMany: vi.fn(), findFirst: vi.fn() },
  organizationModule: { findMany: vi.fn() },
};
const mockGetServerAuthSession = vi.fn();

vi.mock("@/lib/db", () => ({ db: mockDb }));
vi.mock("@/lib/auth/session", () => ({ getServerAuthSession: mockGetServerAuthSession }));
vi.mock("next/headers", () => ({ cookies: async () => mockCookies }));

const { getCurrentTenant } = await import("@/lib/tenant");

const ORG_ACTIVE = { id: "org-active", name: "Active Org", tenantCode: "active", status: "ACTIVE" };
const ORG_SUSPENDED = { id: "org-suspended", name: "Suspended Org", tenantCode: "suspended", status: "SUSPENDED" };

function membershipRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "mem-1",
    organizationId: ORG_ACTIVE.id,
    userId: "user-1",
    roleId: "role-1",
    status: "ACTIVE",
    organization: ORG_ACTIVE,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockCookies.get.mockReturnValue(undefined);
  mockDb.organizationModule.findMany.mockResolvedValue([]);
});

describe("getCurrentTenant — central active-tenant guard", () => {
  it("returns null when there is no session", async () => {
    mockGetServerAuthSession.mockResolvedValue(null);
    expect(await getCurrentTenant()).toBeNull();
  });

  it("denies access when the user's only membership is INVITED", async () => {
    mockGetServerAuthSession.mockResolvedValue({ user: { id: "user-1" } });
    mockDb.organizationMember.findMany.mockResolvedValue([membershipRow({ status: "INVITED" })]);

    expect(await getCurrentTenant()).toBeNull();
  });

  it("denies access when the user's only membership is SUSPENDED", async () => {
    mockGetServerAuthSession.mockResolvedValue({ user: { id: "user-1" } });
    mockDb.organizationMember.findMany.mockResolvedValue([membershipRow({ status: "SUSPENDED" })]);

    expect(await getCurrentTenant()).toBeNull();
  });

  it("denies access when the user's only membership is REMOVED", async () => {
    mockGetServerAuthSession.mockResolvedValue({ user: { id: "user-1" } });
    mockDb.organizationMember.findMany.mockResolvedValue([membershipRow({ status: "REMOVED" })]);

    expect(await getCurrentTenant()).toBeNull();
  });

  it("denies access when the membership is ACTIVE but the organization is SUSPENDED", async () => {
    mockGetServerAuthSession.mockResolvedValue({ user: { id: "user-1" } });
    mockDb.organizationMember.findMany.mockResolvedValue([
      membershipRow({ organizationId: ORG_SUSPENDED.id, organization: ORG_SUSPENDED }),
    ]);

    expect(await getCurrentTenant()).toBeNull();
  });

  it("grants access for a genuinely ACTIVE membership in an ACTIVE organization", async () => {
    mockGetServerAuthSession.mockResolvedValue({ user: { id: "user-1", organizationId: ORG_ACTIVE.id } });
    const row = membershipRow();
    mockDb.organizationMember.findMany.mockResolvedValue([row]);
    mockDb.organizationMember.findFirst.mockResolvedValue({
      ...row,
      branch: null,
      role: { name: "Member", rolePermissions: [] },
    });

    const tenant = await getCurrentTenant();
    expect(tenant).not.toBeNull();
    expect(tenant?.organizationId).toBe(ORG_ACTIVE.id);
    expect(mockDb.organizationModule.findMany).toHaveBeenCalledWith({
      where: { organizationId: ORG_ACTIVE.id, enabled: true, module: { status: "ACTIVE" } },
      include: { module: true },
    });
  });

  it("never selects an invalid membership as an implicit fallback, even when it sorts first", async () => {
    // The invalid (SUSPENDED) membership is first in creation order; the valid one is second.
    // The fix must not fall back to allMemberships[0] blindly — only the valid pool participates in fallback selection.
    mockGetServerAuthSession.mockResolvedValue({ user: { id: "user-1" } }); // no organizationId preference
    const invalid = membershipRow({ id: "mem-invalid", organizationId: "org-invalid", status: "SUSPENDED", organization: { ...ORG_ACTIVE, id: "org-invalid" } });
    const valid = membershipRow({ id: "mem-valid" });
    mockDb.organizationMember.findMany.mockResolvedValue([invalid, valid]);
    mockDb.organizationMember.findFirst.mockResolvedValue({
      ...valid,
      branch: null,
      role: { name: "Member", rolePermissions: [] },
    });

    const tenant = await getCurrentTenant();
    expect(tenant?.organizationId).toBe(ORG_ACTIVE.id);
    // Confirm the DB was only ever asked to resolve the valid org, never the invalid one.
    expect(mockDb.organizationMember.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ organizationId: ORG_ACTIVE.id }) }),
    );
  });
});
