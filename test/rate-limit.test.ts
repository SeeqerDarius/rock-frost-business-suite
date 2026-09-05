import { describe, expect, it, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const mockDb = { $queryRaw: vi.fn() };
vi.mock("@/lib/db", () => ({ db: mockDb }));

const mockGetToken = vi.fn();
vi.mock("next-auth/jwt", () => ({ getToken: (...args: unknown[]) => mockGetToken(...args) }));

const { checkRateLimit } = await import("@/lib/rate-limit");

function request(path: string, init?: { method?: string; ip?: string }) {
  return new NextRequest(`https://app.rockfrostgroup.com${path}`, {
    method: init?.method ?? "POST",
    headers: init?.ip ? { "x-forwarded-for": init.ip } : {},
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockGetToken.mockResolvedValue(null);
});

describe("checkRateLimit", () => {
  it("allows a request under the cap and keys unauthenticated traffic by IP", async () => {
    mockDb.$queryRaw.mockResolvedValue([{ count: 1 }]);
    const result = await checkRateLimit(request("/some-action", { ip: "203.0.113.4" }), {
      tier: "general",
      isApiRoute: false,
    });
    expect(result).toBeNull();
    const [strings] = mockDb.$queryRaw.mock.calls[0];
    expect(strings.join("")).toContain("INSERT INTO \"RateLimitBucket\"");
  });

  it("keys authenticated traffic by user id instead of IP", async () => {
    mockGetToken.mockResolvedValue({ user: { id: "user-42" } });
    mockDb.$queryRaw.mockResolvedValue([{ count: 1 }]);
    await checkRateLimit(request("/some-action", { ip: "203.0.113.4" }), { tier: "general", isApiRoute: false });
    const values = mockDb.$queryRaw.mock.calls[0].slice(1);
    expect(values[0]).toBe("general:user:user-42");
  });

  it("blocks once the count exceeds the tier cap, with a text/plain body for a Server Action", async () => {
    mockDb.$queryRaw.mockResolvedValue([{ count: 301 }]);
    const result = await checkRateLimit(request("/some-action"), { tier: "general", isApiRoute: false });
    expect(result).not.toBeNull();
    expect(result!.status).toBe(429);
    expect(result!.headers.get("Content-Type")).toBe("text/plain");
    expect(result!.headers.get("Retry-After")).toBe("60");
  });

  it("blocks with a JSON body for an API route", async () => {
    mockDb.$queryRaw.mockResolvedValue([{ count: 301 }]);
    const result = await checkRateLimit(request("/api/some/route"), { tier: "general", isApiRoute: true });
    expect(result!.status).toBe(429);
    expect(result!.headers.get("Content-Type")).toContain("application/json");
    const body = await result!.json();
    expect(body).toEqual({ error: "rate_limited", message: expect.any(String) });
  });

  it("allows a request exactly at the cap and blocks the next one", async () => {
    mockDb.$queryRaw.mockResolvedValueOnce([{ count: 300 }]);
    expect(await checkRateLimit(request("/some-action"), { tier: "general", isApiRoute: false })).toBeNull();

    mockDb.$queryRaw.mockResolvedValueOnce([{ count: 301 }]);
    expect(await checkRateLimit(request("/some-action"), { tier: "general", isApiRoute: false })).not.toBeNull();
  });

  it("uses the tighter auth-tier cap and a 5-minute Retry-After", async () => {
    mockDb.$queryRaw.mockResolvedValue([{ count: 31 }]);
    const result = await checkRateLimit(request("/login"), { tier: "auth", isApiRoute: false });
    expect(result!.status).toBe(429);
    expect(result!.headers.get("Retry-After")).toBe(String(5 * 60));
  });

  it("keys the same identity independently across tiers", async () => {
    mockGetToken.mockResolvedValue({ user: { id: "user-42" } });
    mockDb.$queryRaw.mockResolvedValue([{ count: 1 }]);

    await checkRateLimit(request("/login"), { tier: "auth", isApiRoute: false });
    const authKey = mockDb.$queryRaw.mock.calls[0].slice(1)[0];

    await checkRateLimit(request("/some-action"), { tier: "general", isApiRoute: false });
    const generalKey = mockDb.$queryRaw.mock.calls[1].slice(1)[0];

    expect(authKey).not.toBe(generalKey);
    expect(authKey).toBe("auth:user:user-42");
    expect(generalKey).toBe("general:user:user-42");
  });

  it("fails open and allows the request through when the DB check throws", async () => {
    mockDb.$queryRaw.mockRejectedValue(new Error("connection reset"));
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const result = await checkRateLimit(request("/some-action"), { tier: "general", isApiRoute: false });
    expect(result).toBeNull();
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it("fails open when the token lookup itself throws", async () => {
    mockGetToken.mockRejectedValue(new Error("bad token"));
    mockDb.$queryRaw.mockResolvedValue([{ count: 1 }]);
    const result = await checkRateLimit(request("/some-action", { ip: "203.0.113.4" }), {
      tier: "general",
      isApiRoute: false,
    });
    expect(result).toBeNull();
    const values = mockDb.$queryRaw.mock.calls[0].slice(1);
    expect(values[0]).toBe("general:ip:203.0.113.4");
  });
});
