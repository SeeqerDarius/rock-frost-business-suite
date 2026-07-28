import { beforeEach, describe, expect, it, vi } from "vitest";

const mockDb = { $queryRaw: vi.fn() };
vi.mock("@/lib/db", () => ({ db: mockDb }));
vi.mock("@/lib/audit", () => ({ generateCorrelationId: () => "req_health" }));

const { GET } = await import("@/app/api/health/route");

beforeEach(() => {
  vi.clearAllMocks();
});

describe("health route", () => {
  it("returns 200 without caching when the database is reachable", async () => {
    mockDb.$queryRaw.mockResolvedValue([{ "?column?": 1 }]);
    const response = await GET(new Request("https://example.com/api/health"));
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    await expect(response.json()).resolves.toMatchObject({ ok: true, database: "reachable" });
  });

  it("returns 503 without exposing database details when the probe fails", async () => {
    mockDb.$queryRaw.mockRejectedValue(new Error("secret database detail"));
    const response = await GET(new Request("https://example.com/api/health"));
    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      ok: false,
      database: "unreachable",
      correlationId: "req_health",
    });
  });
});
