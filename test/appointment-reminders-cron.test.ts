import { beforeEach, describe, expect, it, vi } from "vitest";

const mockSendDueAppointmentReminders = vi.fn();
const mockGenerateCorrelationId = vi.fn(() => "req_test");

vi.mock("@/modules/hospital/service", () => ({ sendDueAppointmentReminders: mockSendDueAppointmentReminders }));
vi.mock("@/lib/audit", () => ({ generateCorrelationId: mockGenerateCorrelationId }));

const { GET } = await import("@/app/api/cron/appointment-reminders/route");

beforeEach(() => {
  vi.clearAllMocks();
  process.env.CRON_SECRET = "test-cron-secret";
  mockSendDueAppointmentReminders.mockResolvedValue({ candidates: 5, sent: 4 });
});

describe("appointment-reminders cron route", () => {
  it("rejects requests without the configured bearer secret", async () => {
    const response = await GET(new Request("https://example.com/api/cron/appointment-reminders"));
    expect(response.status).toBe(401);
    expect(mockSendDueAppointmentReminders).not.toHaveBeenCalled();
  });

  it("rejects a wrong bearer secret", async () => {
    const response = await GET(new Request("https://example.com/api/cron/appointment-reminders", {
      headers: { authorization: "Bearer wrong-secret" },
    }));
    expect(response.status).toBe(401);
    expect(mockSendDueAppointmentReminders).not.toHaveBeenCalled();
  });

  it("runs the sweep and returns bounded operational counts", async () => {
    const response = await GET(new Request("https://example.com/api/cron/appointment-reminders", {
      headers: { authorization: "Bearer test-cron-secret", "x-vercel-id": "iad1::test" },
    }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true, correlationId: "req_test", candidates: 5, sent: 4 });
    expect(mockSendDueAppointmentReminders).toHaveBeenCalledTimes(1);
  });

  it("returns a 500 with a correlation id, never a raw throw, when the sweep fails", async () => {
    mockSendDueAppointmentReminders.mockRejectedValue(new Error("db unreachable"));
    const response = await GET(new Request("https://example.com/api/cron/appointment-reminders", {
      headers: { authorization: "Bearer test-cron-secret" },
    }));
    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({ ok: false, error: "Appointment reminders failed", correlationId: "req_test" });
  });
});
