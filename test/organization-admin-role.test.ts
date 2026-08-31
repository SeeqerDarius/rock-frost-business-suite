import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  class InvitationError extends Error {}
  return {
    InvitationError,
    requireCurrentTenant: vi.fn(),
    dbRoleFindFirst: vi.fn(),
    dbOrganizationMemberFindFirst: vi.fn(),
    dbOrganizationMemberFindUnique: vi.fn(),
    dbOrganizationMemberCount: vi.fn(),
    dbOrganizationMemberUpdate: vi.fn(),
    dbUserFindUnique: vi.fn(),
    dbTransaction: vi.fn(),
    redirect: vi.fn(),
    logAuditEvent: vi.fn(),
    isRoleAssignableToOrganization: vi.fn(),
    resolveAssignableModuleKeys: vi.fn(),
    roleDisplayName: vi.fn((name: string) => name),
    assertRoleHasAvailableSeats: vi.fn(),
    ensureFleetDriverForUser: vi.fn(),
    ensureFleetOwnerForUser: vi.fn(),
    ensureHrEmployeeForUser: vi.fn(),
    getServerAuthSession: vi.fn(),
    createInvitation: vi.fn(),
    resendInvitation: vi.fn(),
    revokeInvitation: vi.fn(),
    markInvitationDeliveryFailed: vi.fn(),
    sendEmail: vi.fn(),
    isPlatformUser: vi.fn(),
  };
});

class RedirectSignal extends Error {
  constructor(readonly location: string) {
    super(`redirect:${location}`);
  }
}

vi.mock("@/lib/tenant", () => ({ requireCurrentTenant: mocks.requireCurrentTenant }));
vi.mock("@/lib/db", () => ({
  db: {
    role: { findFirst: mocks.dbRoleFindFirst },
    organizationMember: {
      findFirst: mocks.dbOrganizationMemberFindFirst,
      findUnique: mocks.dbOrganizationMemberFindUnique,
      count: mocks.dbOrganizationMemberCount,
      update: mocks.dbOrganizationMemberUpdate,
    },
    user: { findUnique: mocks.dbUserFindUnique },
    $transaction: mocks.dbTransaction,
  },
}));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/audit", () => ({ logAuditEvent: mocks.logAuditEvent }));
vi.mock("@/lib/administration-roles", () => ({
  isRoleAssignableToOrganization: mocks.isRoleAssignableToOrganization,
  resolveAssignableModuleKeys: mocks.resolveAssignableModuleKeys,
  roleDisplayName: mocks.roleDisplayName,
}));
vi.mock("@/platform/subscriptions/seats", () => ({
  assertRoleHasAvailableSeats: mocks.assertRoleHasAvailableSeats,
  SeatLimitExceededError: class SeatLimitExceededError extends Error {},
}));
vi.mock("@/modules/fleet/service", () => ({
  ensureFleetDriverForUser: mocks.ensureFleetDriverForUser,
  ensureFleetOwnerForUser: mocks.ensureFleetOwnerForUser,
}));
vi.mock("@/modules/hr/service", () => ({ ensureHrEmployeeForUser: mocks.ensureHrEmployeeForUser }));
vi.mock("@/lib/auth/session", () => ({ getServerAuthSession: mocks.getServerAuthSession }));
vi.mock("@/lib/auth/invitations", () => ({
  createInvitation: mocks.createInvitation,
  resendInvitation: mocks.resendInvitation,
  revokeInvitation: mocks.revokeInvitation,
  markInvitationDeliveryFailed: mocks.markInvitationDeliveryFailed,
  InvitationError: mocks.InvitationError,
}));
vi.mock("@/lib/email", () => ({ sendEmail: mocks.sendEmail }));
vi.mock("@/lib/email-templates", () => ({ invitationEmail: vi.fn(() => ({ subject: "s", html: "h" })) }));
vi.mock("@/lib/app-url", () => ({ buildTenantAppUrl: vi.fn((path: string) => `https://example.test${path}`) }));
vi.mock("@/lib/auth/platform-identity", () => ({ isPlatformUser: mocks.isPlatformUser }));

const { inviteMember, changeMemberRole, deactivateMember, removeMember } = await import(
  "@/app/app/(overview)/administration/actions"
);
const { PERMISSIONS } = await import("@/lib/auth/permissions");
const { ROLE_PERMISSIONS, SYSTEM_ROLES, ALL_PERMISSIONS } = await import("../prisma/seed-data");

const ORG = "org-1";

function adminTenant() {
  return {
    organizationId: ORG,
    userId: "admin-user",
    enabledModuleKeys: [],
    permissions: [PERMISSIONS.ORG_MEMBERS_MANAGE],
    organization: { name: "Test Org" },
  };
}

function ownerTenant() {
  return {
    organizationId: ORG,
    userId: "owner-user",
    enabledModuleKeys: [],
    permissions: [PERMISSIONS.ORG_SETTINGS_MANAGE, PERMISSIONS.ORG_MEMBERS_MANAGE],
    organization: { name: "Test Org" },
  };
}

