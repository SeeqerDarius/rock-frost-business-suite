import { beforeEach, describe, expect, it, vi } from "vitest";

const mockGenerateDueRecurringTransactions = vi.fn();
const mockGenerateCorrelationId = vi.fn(() => "req_test");

vi.mock("@/modules/accounting/service", () => ({ generateDueRecurringTransactions: mockGenerateDueRecurringTransactions }));
vi.mock("@/lib/audit", () => ({ generateCorrelationId: mockGenerateCorrelationId }));

const { GET } = await import("@/app/api/cron/recurring-transactions/route");

beforeEach(() => {
  vi.clearAllMocks();
  process.env.CRON_SECRET = "test-cron-secret";
  mockGenerateDueRecurringTransactions.mockResolvedValue({ candidates: 3, generated: 3, failures: [] });
});

describe("recurring-transactions cron route", () => {
  it("rejects requests without the configured bearer secret", async () => {
    const response = await GET(new Request("https://example.com/api/cron/recurring-transactions"));
    expect(response.status).toBe(401);
    expect(mockGenerateDueRecurringTransactions).not.toHaveBeenCalled();
  });

  it("runs the sweep and returns bounded operational counts", async () => {
    const response = await GET(new Request("https://example.com/api/cron/recurring-transactions", {
      headers: { authorization: "Bearer test-cron-secret", "x-vercel-id": "iad1::test" },
    }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true, correlationId: "req_test", candidates: 3, generated: 3, failed: 0 });
    expect(mockGenerateDueRecurringTransactions).toHaveBeenCalledTimes(1);
  });

  it("still returns 200 with a failed count when some templates fail, rather than a 500", async () => {
    mockGenerateDueRecurringTransactions.mockResolvedValue({ candidates: 2, generated: 1, failures: [{ templateId: "t1", name: "Broken template", error: "boom" }] });

    const response = await GET(new Request("https://example.com/api/cron/recurring-transactions", {
      headers: { authorization: "Bearer test-cron-secret" },
    }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true, correlationId: "req_test", candidates: 2, generated: 1, failed: 1 });
  });

  it("returns a 500 with a correlation id, never a raw throw, when the sweep itself fails", async () => {
    mockGenerateDueRecurringTransactions.mockRejectedValue(new Error("db unreachable"));

    const response = await GET(new Request("https://example.com/api/cron/recurring-transactions", {
      headers: { authorization: "Bearer test-cron-secret" },
    }));

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({ ok: false, error: "Recurring-transactions sweep failed", correlationId: "req_test" });
  });
});
