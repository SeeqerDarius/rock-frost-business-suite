import { beforeEach, describe, expect, it, vi } from "vitest";

const mockRequireCurrentTenant = vi.fn();
const mockIsPlatformOperator = vi.fn();
const mockGetServerAuthSession = vi.fn();
const mockLogAuditEvent = vi.fn();

const mockDb = {
  organization: { findUnique: vi.fn(), update: vi.fn() },
};

vi.mock("@/lib/db", () => ({ db: mockDb }));
vi.mock("@/lib/tenant", () => ({ requireCurrentTenant: mockRequireCurrentTenant }));
vi.mock("@/lib/auth/permissions", () => ({ isPlatformOperator: mockIsPlatformOperator }));
vi.mock("@/lib/auth/session", () => ({ getServerAuthSession: mockGetServerAuthSession }));
vi.mock("@/lib/audit", () => ({ logAuditEvent: mockLogAuditEvent }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/platform/modules/product-groups", () => ({ productGroupKeys: vi.fn(() => []) }));
vi.mock("@/modules/hr/service", () => ({ syncActiveOrganizationMembersToHr: vi.fn() }));
vi.mock("@/lib/accounting-integration", () => ({ ensureRevenueAccountsForOrg: vi.fn() }));
vi.mock("@/platform/trials/service", () => ({ assertTrialProductLimit: vi.fn(), TrialProductLimitError: class extends Error {} }));

const { toggleOrganizationSmsNotifications, toggleSchoolPortalAccess } = await import("@/app/app/platform/actions");

function data(fields: Record<string, string>) {
  const formData = new FormData();
  for (const [key, value] of Object.entries(fields)) formData.set(key, value);
  return formData;
}

/**
 * Both SMS notifications and the School Parent/Student portal are paid
 * add-ons a platform operator grants to one organization at a time - same
 * shape and same operator-only gate as toggleOrganizationOfflineAccess
 * (test/platform-offline-access-grant.test.ts). sendSms()
 * (src/lib/sms.ts) and the School portal pages/actions read the grant this
 * sets, never a single platform-wide flag.
 */
describe.each([
  {
    name: "toggleOrganizationSmsNotifications",
    action: () => toggleOrganizationSmsNotifications,
    grantedField: "smsNotificationsGranted",
    grantedAtField: "smsNotificationsGrantedAt",
    grantedByIdField: "smsNotificationsGrantedById",
    grantedAction: "sms_notifications.platform_granted",
    revokedAction: "sms_notifications.platform_revoked",
  },
  {
    name: "toggleSchoolPortalAccess",
    action: () => toggleSchoolPortalAccess,
    grantedField: "schoolPortalGranted",
    grantedAtField: "schoolPortalGrantedAt",
    grantedByIdField: "schoolPortalGrantedById",
    grantedAction: "school_portal.platform_granted",
    revokedAction: "school_portal.platform_revoked",
  },
])("$name", ({ action, grantedField, grantedAtField, grantedByIdField, grantedAction, revokedAction }) => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireCurrentTenant.mockResolvedValue({ userId: "user-platform", organizationId: "platform-org" });
    mockIsPlatformOperator.mockReturnValue(true);
    mockGetServerAuthSession.mockResolvedValue({ user: { id: "user-platform" } });
    mockDb.organization.findUnique.mockResolvedValue({ id: "target-org", name: "Target" });
    mockDb.organization.update.mockResolvedValue({ id: "target-org" });
  });

  it("rejects a non-platform-operator", async () => {
    mockIsPlatformOperator.mockReturnValue(false);
    const result = await action()(data({ organizationId: "target-org", granted: "true" }));
    expect(result).toEqual({ ok: false, error: expect.any(String) });
    expect(mockDb.organization.update).not.toHaveBeenCalled();
  });

  it("rejects a missing organization id", async () => {
    const result = await action()(data({ organizationId: "", granted: "true" }));
    expect(result.ok).toBe(false);
    expect(mockDb.organization.update).not.toHaveBeenCalled();
  });

  it("rejects an organization that does not exist", async () => {
    mockDb.organization.findUnique.mockResolvedValue(null);
    const result = await action()(data({ organizationId: "target-org", granted: "true" }));
    expect(result.ok).toBe(false);
    expect(mockDb.organization.update).not.toHaveBeenCalled();
  });

  it("grants access, stamping who and when", async () => {
    const result = await action()(data({ organizationId: "target-org", granted: "true" }));
    expect(result).toEqual({ ok: true });
    expect(mockDb.organization.update).toHaveBeenCalledWith({
      where: { id: "target-org" },
      data: {
        [grantedField]: true,
        [grantedAtField]: expect.any(Date),
        [grantedByIdField]: "user-platform",
      },
    });
    expect(mockLogAuditEvent).toHaveBeenCalledWith(expect.objectContaining({ action: grantedAction, module: "platform" }));
  });

  it("revokes access, clearing the grant stamp rather than merely flipping a flag", async () => {
    const result = await action()(data({ organizationId: "target-org", granted: "false" }));
    expect(result).toEqual({ ok: true });
    expect(mockDb.organization.update).toHaveBeenCalledWith({
      where: { id: "target-org" },
      data: {
        [grantedField]: false,
        [grantedAtField]: null,
        [grantedByIdField]: null,
      },
    });
    expect(mockLogAuditEvent).toHaveBeenCalledWith(expect.objectContaining({ action: revokedAction, module: "platform" }));
  });
});
