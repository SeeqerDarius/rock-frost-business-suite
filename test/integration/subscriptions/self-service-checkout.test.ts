import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { cleanupTestOrg, createTestOrg, type TestOrg } from "../setup/fixtures";
import { testDb } from "../setup/db";
import { createSelfServiceSubscription, SelfServiceSubscriptionExistsError } from "@/platform/subscriptions/service";

let org: TestOrg;

beforeAll(async () => {
  org = await createTestOrg("self-service-subscriptions");
});

afterAll(async () => cleanupTestOrg(org));

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
});
