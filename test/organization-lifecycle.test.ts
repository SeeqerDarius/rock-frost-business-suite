import { beforeEach, describe, expect, it, vi } from "vitest";

const mockRequireCurrentTenant = vi.fn();
const mockIsPlatformOperator = vi.fn();
const mockVerifyCurrentPassword = vi.fn();
const mockLogAuditEvent = vi.fn();

const tx = {
  organization: {
    findUnique: vi.fn(),
    update: vi.fn(),
    deleteMany: vi.fn(),
    create: vi.fn(),
  },
  user: { upsert: vi.fn() },
  organizationMember: { create: vi.fn() },
};

const mockDb = {
  organization: { findUnique: vi.fn(), findFirst: vi.fn() },
  organizationMember: { findFirst: vi.fn() },
  role: { findFirst: vi.fn() },
  $transaction: vi.fn(async (callback: (client: typeof tx) => unknown) => callback(tx)),
};

class RedirectSignal extends Error {
  constructor(public url: string) {
    super(`redirect:${url}`);
  }
}

vi.mock("@/lib/db", () => ({ db: mockDb }));
vi.mock("@/lib/tenant", () => ({ requireCurrentTenant: mockRequireCurrentTenant }));
vi.mock("@/lib/auth/permissions", () => ({ isPlatformOperator: mockIsPlatformOperator }));
vi.mock("@/lib/auth/verify-password", () => ({ verifyCurrentPassword: mockVerifyCurrentPassword }));
vi.mock("@/lib/audit", () => ({ logAuditEvent: mockLogAuditEvent }));
vi.mock("@/lib/auth/invitations", () => ({
  createInvitation: vi.fn(),
  markInvitationDeliveryFailed: vi.fn(),
}));
vi.mock("@/lib/email", () => ({ sendEmail: vi.fn() }));
vi.mock("@/lib/app-url", () => ({ buildAppUrl: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new RedirectSignal(url);
  },
}));

const {
  permanentlyDeleteOrganization,
  scheduleOrganizationDeletion,
  updateOrganizationStatus,
} = await import("@/app/app/platform/organizations/actions");

const tenant = {
  userId: "user-platform",
  organizationId: "platform-org",
};

function data(fields: Record<string, string>) {
  const formData = new FormData();
  for (const [key, value] of Object.entries(fields)) formData.set(key, value);
  return formData;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireCurrentTenant.mockResolvedValue(tenant);
  mockIsPlatformOperator.mockReturnValue(true);
  mockVerifyCurrentPassword.mockResolvedValue(true);
  mockDb.organizationMember.findFirst.mockResolvedValue(null);
  mockDb.organization.findUnique.mockResolvedValue({
    id: "target-org",
    name: "Target",
    tenantCode: "target-org",
    status: "ACTIVE",
    deletionScheduledFor: null,
  });
  tx.organization.findUnique.mockResolvedValue({
    id: "target-org",
    status: "ACTIVE",
    deletionScheduledFor: null,
  });
  tx.organization.update.mockResolvedValue({ id: "target-org" });
  tx.organization.deleteMany.mockResolvedValue({ count: 1 });
});

describe("platform organization lifecycle", () => {
  it("rejects organization status changes from a non-platform user", async () => {
    mockIsPlatformOperator.mockReturnValue(false);
    await expect(
      updateOrganizationStatus(data({ organizationId: "target-org", status: "SUSPENDED" })),
    ).rejects.toThrow("/app/dashboard");
    expect(mockDb.$transaction).not.toHaveBeenCalled();
  });

  it("protects an organization containing an active system Super Admin", async () => {
    mockDb.organizationMember.findFirst.mockResolvedValue({ id: "platform-membership" });
    await expect(
      updateOrganizationStatus(data({ organizationId: "target-org", status: "SUSPENDED" })),
    ).rejects.toThrow("platform-anchor");
    expect(mockDb.$transaction).not.toHaveBeenCalled();
  });

  it("requires the current password before scheduling deletion", async () => {
    mockVerifyCurrentPassword.mockResolvedValue(false);
    await expect(
      scheduleOrganizationDeletion(data({
        organizationId: "target-org",
        confirmTenantCode: "target-org",
        confirmPassword: "wrong",
      })),
    ).rejects.toThrow("wrong-password");
    expect(mockDb.$transaction).not.toHaveBeenCalled();
  });

  it("schedules deletion instead of immediately deleting tenant data", async () => {
    await expect(
      scheduleOrganizationDeletion(data({
        organizationId: "target-org",
        confirmTenantCode: "target-org",
        confirmPassword: "correct",
      })),
    ).rejects.toThrow("deletion=scheduled");

    expect(tx.organization.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        status: "CANCELLED",
        deletionPreviousStatus: "ACTIVE",
        deletionScheduledFor: expect.any(Date),
      }),
    }));
    expect(tx.organization.deleteMany).not.toHaveBeenCalled();
  });

  it("refuses permanent deletion before the recovery deadline", async () => {
    mockDb.organization.findUnique.mockResolvedValue({
      id: "target-org",
      name: "Target",
      tenantCode: "target-org",
      status: "CANCELLED",
      deletionScheduledFor: new Date(Date.now() + 60_000),
    });
    await expect(
      permanentlyDeleteOrganization(data({
        organizationId: "target-org",
        confirmTenantCode: "target-org",
        confirmPassword: "correct",
      })),
    ).rejects.toThrow("not-ready");
    expect(tx.organization.deleteMany).not.toHaveBeenCalled();
  });

  it("preserves a platform-level audit record when permanent deletion becomes eligible", async () => {
    mockDb.organization.findUnique.mockResolvedValue({
      id: "target-org",
      name: "Target",
      tenantCode: "target-org",
      status: "CANCELLED",
      deletionScheduledFor: new Date(Date.now() - 60_000),
    });
    await expect(
      permanentlyDeleteOrganization(data({
        organizationId: "target-org",
        confirmTenantCode: "target-org",
        confirmPassword: "correct",
      })),
    ).rejects.toThrow("deleted=1");
    expect(tx.organization.deleteMany).toHaveBeenCalled();
    expect(mockLogAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId: null, action: "organization.permanently_deleted" }),
      tx,
    );
  });
});