function expectRedirect(result: Promise<void>, location: string) {
  return expect(result).rejects.toMatchObject({ location });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.redirect.mockImplementation((location: string) => {
    throw new RedirectSignal(location);
  });
  mocks.isRoleAssignableToOrganization.mockReturnValue(true);
  mocks.resolveAssignableModuleKeys.mockResolvedValue([]);
  mocks.getServerAuthSession.mockResolvedValue({ user: { id: "actor-1" } });
  mocks.dbTransaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) =>
    fn({
      $executeRaw: vi.fn(),
      organizationMember: {
        findFirst: mocks.dbOrganizationMemberFindFirst,
        findUnique: mocks.dbOrganizationMemberFindUnique,
        update: mocks.dbOrganizationMemberUpdate,
        count: mocks.dbOrganizationMemberCount,
        upsert: vi.fn().mockResolvedValue({ id: "member-invited-1" }),
      },
      user: { upsert: vi.fn().mockResolvedValue({ id: "invitee-1" }) },
      invitation: { updateMany: vi.fn() },
    }),
  );
});

describe("Organization Admin role definition (Track 2)", () => {
  it("is seeded as a distinct system role", () => {
    expect(SYSTEM_ROLES.some((role) => role.name === "Organization Admin")).toBe(true);
  });

  it("holds every permission except ORG_SETTINGS_MANAGE", () => {
    const adminPermissions = ROLE_PERMISSIONS["Organization Admin"];
    expect(adminPermissions).not.toContain(PERMISSIONS.ORG_SETTINGS_MANAGE);
    expect(adminPermissions).toContain(PERMISSIONS.ORG_MEMBERS_MANAGE);
    expect(adminPermissions).toContain(PERMISSIONS.FLEET_MAINTENANCE_MANAGE);
    expect(adminPermissions).toContain(PERMISSIONS.ACCOUNTING_ACCOUNTS_MANAGE);
    // Every other permission that exists is included - only the one
    // deliberate carve-out is missing.
    const missing = ALL_PERMISSIONS.filter((key) => !adminPermissions.includes(key));
    expect(missing).toEqual([PERMISSIONS.ORG_SETTINGS_MANAGE]);
  });
});

