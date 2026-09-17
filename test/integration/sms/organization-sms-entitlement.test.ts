import { describe, it, expect, vi, beforeAll, afterAll, beforeEach, afterEach } from "vitest";
import { testDb } from "../setup/db";
import { createTestOrg, cleanupTestOrg, type TestOrg } from "../setup/fixtures";

/**
 * Real-Postgres proof of the per-module SMS gate (`canSendModuleSms()` in
 * src/lib/platform-communications.ts, resolving through
 * src/platform/entitlements/resolve.ts).
 *
 * This used to assert a single organization-wide boolean, which is exactly
 * the coarseness the plan-tier work replaced: "SMS is on for this customer"
 * and "SMS is on for this customer's School" were the same sentence when
 * they are not. What is proven here now is the real contract, against real
 * rows rather than a mocked resolver:
 *
 * 1. the operator override still opens SMS for every module, so no
 *    organization already granted it lost anything;
 * 2. with the override off, a module's own plan tier decides;
 * 3. a module whose ladder is still pending declares no sms feature, so it
 *    stays closed rather than becoming silently ungated;
 * 4. 2FA codes are never gated either way.
 *
 * createTestOrg() defaults new organizations to granted (the same
 * "fully-provisioned tenant" convention as enabling every module), so each
 * case sets the columns it actually needs.
 */

let org: TestOrg;
let schoolModuleId: string;

beforeAll(async () => {
  org = await createTestOrg("sms-entitlement");
  const schoolModule = await testDb.module.findUniqueOrThrow({ where: { code: "school" } });
  schoolModuleId = schoolModule.id;
});

afterAll(async () => {
  await cleanupTestOrg(org);
});

beforeEach(async () => {
  process.env.MNOTIFY_API_KEY = "test-key";
  process.env.MNOTIFY_SENDER_ID = "RockFrost";
  await testDb.subscription.deleteMany({ where: { organizationId: org.organizationId } });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

/** An in-window ACTIVE subscription for School at one tier. */
async function giveSchoolSubscription(tier: "BASIC" | "PRO" | "PLATINUM" | "ENTERPRISE") {
  const now = new Date();
  await testDb.subscription.create({
    data: {
      organizationId: org.organizationId,
      moduleId: schoolModuleId,
      tier,
      mode: "MANUAL_OFFLINE",
      status: "ACTIVE",
      durationMonths: 12,
      amount: "1000.00",
      currency: "GHS",
      startsAt: new Date(now.getTime() - 86_400_000),
      endsAt: new Date(now.getTime() + 86_400_000),
      createdById: org.userId,
    },
  });
}

function stubProvider() {
  const fetchSpy = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ status: "success", summary: { _id: "campaign-1" } }) });
  vi.stubGlobal("fetch", fetchSpy);
  return fetchSpy;
}

describe("per-module SMS entitlement (real Postgres)", () => {
  it("lets the operator override open SMS for every module, so a granted organization keeps what it had", async () => {
    const fetchSpy = stubProvider();
    const { sendSms } = await import("@/lib/sms");
    await testDb.organization.update({ where: { id: org.organizationId }, data: { smsNotificationsGranted: true } });

    // No subscription at all, so nothing but the override can be allowing this.
    for (const moduleKey of ["school", "hotel", "pharmacy"]) {
      const result = await sendSms({ to: "0241234567", body: "test", purpose: "TEST_OVERRIDE", organizationId: org.organizationId, moduleKey });
      expect(result, moduleKey).toEqual({ ok: true });
    }
    expect(fetchSpy).toHaveBeenCalledTimes(3);
  });

  it("blocks every module the moment the operator revokes the override and no plan includes SMS", async () => {
    const fetchSpy = stubProvider();
    const { sendSms } = await import("@/lib/sms");
    await testDb.organization.update({ where: { id: org.organizationId }, data: { smsNotificationsGranted: false } });
    await giveSchoolSubscription("BASIC");

    const denied = await sendSms({ to: "0241234567", body: "test", purpose: "TEST_ENTITLEMENT", organizationId: org.organizationId, moduleKey: "school" });
    expect(denied).toEqual({ ok: false, error: "SMS notifications are not enabled for this organization." });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("opens School SMS from School's own tier once it reaches Pro, with the override still off", async () => {
    const fetchSpy = stubProvider();
    const { sendSms } = await import("@/lib/sms");
    await testDb.organization.update({ where: { id: org.organizationId }, data: { smsNotificationsGranted: false } });
    await giveSchoolSubscription("PRO");

    const allowed = await sendSms({ to: "0241234567", body: "test", purpose: "SCHOOL_ATTENDANCE_ABSENT", organizationId: org.organizationId, moduleKey: "school" });
    expect(allowed).toEqual({ ok: true });
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("does not let School's plan speak for another module", async () => {
    // The original complaint, as an assertion: buying School Pro must not
    // hand this organization's Hotel or Pharmacy an SMS entitlement.
    const fetchSpy = stubProvider();
    const { sendSms } = await import("@/lib/sms");
    await testDb.organization.update({ where: { id: org.organizationId }, data: { smsNotificationsGranted: false } });
    await giveSchoolSubscription("PRO");

    for (const moduleKey of ["hotel", "pharmacy", "payroll", "hospital"]) {
      const denied = await sendSms({ to: "0241234567", body: "test", purpose: "TEST_CROSS_MODULE", organizationId: org.organizationId, moduleKey });
      expect(denied, moduleKey).toEqual({ ok: false, error: "SMS notifications are not enabled for this organization." });
    }
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("grandfathers an organization whose module is enabled with no subscription row", async () => {
    // createTestOrg enables every module without creating subscriptions,
    // which is the shape of a real pre-tier customer. They resolve at
    // UNTIERED_LEGACY_TIER (Platinum), so School SMS stays available even
    // with the override revoked.
    const fetchSpy = stubProvider();
    const { sendSms } = await import("@/lib/sms");
    await testDb.organization.update({ where: { id: org.organizationId }, data: { smsNotificationsGranted: false } });

    const allowed = await sendSms({ to: "0241234567", body: "test", purpose: "TEST_GRANDFATHER", organizationId: org.organizationId, moduleKey: "school" });
    expect(allowed).toEqual({ ok: true });
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("still sends a 2FA OTP code when nothing entitles the organization to SMS", async () => {
    const fetchSpy = stubProvider();
    const { sendSms } = await import("@/lib/sms");
    await testDb.organization.update({ where: { id: org.organizationId }, data: { smsNotificationsGranted: false } });
    await giveSchoolSubscription("BASIC");

    const result = await sendSms({ to: "0241234567", body: "your code is 123456", purpose: "2FA_LOGIN", organizationId: org.organizationId, isOtp: true });
    expect(result).toEqual({ ok: true });
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });
});
