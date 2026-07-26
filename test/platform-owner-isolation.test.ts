import { beforeEach, describe, expect, it, vi } from "vitest";

const cookieStore = { delete: vi.fn(), set: vi.fn() };
const mockGetServerAuthSession = vi.fn();
const mockFindPlatformMembership = vi.fn();
const mockDb = {
  organizationMember: { findFirst: vi.fn() },
};

class RedirectSignal extends Error {
  constructor(public url: string) {
    super(url);
  }
}

vi.mock("@/lib/db", () => ({ db: mockDb }));
vi.mock("@/lib/auth/session", () => ({ getServerAuthSession: mockGetServerAuthSession }));
vi.mock("@/lib/auth/platform-identity", () => ({ findPlatformMembership: mockFindPlatformMembership }));
vi.mock("next/headers", () => ({ cookies: async () => cookieStore }));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new RedirectSignal(url);
  },
}));

const { switchOrganization } = await import("@/lib/tenant/actions");

beforeEach(() => {
  vi.clearAllMocks();
  mockGetServerAuthSession.mockResolvedValue({ user: { id: "platform-user" } });
});

describe("platform owner isolation", () => {
  it("cannot switch into a tenant organization and clears a stale active-org cookie", async () => {
    mockFindPlatformMembership.mockResolvedValue({ id: "platform-membership", organizationId: "platform-org" });
    const formData = new FormData();
    formData.set("organizationId", "cm12345678901234567890123");

    await expect(switchOrganization(formData)).rejects.toMatchObject({ url: "/app/platform/dashboard" });
    expect(cookieStore.delete).toHaveBeenCalledWith("active_org");
    expect(mockDb.organizationMember.findFirst).not.toHaveBeenCalled();
  });
});
