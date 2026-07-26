import { describe, it, expect, vi, beforeEach } from "vitest";

const mockDb = {
  user: { findUnique: vi.fn() },
};

vi.mock("@/lib/db", () => ({ db: mockDb }));
vi.mock("bcryptjs", () => ({ default: { compare: vi.fn(), hash: vi.fn() } }));

const { authOptions } = await import("@/lib/auth/nextauth");

const jwtCallback = authOptions.callbacks!.jwt!;

beforeEach(() => {
  vi.clearAllMocks();
});

/**
 * Regression tests for §2 of docs/HARDENING_PLAN.md: a JWT minted before a
 * password reset (or user suspension) must stop working on its very next
 * use, not linger for up to 30 days.
 */
describe("nextauth jwt callback — session revocation", () => {
  it("uses a host-only session cookie so admin and tenant sessions remain independent", () => {
    const sessionCookie = authOptions.cookies?.sessionToken;
    expect(sessionCookie?.options.domain).toBeUndefined();
    expect(sessionCookie?.options.path).toBe("/");
    expect(sessionCookie?.options.httpOnly).toBe(true);
  });

  it("accepts redirects only to trusted application origins", async () => {
    const redirectCallback = authOptions.callbacks!.redirect!;
    await expect(redirectCallback({
      url: "https://admin.rockfrostgroup.com/app/platform/dashboard",
      baseUrl: "https://www.rockfrostgroup.com",
    })).resolves.toBe("https://admin.rockfrostgroup.com/app/platform/dashboard");
    await expect(redirectCallback({
      url: "https://attacker.example/phishing",
      baseUrl: "https://www.rockfrostgroup.com",
    })).resolves.toBe("https://www.rockfrostgroup.com");
  });

  it("stores sessionVersion on initial sign-in", async () => {
    const token = await jwtCallback({
      token: {},
      user: { id: "user-1", name: "A", email: "a@example.com", sessionVersion: 3 },
    } as never);

    expect(token.user?.sessionVersion).toBe(3);
  });

  it("clears the session when the DB sessionVersion no longer matches the token's", async () => {
    mockDb.user.findUnique.mockResolvedValue({ status: "ACTIVE", sessionVersion: 4 });

    const token = await jwtCallback({
      token: { user: { id: "user-1", sessionVersion: 3 } },
    } as never);

    expect(token.user).toBeUndefined();
  });

  it("keeps the session when the DB sessionVersion still matches the token's", async () => {
    mockDb.user.findUnique.mockResolvedValue({
      status: "ACTIVE",
      sessionVersion: 3,
      organizationMemberships: [],
    });

    const token = await jwtCallback({
      token: { user: { id: "user-1", sessionVersion: 3 } },
    } as never);

    expect(token.user?.id).toBe("user-1");
  });

  it("clears the session when the user is no longer ACTIVE, even with a matching sessionVersion", async () => {
    mockDb.user.findUnique.mockResolvedValue({ status: "SUSPENDED", sessionVersion: 3 });

    const token = await jwtCallback({
      token: { user: { id: "user-1", sessionVersion: 3 } },
    } as never);

    expect(token.user).toBeUndefined();
  });

  it("clears the session when the user no longer exists", async () => {
    mockDb.user.findUnique.mockResolvedValue(null);

    const token = await jwtCallback({
      token: { user: { id: "user-1", sessionVersion: 3 } },
    } as never);

    expect(token.user).toBeUndefined();
  });
});
