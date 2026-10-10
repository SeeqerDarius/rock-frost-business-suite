import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const mockCreate = vi.fn();
vi.mock("@/lib/db", () => ({ db: { smsMessage: { create: mockCreate } } }));

const mockCanSendModuleSms = vi.fn().mockResolvedValue(true);
vi.mock("@/lib/platform-communications", () => ({ canSendModuleSms: mockCanSendModuleSms }));

const { sendSms } = await import("@/lib/sms");

const ORIGINAL_ENV = { ...process.env };

/** A valid non-OTP send. Every notification now names its sending module. */
function send(overrides: Record<string, unknown> = {}) {
  return sendSms({
    to: "0241234567",
    body: "hi",
    purpose: "TEST",
    organizationId: "org-1",
    moduleKey: "pharmacy",
    ...overrides,
  } as Parameters<typeof sendSms>[0]);
}

describe("sendSms", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCanSendModuleSms.mockResolvedValue(true);
    process.env.MNOTIFY_API_KEY = "test-key";
    process.env.MNOTIFY_SENDER_ID = "RockFrost";
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
    vi.unstubAllGlobals();
  });

  it("degrades gracefully and never writes a log row when unconfigured", async () => {
    delete process.env.MNOTIFY_API_KEY;
    const result = await send();
    expect(result).toEqual({ ok: false, error: "SMS delivery is not configured yet." });
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("rejects an unnormalizable phone number before calling the provider", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const result = await send({ to: "garbage" });
    expect(result.ok).toBe(false);
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("logs a SENT SmsMessage row and returns ok on a successful provider response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ status: "success", code: "2000", message: "messages sent successfully", summary: { _id: "abc", total_sent: 1 } }),
      }),
    );

    const result = await send({ purpose: "PHARMACY_PICKUP_READY", relatedType: "PharmacyDispensing", relatedId: "disp-1" });

    expect(result).toEqual({ ok: true });
    expect(mockCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({ organizationId: "org-1", to: "0241234567", purpose: "PHARMACY_PICKUP_READY", relatedType: "PharmacyDispensing", relatedId: "disp-1", status: "SENT" }),
    });
  });

  it("logs a FAILED SmsMessage row and returns the provider's error when mNotify rejects the message", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ status: "error", message: "Insufficient credit" }) }),
    );

    const result = await send();

    expect(result).toEqual({ ok: false, error: "Insufficient credit" });
    expect(mockCreate).toHaveBeenCalledWith({ data: expect.objectContaining({ status: "FAILED", error: "Insufficient credit" }) });
  });

  it("catches a network/provider throw, logs FAILED, and returns cleanly rather than throwing", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network down")));

    const result = await send();

    expect(result).toEqual({ ok: false, error: "Failed to send SMS." });
    expect(mockCreate).toHaveBeenCalledWith({ data: expect.objectContaining({ status: "FAILED", error: "Failed to send SMS." }) });
  });

  it("only includes sms_type: otp in the request body when isOtp is true", async () => {
    const fetchSpy = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ status: "success" }) });
    vi.stubGlobal("fetch", fetchSpy);

    await sendSms({ to: "0241234567", body: "code", purpose: "2FA_LOGIN", organizationId: "org-1", isOtp: true });
    expect(JSON.parse(fetchSpy.mock.calls[0][1].body).sms_type).toBe("otp");

    fetchSpy.mockClear();
    await send({ purpose: "PHARMACY_PICKUP_READY" });
    expect(JSON.parse(fetchSpy.mock.calls[0][1].body).sms_type).toBeUndefined();
  });

  it("degrades gracefully and never calls the provider when the module isn't entitled to SMS", async () => {
    mockCanSendModuleSms.mockResolvedValue(false);
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    const result = await send({ purpose: "SCHOOL_ATTENDANCE_ABSENT", moduleKey: "school" });

    expect(result).toEqual({ ok: false, error: "SMS notifications are not enabled for this organization." });
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(mockCreate).not.toHaveBeenCalled();
    expect(mockCanSendModuleSms).toHaveBeenCalledWith("org-1", "school");
  });

  it("checks entitlement per module, so one module's plan never speaks for another's", async () => {
    // The whole point of the tier work: an organization on School Pro can text
    // guardians while the same organization's Hotel, whose plan does not
    // include SMS, cannot. Before this, one organization-wide boolean answered
    // for all five notifying modules at once.
    mockCanSendModuleSms.mockImplementation(async (_organizationId: string, moduleKey: string) => moduleKey === "school");
    const fetchSpy = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ status: "success" }) });
    vi.stubGlobal("fetch", fetchSpy);

    const hotel = await send({ moduleKey: "hotel" });
    expect(hotel.ok).toBe(false);
    expect(fetchSpy).not.toHaveBeenCalled();

    const school = await send({ moduleKey: "school" });
    expect(school.ok).toBe(true);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("checks entitlement per organization, not a single global flag", async () => {
    mockCanSendModuleSms.mockImplementation(async (organizationId: string) => organizationId === "org-granted");
    const fetchSpy = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ status: "success" }) });
    vi.stubGlobal("fetch", fetchSpy);

    const denied = await send({ organizationId: "org-ungranted" });
    expect(denied.ok).toBe(false);
    expect(fetchSpy).not.toHaveBeenCalled();

    const allowed = await send({ organizationId: "org-granted" });
    expect(allowed.ok).toBe(true);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("fails closed when a caller forgets its moduleKey rather than falling back to an organization-wide check", async () => {
    // A missing module key is a caller bug. Guessing, or reverting to "may this
    // customer send at all", would reintroduce the cross-module leak the
    // moduleKey exists to prevent, so the send is refused and the entitlement
    // resolver is never consulted.
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    const result = await sendSms({ to: "0241234567", body: "hi", purpose: "TEST", organizationId: "org-1" });

    expect(result).toEqual({ ok: false, error: "SMS notifications are not enabled for this organization." });
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(mockCreate).not.toHaveBeenCalled();
    expect(mockCanSendModuleSms).not.toHaveBeenCalled();
  });

  it("never checks entitlement for an OTP send, so 2FA still works for an unentitled organization", async () => {
    mockCanSendModuleSms.mockResolvedValue(false);
    const fetchSpy = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ status: "success" }) });
    vi.stubGlobal("fetch", fetchSpy);

    // Note there is no moduleKey here either: login codes belong to
    // authentication, not to any module's plan.
    const result = await sendSms({ to: "0241234567", body: "code", purpose: "2FA_LOGIN", organizationId: "org-1", isOtp: true });

    expect(result).toEqual({ ok: true });
    expect(fetchSpy).toHaveBeenCalled();
    expect(mockCanSendModuleSms).not.toHaveBeenCalled();
  });

  it("passes the API key as a query parameter, not in the request body", async () => {
    const fetchSpy = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ status: "success" }) });
    vi.stubGlobal("fetch", fetchSpy);

    await send();

    const [url, options] = fetchSpy.mock.calls[0];
    expect(url).toContain("key=test-key");
    expect(JSON.parse(options.body)).not.toHaveProperty("key");
    expect(JSON.parse(options.body)).not.toHaveProperty("api_key");
  });
});
