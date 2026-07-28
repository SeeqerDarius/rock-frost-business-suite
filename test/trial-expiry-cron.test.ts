import { beforeEach, describe, expect, it, vi } from "vitest";

const mockExpireTrials = vi.fn();
const mockGenerateCorrelationId = vi.fn(() => "req_test");

vi.mock("@/platform/trials/service", () => ({ expireTrials: mockExpireTrials }));
vi.mock("@/lib/audit", () => ({ generateCorrelationId: mockGenerateCorrelationId }));

const { GET } = await import("@/app/api/cron/expire-trials/route");

beforeEach(() => {
  vi.clearAllMocks();
  process.env.CRON_SECRET = "test-cron-secret";
  mockExpireTrials.mockResolvedValue({
    cutoff: new Date("2026-07-14T01:15:00.000Z"),
    candidates: 2,
    expired: 2,
  });
});

describe("trial-expiry cron route", () => {
  it("rejects requests without the configured bearer secret", async () => {
    const response = await GET(new Request("https://example.com/api/cron/expire-trials"));
    expect(response.status).toBe(401);
    expect(mockExpireTrials).not.toHaveBeenCalled();
  });

  it("runs the sweep and returns bounded operational counts", async () => {
    const response = await GET(new Request("https://example.com/api/cron/expire-trials", {
      headers: { authorization: "Bearer test-cron-secret", "x-vercel-id": "iad1::test" },
    }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      ok: true,
      correlationId: "req_test",
      candidates: 2,
      expired: 2,
      cutoff: "2026-07-14T01:15:00.000Z",
    });
    expect(mockExpireTrials).toHaveBeenCalledTimes(1);
  });
});
