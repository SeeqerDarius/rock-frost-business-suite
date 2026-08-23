import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { cleanupTestOrg, createTestOrg, type TestOrg } from "../setup/fixtures";
import { testDb } from "../setup/db";
import { activateSubscription, createSelfServiceBundleSubscription, createSelfServiceCartSubscription, createSelfServiceSubscription, SelfServiceSubscriptionExistsError } from "@/platform/subscriptions/service";

let org: TestOrg;
let bundleOrg: TestOrg;
let cartOrg: TestOrg;

beforeAll(async () => {
  org = await createTestOrg("self-service-subscriptions");
  bundleOrg = await createTestOrg("self-service-bundle");
  cartOrg = await createTestOrg("self-service-cart");
});

afterAll(async () => { await cleanupTestOrg(org); await cleanupTestOrg(bundleOrg); await cleanupTestOrg(cartOrg); });

describe("self-service subscription checkout (real PostgreSQL)", () => {
  it("creates a monthly pending subscription from the server catalogue", async () => {
    const subscription = await createSelfServiceSubscription({
      organizationId: org.organizationId,
      moduleKey: "crm",
      billingCycle: "MONTHLY",
      autoRenew: true,
      actorId: org.userId,
    });
    expect(subscription).toMatchObject({
      status: "PENDING_PAYMENT",
      mode: "PLATFORM_MANAGED",
      durationMonths: 1,
      currency: "GHS",
      autoRenew: true,
      seatLimit: 5,
    });
    expect(subscription.amount.toFixed(2)).toBe("249.00");
  });

  it("uses the annual catalogue price and included seats", async () => {
    const subscription = await createSelfServiceSubscription({
      organizationId: org.organizationId,
      moduleKey: "school",
      billingCycle: "ANNUAL",
      autoRenew: false,
      actorId: org.userId,
    });
    expect(subscription.durationMonths).toBe(12);
    expect(subscription.amount.toFixed(2)).toBe("5990.00");
    expect(subscription.seatLimit).toBe(20);
  });

  it("serializes concurrent clicks so only one pending product subscription is created", async () => {
    const input = {
      organizationId: org.organizationId,
      moduleKey: "projects" as const,
      billingCycle: "MONTHLY" as const,
      autoRenew: true,
      actorId: org.userId,
    };
    const results = await Promise.allSettled([
      createSelfServiceSubscription(input),
      createSelfServiceSubscription(input),
    ]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    const rejected = results.find((result) => result.status === "rejected");
    expect(rejected).toMatchObject({ reason: expect.any(SelfServiceSubscriptionExistsError) });
    const projectModule = await testDb.module.findUniqueOrThrow({ where: { code: "projects" } });
    expect(await testDb.subscription.count({
      where: { organizationId: org.organizationId, moduleId: projectModule.id, status: "PENDING_PAYMENT" },
    })).toBe(1);
  });

  it("activates every entitlement in a combined suite after one verified payment", async () => {
    const subscription = await createSelfServiceBundleSubscription({
      organizationId: bundleOrg.organizationId,
      bundleKey: "business-starter",
      billingCycle: "ANNUAL",
      autoRenew: true,
      actorId: bundleOrg.userId,
    });
    expect(subscription).toMatchObject({ bundleKey: "business-starter", durationMonths: 12, status: "PENDING_PAYMENT" });
    expect(subscription.amount.toFixed(2)).toBe("16990.00");
    expect(subscription.entitledModuleKeys).toEqual(expect.arrayContaining(["crm", "inventory", "procurement", "accounting"]));

    await activateSubscription({ subscriptionId: subscription.id, actorId: bundleOrg.userId, paymentReference: "bundle-payment-1", paymentMethod: "PAYSTACK" });
    const enabled = await testDb.organizationModule.findMany({
      where: { organizationId: bundleOrg.organizationId, enabled: true },
      select: { module: { select: { code: true } } },
    });
    expect(enabled.map((entry) => entry.module.code)).toEqual(expect.arrayContaining(["crm", "inventory", "procurement", "accounting"]));
    expect((await testDb.organization.findUniqueOrThrow({ where: { id: bundleOrg.organizationId } })).status).toBe("ACTIVE");
  });

  it("prices an ad-hoc cart as the plain sum of each selected module, not a bundle rate, and activates all of them after one payment", async () => {
    const subscription = await createSelfServiceCartSubscription({
      organizationId: cartOrg.organizationId,
      moduleKeys: ["crm", "hr", "analytics"],
      billingCycle: "ANNUAL",
      autoRenew: true,
      actorId: cartOrg.userId,
    });
    // crm 2490 + hr 5490 + analytics 1990 = 9970 (plain sum, no bundle discount)
    expect(subscription.amount.toFixed(2)).toBe("9970.00");
    expect(subscription.bundleKey).toBeNull();
    expect(subscription.entitledModuleKeys).toEqual(expect.arrayContaining(["crm", "hr", "payroll", "analytics"]));
    expect(subscription.seatLimit).toBe(15); // max(5, 15, 5) across the three selected modules' included seats

    await activateSubscription({ subscriptionId: subscription.id, actorId: cartOrg.userId, paymentReference: "cart-payment-1", paymentMethod: "PAYSTACK" });
    const enabled = await testDb.organizationModule.findMany({
      where: { organizationId: cartOrg.organizationId, enabled: true },
      select: { module: { select: { code: true } } },
    });
    expect(enabled.map((entry) => entry.module.code)).toEqual(expect.arrayContaining(["crm", "hr", "payroll", "analytics"]));
    expect((await testDb.organization.findUniqueOrThrow({ where: { id: cartOrg.organizationId } })).status).toBe("ACTIVE");
  });

  it("rejects a cart that overlaps a product already subscribed elsewhere", async () => {
    await expect(createSelfServiceCartSubscription({
      organizationId: cartOrg.organizationId,
      moduleKeys: ["crm", "pos"],
      billingCycle: "MONTHLY",
      autoRenew: true,
      actorId: cartOrg.userId,
    })).rejects.toThrow(SelfServiceSubscriptionExistsError);
    // The non-conflicting product in the rejected cart must not have been
    // partially subscribed — the whole cart is one atomic transaction.
    const posModule = await testDb.module.findUniqueOrThrow({ where: { code: "pos" } });
    expect(await testDb.subscription.count({
      where: { organizationId: cartOrg.organizationId, moduleId: posModule.id },
    })).toBe(0);
  });

  it("serializes concurrent cart clicks so only one pending cart subscription is created", async () => {
    const freshCartOrg = await createTestOrg("self-service-cart-concurrent");
    try {
      const input = {
        organizationId: freshCartOrg.organizationId,
        moduleKeys: ["fleet", "installment"] as const,
        billingCycle: "MONTHLY" as const,
        autoRenew: true,
        actorId: freshCartOrg.userId,
      };
      const results = await Promise.allSettled([
        createSelfServiceCartSubscription({ ...input, moduleKeys: [...input.moduleKeys] }),
        createSelfServiceCartSubscription({ ...input, moduleKeys: [...input.moduleKeys] }),
      ]);
      expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
      const rejected = results.find((result) => result.status === "rejected");
      expect(rejected).toMatchObject({ reason: expect.any(SelfServiceSubscriptionExistsError) });
      const fleetModule = await testDb.module.findUniqueOrThrow({ where: { code: "fleet" } });
      expect(await testDb.subscription.count({
        where: { organizationId: freshCartOrg.organizationId, moduleId: fleetModule.id, status: "PENDING_PAYMENT" },
      })).toBe(1);
    } finally {
      await cleanupTestOrg(freshCartOrg);
    }
  });
});
