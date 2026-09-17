import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const mockCreate = vi.fn();
vi.mock("@/lib/db", () => ({ db: { smsMessage: { create: mockCreate } } }));

const mockIsOrganizationSmsNotificationsGranted = vi.fn().mockResolvedValue(true);
vi.mock("@/lib/platform-communications", () => ({ isOrganizationSmsNotificationsGranted: mockIsOrganizationSmsNotificationsGranted }));

const { sendSms } = await import("@/lib/sms");

const ORIGINAL_ENV = { ...process.env };

describe("sendSms", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsOrganizationSmsNotificationsGranted.mockResolvedValue(true);
    process.env.MNOTIFY_API_KEY = "test-key";
    process.env.MNOTIFY_SENDER_ID = "RockFrost";
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
    vi.unstubAllGlobals();
  });

  it("degrades gracefully and never writes a log row when unconfigured", async () => {
    delete process.env.MNOTIFY_API_KEY;
    const result = await sendSms({ to: "0241234567", body: "hi", purpose: "TEST", organizationId: "org-1" });
    expect(result).toEqual({ ok: false, error: "SMS delivery is not configured yet." });
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("rejects an unnormalizable phone number before calling the provider", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const result = await sendSms({ to: "garbage", body: "hi", purpose: "TEST", organizationId: "org-1" });
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

    const result = await sendSms({ to: "0241234567", body: "hi", purpose: "PHARMACY_PICKUP_READY", organizationId: "org-1", relatedType: "PharmacyDispensing", relatedId: "disp-1" });

    expect(result).toEqual({ ok: true });
    expect(mockCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({ organizationId: "org-1", to: "0241234567", purpose: "PHARMACY_PICKUP_READY", relatedType: "PharmacyDispensing", relatedId: "disp-1", status: "SENT" }),
    });
  });

  it("logs a FAILED SmsMessage row and returns the provider's error when mNotify rejects the message", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ status: "error", message: "Insufficient credit" }),
      }),
    );

    const result = await sendSms({ to: "0241234567", body: "hi", purpose: "TEST", organizationId: "org-1" });

    expect(result).toEqual({ ok: false, error: "Insufficient credit" });
    expect(mockCreate).toHaveBeenCalledWith({ data: expect.objectContaining({ status: "FAILED", error: "Insufficient credit" }) });
  });

  it("catches a network/provider throw, logs FAILED, and returns cleanly rather than throwing", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network down")));

    const result = await sendSms({ to: "0241234567", body: "hi", purpose: "TEST", organizationId: "org-1" });

    expect(result).toEqual({ ok: false, error: "Failed to send SMS." });
    expect(mockCreate).toHaveBeenCalledWith({ data: expect.objectContaining({ status: "FAILED", error: "Failed to send SMS." }) });
  });

  it("only includes sms_type: otp in the request body when isOtp is true", async () => {
    const fetchSpy = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ status: "success" }) });
    vi.stubGlobal("fetch", fetchSpy);

    await sendSms({ to: "0241234567", body: "code", purpose: "2FA_LOGIN", organizationId: "org-1", isOtp: true });
    const otpBody = JSON.parse(fetchSpy.mock.calls[0][1].body);
    expect(otpBody.sms_type).toBe("otp");

    fetchSpy.mockClear();
    await sendSms({ to: "0241234567", body: "hi", purpose: "PHARMACY_PICKUP_READY", organizationId: "org-1" });
    const nonOtpBody = JSON.parse(fetchSpy.mock.calls[0][1].body);
    expect(nonOtpBody.sms_type).toBeUndefined();
  });

  it("degrades gracefully and never calls the provider when the organization isn't entitled to SMS notifications", async () => {
    mockIsOrganizationSmsNotificationsGranted.mockResolvedValue(false);
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    const result = await sendSms({ to: "0241234567", body: "hi", purpose: "SCHOOL_ATTENDANCE_ABSENT", organizationId: "org-1" });

    expect(result).toEqual({ ok: false, error: "SMS notifications are not enabled for this organization." });
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(mockCreate).not.toHaveBeenCalled();
    expect(mockIsOrganizationSmsNotificationsGranted).toHaveBeenCalledWith("org-1");
  });

  it("never checks the per-organization entitlement for an OTP send, so 2FA still works for an ungranted organization", async () => {
    mockIsOrganizationSmsNotificationsGranted.mockResolvedValue(false);
    const fetchSpy = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ status: "success" }) });
    vi.stubGlobal("fetch", fetchSpy);

    const result = await sendSms({ to: "0241234567", body: "code", purpose: "2FA_LOGIN", organizationId: "org-1", isOtp: true });

    expect(result).toEqual({ ok: true });
    expect(fetchSpy).toHaveBeenCalled();
    expect(mockIsOrganizationSmsNotificationsGranted).not.toHaveBeenCalled();
  });

  it("checks entitlement per organization, not a single global flag", async () => {
    mockIsOrganizationSmsNotificationsGranted.mockImplementation(async (organizationId: string) => organizationId === "org-granted");
    const fetchSpy = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ status: "success" }) });
    vi.stubGlobal("fetch", fetchSpy);

    const denied = await sendSms({ to: "0241234567", body: "hi", purpose: "TEST", organizationId: "org-ungranted" });
    expect(denied.ok).toBe(false);
    expect(fetchSpy).not.toHaveBeenCalled();

    const allowed = await sendSms({ to: "0241234567", body: "hi", purpose: "TEST", organizationId: "org-granted" });
    expect(allowed.ok).toBe(true);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("passes the API key as a query parameter, not in the request body", async () => {
    const fetchSpy = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ status: "success" }) });
    vi.stubGlobal("fetch", fetchSpy);

    await sendSms({ to: "0241234567", body: "hi", purpose: "TEST", organizationId: "org-1" });

    const [url, options] = fetchSpy.mock.calls[0];
    expect(url).toContain("key=test-key");
    expect(JSON.parse(options.body)).not.toHaveProperty("key");
    expect(JSON.parse(options.body)).not.toHaveProperty("api_key");
  });
});
