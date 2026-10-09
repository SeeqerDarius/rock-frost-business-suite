import { beforeEach, describe, expect, it, vi } from "vitest";

const mockRunContractReminders = vi.fn();

vi.mock("@/modules/contracts/reminders", () => ({ runContractReminders: mockRunContractReminders }));
vi.mock("@/lib/audit", () => ({ generateCorrelationId: () => "req_test" }));

const { GET } = await import("@/app/api/cron/contract-reminders/route");

beforeEach(() => {
  vi.clearAllMocks();
  process.env.CRON_SECRET = "test-cron-secret";
  mockRunContractReminders.mockResolvedValue({ organizations: 2, candidates: 5, sent: 4 });
});

describe("contract-reminders cron route", () => {
  it("rejects requests without the configured bearer secret", async () => {
    const response = await GET(new Request("https://example.com/api/cron/contract-reminders", { headers: { authorization: "Bearer wrong" } }));
    expect(response.status).toBe(401);
    expect(mockRunContractReminders).not.toHaveBeenCalled();
  });

  it("runs the reminders and returns counts only", async () => {
    const response = await GET(new Request("https://example.com/api/cron/contract-reminders", { headers: { authorization: "Bearer test-cron-secret" } }));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true, correlationId: "req_test", organizations: 2, candidates: 5, sent: 4 });
  });

  it("returns 500 without internal details when the run fails", async () => {
    mockRunContractReminders.mockRejectedValue(new Error("database unavailable"));
    const response = await GET(new Request("https://example.com/api/cron/contract-reminders", { headers: { authorization: "Bearer test-cron-secret" } }));
    expect(response.status).toBe(500);
    expect(JSON.stringify(await response.json())).not.toContain("database unavailable");
  });
});
