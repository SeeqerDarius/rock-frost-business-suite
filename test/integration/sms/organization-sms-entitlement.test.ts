import { describe, it, expect, vi, beforeAll, afterAll, beforeEach, afterEach } from "vitest";
import { testDb } from "../setup/db";
import { createTestOrg, cleanupTestOrg, type TestOrg } from "../setup/fixtures";

/**
 * Real-Postgres proof that isOrganizationSmsNotificationsGranted() actually
 * reads the operator-controlled Organization.smsNotificationsGranted
 * column (src/lib/platform-communications.ts), not a single platform-wide
 * flag - createTestOrg() defaults new test organizations to granted (same
 * "fully-provisioned tenant" convention as enabling every module), so this
 * explicitly un-grants one to prove sendSms() actually respects it.
 */

let org: TestOrg;

beforeAll(async () => {
  org = await createTestOrg("sms-entitlement");
});

afterAll(async () => {
  await cleanupTestOrg(org);
});

beforeEach(() => {
  process.env.MNOTIFY_API_KEY = "test-key";
  process.env.MNOTIFY_SENDER_ID = "RockFrost";
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Organization.smsNotificationsGranted (real Postgres)", () => {
  it("blocks a notification send once the platform operator revokes the grant, and allows it again once regranted", async () => {
    const fetchSpy = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ status: "success", summary: { _id: "campaign-1" } }) });
    vi.stubGlobal("fetch", fetchSpy);
    const { sendSms } = await import("@/lib/sms");

    await testDb.organization.update({ where: { id: org.organizationId }, data: { smsNotificationsGranted: false } });
    const denied = await sendSms({ to: "0241234567", body: "test", purpose: "TEST_ENTITLEMENT", organizationId: org.organizationId });
    expect(denied).toEqual({ ok: false, error: "SMS notifications are not enabled for this organization." });
    expect(fetchSpy).not.toHaveBeenCalled();

    await testDb.organization.update({ where: { id: org.organizationId }, data: { smsNotificationsGranted: true } });
    const allowed = await sendSms({ to: "0241234567", body: "test", purpose: "TEST_ENTITLEMENT", organizationId: org.organizationId });
    expect(allowed).toEqual({ ok: true });
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("still sends a 2FA OTP code even when the organization's grant is revoked", async () => {
    const fetchSpy = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ status: "success" }) });
    vi.stubGlobal("fetch", fetchSpy);
    const { sendSms } = await import("@/lib/sms");

    await testDb.organization.update({ where: { id: org.organizationId }, data: { smsNotificationsGranted: false } });
    const result = await sendSms({ to: "0241234567", body: "your code is 123456", purpose: "2FA_LOGIN", organizationId: org.organizationId, isOtp: true });
    expect(result).toEqual({ ok: true });
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    await testDb.organization.update({ where: { id: org.organizationId }, data: { smsNotificationsGranted: true } });
  });
});
