import { beforeEach, describe, expect, it, vi } from "vitest";

const mockCreate = vi.fn();
const mockFindFirst = vi.fn();
const mockUpdate = vi.fn();
vi.mock("@/lib/db", () => ({
  db: { twoFactorOtpChallenge: { create: mockCreate, findFirst: mockFindFirst, update: mockUpdate } },
}));

const mockSendSms = vi.fn();
vi.mock("@/lib/sms", () => ({ sendSms: mockSendSms }));

const { issueSmsOtpChallenge, consumeSmsOtpChallenge, hasPendingSmsOtpChallenge } = await import("@/lib/auth/sms-otp");

beforeEach(() => {
  vi.clearAllMocks();
});

describe("issueSmsOtpChallenge", () => {
  it("rejects an unnormalizable phone number without creating a row or sending anything", async () => {
    const result = await issueSmsOtpChallenge({ userId: "u1", organizationId: "org-1", purpose: "LOGIN", phone: "garbage" });
    expect(result).toEqual({ ok: false, error: "Invalid phone number." });
    expect(mockCreate).not.toHaveBeenCalled();
    expect(mockSendSms).not.toHaveBeenCalled();
  });

  it("stores a hashed (never plaintext) code and sends it as an OTP-flagged SMS", async () => {
    mockSendSms.mockResolvedValue({ ok: true });

    const result = await issueSmsOtpChallenge({ userId: "u1", organizationId: "org-1", purpose: "LOGIN", phone: "0241234567" });

    expect(result).toEqual({ ok: true });
    expect(mockCreate).toHaveBeenCalledTimes(1);
    const createArgs = mockCreate.mock.calls[0]![0].data;
    expect(createArgs.userId).toBe("u1");
    expect(createArgs.purpose).toBe("LOGIN");
    expect(createArgs.phone).toBe("0241234567");
    expect(createArgs.codeHash).not.toMatch(/^\d{6}$/);

    expect(mockSendSms).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "0241234567",
        purpose: "2FA_LOGIN",
        organizationId: "org-1",
        relatedType: "User",
        relatedId: "u1",
        isOtp: true,
      }),
    );
    expect(mockSendSms.mock.calls[0]![0].body).toMatch(/\d{6}/);
  });
});

describe("consumeSmsOtpChallenge", () => {
  it("fails closed when no unconsumed challenge exists for this user/purpose", async () => {
    mockFindFirst.mockResolvedValue(null);
    await expect(consumeSmsOtpChallenge("u1", "LOGIN", "123456")).resolves.toEqual({ ok: false });
  });

  it("rejects an expired challenge without incrementing attempts", async () => {
    mockFindFirst.mockResolvedValue({ id: "c1", codeHash: "hash", expiresAt: new Date(Date.now() - 1000), attempts: 0, phone: "0241234567" });
    await expect(consumeSmsOtpChallenge("u1", "LOGIN", "123456")).resolves.toEqual({ ok: false });
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("rejects once the attempt limit has been reached, even with the correct code", async () => {
    mockFindFirst.mockResolvedValue({ id: "c1", codeHash: "hash", expiresAt: new Date(Date.now() + 60_000), attempts: 5, phone: "0241234567" });
    await expect(consumeSmsOtpChallenge("u1", "LOGIN", "123456")).resolves.toEqual({ ok: false });
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("increments attempts and rejects a wrong code", async () => {
    const bcrypt = (await import("bcryptjs")).default;
    const codeHash = await bcrypt.hash("123456", 10);
    mockFindFirst.mockResolvedValue({ id: "c1", codeHash, expiresAt: new Date(Date.now() + 60_000), attempts: 0, phone: "0241234567" });

    await expect(consumeSmsOtpChallenge("u1", "LOGIN", "999999")).resolves.toEqual({ ok: false });
    expect(mockUpdate).toHaveBeenCalledWith({ where: { id: "c1" }, data: { attempts: { increment: 1 } } });
  });

  it("consumes a matching code and returns the phone it was issued to, marking it used", async () => {
    const bcrypt = (await import("bcryptjs")).default;
    const codeHash = await bcrypt.hash("123456", 10);
    mockFindFirst.mockResolvedValue({ id: "c1", codeHash, expiresAt: new Date(Date.now() + 60_000), attempts: 0, phone: "0241234567" });

    await expect(consumeSmsOtpChallenge("u1", "ENROLL_VERIFY_PHONE", "123456")).resolves.toEqual({ ok: true, phone: "0241234567" });
    expect(mockUpdate).toHaveBeenCalledWith({ where: { id: "c1" }, data: { consumedAt: expect.any(Date) } });
  });

  it("rejects a replay of an already-consumed code (findFirst only ever matches unconsumed rows)", async () => {
    mockFindFirst.mockResolvedValue(null);
    await expect(consumeSmsOtpChallenge("u1", "LOGIN", "123456")).resolves.toEqual({ ok: false });
    expect(mockFindFirst).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ consumedAt: null }) }));
  });
});

describe("hasPendingSmsOtpChallenge", () => {
  it("reflects whether a live, unconsumed challenge exists for the purpose", async () => {
    mockFindFirst.mockResolvedValueOnce(null);
    await expect(hasPendingSmsOtpChallenge("u1", "ENROLL_VERIFY_PHONE")).resolves.toBe(false);

    mockFindFirst.mockResolvedValueOnce({ id: "c1" });
    await expect(hasPendingSmsOtpChallenge("u1", "ENROLL_VERIFY_PHONE")).resolves.toBe(true);
  });
});