describe("Organization Admin cannot escalate to Organization Owner (Track 2 security fix)", () => {
  it("inviteMember rejects assigning the Organization Owner role", async () => {
    mocks.requireCurrentTenant.mockResolvedValue(adminTenant());
    mocks.dbRoleFindFirst.mockResolvedValue({ id: "role-owner", name: "Organization Owner", rolePermissions: [] });
    mocks.dbUserFindUnique.mockResolvedValue(null);
    mocks.isPlatformUser.mockResolvedValue(false);

    const formData = new FormData();
    formData.set("name", "New Person");
    formData.set("email", "new.person@example.com");
    formData.set("roleId", "role-owner");

    await expectRedirect(inviteMember(formData), "/app/administration?error=invalid-role");
    expect(mocks.createInvitation).not.toHaveBeenCalled();
  });

  it("inviteMember still allows an Organization Owner to invite another Owner", async () => {
    mocks.requireCurrentTenant.mockResolvedValue(ownerTenant());
    mocks.dbRoleFindFirst.mockResolvedValue({ id: "role-owner", name: "Organization Owner", rolePermissions: [] });
    mocks.dbUserFindUnique.mockResolvedValue(null);
    mocks.isPlatformUser.mockResolvedValue(false);
    mocks.createInvitation.mockResolvedValue("token-1");
    mocks.sendEmail.mockResolvedValue({ ok: true });

    const formData = new FormData();
    formData.set("name", "New Owner");
    formData.set("email", "new.owner@example.com");
    formData.set("roleId", "role-owner");

    await expectRedirect(inviteMember(formData), "/app/administration?invited=1");
    expect(mocks.createInvitation).toHaveBeenCalled();
  });

  it("changeMemberRole rejects promoting a member to Organization Owner", async () => {
    mocks.requireCurrentTenant.mockResolvedValue(adminTenant());
    mocks.dbRoleFindFirst.mockResolvedValue({ id: "role-owner", name: "Organization Owner", rolePermissions: [] });

    const formData = new FormData();
    formData.set("membershipId", "clxxxxxxxxxxxxxxxxxxxxxxxx");
    formData.set("roleId", "clyyyyyyyyyyyyyyyyyyyyyyyy");

    await expectRedirect(changeMemberRole(formData), "/app/administration?error=invalid-role");
    expect(mocks.dbOrganizationMemberUpdate).not.toHaveBeenCalled();
  });

  it("changeMemberRole allows an Organization Owner to promote a member to Organization Owner", async () => {
    mocks.requireCurrentTenant.mockResolvedValue(ownerTenant());
    mocks.dbRoleFindFirst.mockResolvedValue({ id: "role-owner", name: "Organization Owner", rolePermissions: [] });
    mocks.dbOrganizationMemberFindFirst.mockResolvedValue({
      id: "member-1",
      roleId: "role-fleet-manager",
      role: { name: "Fleet Manager" },
      status: "ACTIVE",
      userId: "user-1",
      branchId: null,
      joinedAt: new Date(),
    });

    const formData = new FormData();
    formData.set("membershipId", "clxxxxxxxxxxxxxxxxxxxxxxxx");
    formData.set("roleId", "clyyyyyyyyyyyyyyyyyyyyyyyy");

    await expectRedirect(changeMemberRole(formData), "/app/administration?roleChanged=1");
    expect(mocks.dbOrganizationMemberUpdate).toHaveBeenCalledWith({ where: { id: "member-1" }, data: { roleId: "role-owner" } });
  });

  it("deactivateMember rejects deactivating an Organization Owner", async () => {
    mocks.requireCurrentTenant.mockResolvedValue(adminTenant());
    mocks.dbOrganizationMemberFindUnique.mockResolvedValue({ id: "actor-membership" });
    mocks.dbOrganizationMemberFindFirst.mockResolvedValue({
      id: "member-owner",
      status: "ACTIVE",
      role: { name: "Organization Owner" },
    });

    const formData = new FormData();
    formData.set("membershipId", "member-owner");

    await expectRedirect(deactivateMember(formData), "/app/administration?error=owner-protected");
    expect(mocks.dbOrganizationMemberUpdate).not.toHaveBeenCalled();
  });

  it("removeMember rejects removing an Organization Owner", async () => {
    mocks.requireCurrentTenant.mockResolvedValue(adminTenant());
    mocks.dbOrganizationMemberFindFirst.mockResolvedValue({
      id: "member-owner",
      status: "ACTIVE",
      userId: "some-other-user",
      role: { name: "Organization Owner" },
    });

    const formData = new FormData();
    formData.set("membershipId", "member-owner");

    await expectRedirect(removeMember(formData), "/app/administration?error=owner-protected");
    expect(mocks.dbOrganizationMemberUpdate).not.toHaveBeenCalled();
  });

  it("removeMember still allows an Organization Owner to remove another Owner (subject to the existing last-owner guard)", async () => {
    mocks.requireCurrentTenant.mockResolvedValue(ownerTenant());
    mocks.dbOrganizationMemberFindFirst.mockResolvedValue({
      id: "member-owner-2",
      status: "ACTIVE",
      userId: "some-other-owner",
      role: { name: "Organization Owner" },
    });
    mocks.dbOrganizationMemberCount.mockResolvedValue(2);

    const formData = new FormData();
    formData.set("membershipId", "member-owner-2");

    await expectRedirect(removeMember(formData), "/app/administration?removed=1");
    expect(mocks.dbOrganizationMemberUpdate).toHaveBeenCalledWith({ where: { id: "member-owner-2" }, data: { status: "REMOVED" } });
  });
});

describe("Organization Admin can otherwise manage members", () => {
  it("changeMemberRole allows an Admin to promote a member to a non-Owner role", async () => {
    mocks.requireCurrentTenant.mockResolvedValue(adminTenant());
    mocks.dbRoleFindFirst.mockResolvedValue({ id: "role-fleet-manager", name: "Fleet Manager", rolePermissions: [] });
    mocks.dbOrganizationMemberFindFirst.mockResolvedValue({
      id: "member-1",
      roleId: "role-driver",
      role: { name: "Driver" },
      status: "ACTIVE",
      userId: "user-1",
      branchId: null,
      joinedAt: new Date(),
    });

    const formData = new FormData();
    formData.set("membershipId", "clxxxxxxxxxxxxxxxxxxxxxxxx");
    formData.set("roleId", "clyyyyyyyyyyyyyyyyyyyyyyyy");

    await expectRedirect(changeMemberRole(formData), "/app/administration?roleChanged=1");
    expect(mocks.dbOrganizationMemberUpdate).toHaveBeenCalledWith({ where: { id: "member-1" }, data: { roleId: "role-fleet-manager" } });
  });

  it("deactivateMember allows an Admin to deactivate a non-Owner member", async () => {
    mocks.requireCurrentTenant.mockResolvedValue(adminTenant());
    mocks.dbOrganizationMemberFindUnique.mockResolvedValue({ id: "actor-membership" });
    mocks.dbOrganizationMemberFindFirst.mockResolvedValue({
      id: "member-driver",
      status: "ACTIVE",
      role: { name: "Driver" },
    });

    const formData = new FormData();
    formData.set("membershipId", "member-driver");

    await expectRedirect(deactivateMember(formData), "/app/administration?deactivated=1");
    expect(mocks.dbOrganizationMemberUpdate).toHaveBeenCalledWith({ where: { id: "member-driver" }, data: { status: "SUSPENDED" } });
  });
});
