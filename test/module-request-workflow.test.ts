import { beforeEach, describe, expect, it, vi } from "vitest";

const mockRequireCurrentTenant = vi.fn();
const mockHasPermission = vi.fn();
const mockIsPlatformOperator = vi.fn();
const mockCreateModuleRequest = vi.fn();
const mockUpdateModuleRequest = vi.fn();
const mockAddRequesterMessage = vi.fn();

class RedirectSignal extends Error {
  constructor(public url: string) {
    super(`redirect:${url}`);
  }
}

vi.mock("@/lib/tenant", () => ({ requireCurrentTenant: mockRequireCurrentTenant }));
vi.mock("@/lib/auth/permissions", () => ({
  hasPermission: mockHasPermission,
  isPlatformOperator: mockIsPlatformOperator,
  PERMISSIONS: { ORG_SETTINGS_MANAGE: "org.settings.manage" },
}));
vi.mock("@/platform/module-requests/service", () => ({
  createModuleRequest: mockCreateModuleRequest,
  updateModuleRequest: mockUpdateModuleRequest,
  addRequesterMessage: mockAddRequesterMessage,
}));
vi.mock("@/lib/db", () => ({
  db: {
    contactSubmission: { findFirst: vi.fn(), update: vi.fn() },
    organizationMember: { findFirst: vi.fn() },
  },
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new RedirectSignal(url);
  },
}));

const { submitModuleRequest } = await import("@/app/app/(overview)/module-requests/actions");
const { manageModuleRequest } = await import("@/app/app/platform/requests/actions");

function data(fields: Record<string, string>) {
  const formData = new FormData();
  for (const [key, value] of Object.entries(fields)) formData.set(key, value);
  return formData;
}

const tenant = {
  userId: "clh1234567890123456789012",
  organizationId: "clh2234567890123456789012",
};

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireCurrentTenant.mockResolvedValue(tenant);
  mockHasPermission.mockReturnValue(true);
  mockIsPlatformOperator.mockReturnValue(true);
  mockCreateModuleRequest.mockResolvedValue({ id: "request-1" });
  mockUpdateModuleRequest.mockResolvedValue({ id: "request-1" });
});

describe("module request workflow", () => {
  it("blocks tenant submission without organization-management permission", async () => {
    mockHasPermission.mockReturnValue(false);
    await expect(submitModuleRequest(new FormData())).rejects.toThrow("/app/modules?error=forbidden");
    expect(mockCreateModuleRequest).not.toHaveBeenCalled();
  });

  it("requires an existing module for an enable request", async () => {
    await expect(
      submitModuleRequest(data({
        type: "ENABLE_EXISTING",
        moduleId: "",
        title: "Enable Fleet",
        businessJustification: "We need to manage our vehicles.",
        customizationDetails: "",
        expectedUsers: "10",
      })),
    ).rejects.toThrow("module-required");
    expect(mockCreateModuleRequest).not.toHaveBeenCalled();
  });

  it("creates an organization-scoped custom module request", async () => {
    await expect(
      submitModuleRequest(data({
        type: "CUSTOM_MODULE",
        moduleId: "",
        title: "Cold-chain monitoring",
        businessJustification: "We need temperature-controlled delivery workflows.",
        customizationDetails: "Capture sensor readings and escalation approvals.",
        expectedUsers: "12",
      })),
    ).rejects.toThrow("submitted=1");

    expect(mockCreateModuleRequest).toHaveBeenCalledWith(expect.objectContaining({
      organizationId: tenant.organizationId,
      requestedById: tenant.userId,
      type: "CUSTOM_MODULE",
      expectedUsers: 12,
    }));
  });

  it("completes approve-and-enable so it leaves the active queue", async () => {
    await expect(
      manageModuleRequest(data({
        requestId: "clh3234567890123456789012",
        assignedToId: "",
        status: "SUBMITTED",
        priority: "NORMAL",
        note: "Approved for activation.",
        decisionReason: "",
        externalReference: "",
        enableModule: "true",
      })),
    ).rejects.toThrow("updated=1");

    expect(mockUpdateModuleRequest).toHaveBeenCalledWith(expect.objectContaining({
      status: "COMPLETED",
      enableModule: true,
    }));
  });
});
