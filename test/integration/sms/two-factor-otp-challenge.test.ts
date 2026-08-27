import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { testDb } from "../setup/db";
import { createTestOrg, cleanupTestOrg, type TestOrg } from "../setup/fixtures";

/**
 * Real-Postgres proof for the SMS 2FA challenge lifecycle: the mocked suite
 * (test/sms-otp.test.ts) proves the branching logic, but not that the real
 * TwoFactorOtpChallenge queries are well-formed against the real schema, or
 * that its onDelete: Cascade relation to User actually holds. Only the
 * network call to mNotify is mocked; everything else runs against the
 * disposable test database via TEST_DATABASE_URL.
 */

let org: TestOrg;

beforeAll(async () => {
  org = await createTestOrg("org-2fa-otp");
});

afterAll(async () => {
  await cleanupTestOrg(org);
});

beforeEach(() => {
  process.env.MNOTIFY_API_KEY = "test-key";
  process.env.MNOTIFY_SENDER_ID = "RockFrost";
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ status: "success" }) }));
});

afterEach(async () => {
  vi.unstubAllGlobals();
  await testDb.twoFactorOtpChallenge.deleteMany({ where: { userId: org.userId } });
});

describe("TwoFactorOtpChallenge lifecycle (real Postgres)", () => {
  it("issues a hashed challenge row and consumes it exactly once with the correct code", async () => {
    const { issueSmsOtpChallenge, consumeSmsOtpChallenge } = await import("@/lib/auth/sms-otp");

    const issued = await issueSmsOtpChallenge({ userId: org.userId, organizationId: org.organizationId, purpose: "LOGIN", phone: "0241234567" });
    expect(issued.ok).toBe(true);

    const row = await testDb.twoFactorOtpChallenge.findFirst({ where: { userId: org.userId, purpose: "LOGIN" } });
    expect(row).toBeTruthy();
    expect(row!.consumedAt).toBeNull();
    expect(row!.codeHash).not.toMatch(/^\d{6}$/);

    // The code itself is never returned by issueSmsOtpChallenge - read it back
    // from the SMS body the (mocked) provider call was sent, exactly like a
    // real user reading their phone.
    const sentBody = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0]![1].body;
    const code = JSON.parse(sentBody).message.match(/\d{6}/)![0];

    const consumed = await consumeSmsOtpChallenge(org.userId, "LOGIN", code);
    expect(consumed).toEqual({ ok: true, phone: "0241234567" });

    const consumedRow = await testDb.twoFactorOtpChallenge.findUnique({ where: { id: row!.id } });
    expect(consumedRow!.consumedAt).not.toBeNull();
  });

  it("rejects a replay of an already-consumed code against real Postgres", async () => {
    const { issueSmsOtpChallenge, consumeSmsOtpChallenge } = await import("@/lib/auth/sms-otp");

    await issueSmsOtpChallenge({ userId: org.userId, organizationId: org.organizationId, purpose: "ENROLL_VERIFY_PHONE", phone: "0241234567" });
    const sentBody = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0]![1].body;
    const code = JSON.parse(sentBody).message.match(/\d{6}/)![0];

    await expect(consumeSmsOtpChallenge(org.userId, "ENROLL_VERIFY_PHONE", code)).resolves.toEqual({ ok: true, phone: "0241234567" });
    await expect(consumeSmsOtpChallenge(org.userId, "ENROLL_VERIFY_PHONE", code)).resolves.toEqual({ ok: false });
  });

  it("increments the real attempts counter on a wrong code and locks out after the limit", async () => {
    const { issueSmsOtpChallenge, consumeSmsOtpChallenge } = await import("@/lib/auth/sms-otp");

    await issueSmsOtpChallenge({ userId: org.userId, organizationId: org.organizationId, purpose: "DISABLE", phone: "0241234567" });

    for (let attempt = 1; attempt <= 5; attempt += 1) {
      await expect(consumeSmsOtpChallenge(org.userId, "DISABLE", "000000")).resolves.toEqual({ ok: false });
    }

    const row = await testDb.twoFactorOtpChallenge.findFirst({ where: { userId: org.userId, purpose: "DISABLE" } });
    expect(row!.attempts).toBe(5);

    // Even the correct code no longer works once the attempt limit is hit.
    const sentBody = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0]![1].body;
    const code = JSON.parse(sentBody).message.match(/\d{6}/)![0];
    await expect(consumeSmsOtpChallenge(org.userId, "DISABLE", code)).resolves.toEqual({ ok: false });
  });

  it("cascades on user deletion, same as every other user-owned table", async () => {
    const throwaway = await createTestOrg("org-2fa-otp-cascade");
    const { issueSmsOtpChallenge } = await import("@/lib/auth/sms-otp");
    await issueSmsOtpChallenge({ userId: throwaway.userId, organizationId: throwaway.organizationId, purpose: "LOGIN", phone: "0241234567" });

    expect(await testDb.twoFactorOtpChallenge.count({ where: { userId: throwaway.userId } })).toBe(1);
    await cleanupTestOrg(throwaway);
    expect(await testDb.twoFactorOtpChallenge.count({ where: { userId: throwaway.userId } })).toBe(0);
  });
});
