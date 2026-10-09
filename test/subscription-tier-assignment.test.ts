import { beforeEach, describe, expect, it, vi } from "vitest";
import { UNTIERED_LEGACY_TIER } from "@/platform/entitlements/tiers";

/**
 * Every path that creates a Subscription must set `tier` explicitly.
 *
 * This is not a style rule. `Subscription.tier` defaults to BASIC, and the
 * amount charged still comes from the pre-tier price catalogue, so a path
 * that leaves the tier implicit sells a School at the full GHS 599 headline
 * and then withholds fees, exams, timetables, transport, library, SMS and
 * reports, with a 200-student and single-campus ceiling on top. The customer
 * pays for a module and receives a fraction of it, and nothing fails loudly.
 *
 * That is exactly what the first cut of the tier work did on all four
 * creation paths, which is why the invariant is pinned here rather than left
 * to review. The final assertion walks the service source so a fifth path
 * added later cannot quietly skip it.
 */

const captured: { data: Record<string, unknown> }[] = [];

const tx = {
  $executeRaw: vi.fn(),
  module: { findMany: vi.fn() },
  subscription: {
    create: vi.fn((args: { data: Record<string, unknown> }) => {
      captured.push(args);
      return { id: "subscription-1", ...args.data };
    }),
    findFirst: vi.fn(() => null),
  },
};

const mockDb = {
  organization: { findUnique: vi.fn(() => ({ id: "org-1" })) },
  module: { findFirst: vi.fn(() => ({ id: "module-1" })) },
  $transaction: vi.fn(async (callback: (client: typeof tx) => unknown) => callback(tx)),
};

// School is the one module with a published ladder, so it is the only one
// whose checkout has a rung to pick. The pending-ladder modules go through
// the single-price branch.
const SCHOOL_RUNGS = {
  BASIC: { moduleKey: "school", tier: "BASIC" as const, monthlyGhs: 299, annualGhs: 2990, includedSeats: 10, additionalSeatGhs: 25 },
  PRO: { moduleKey: "school", tier: "PRO" as const, monthlyGhs: 599, annualGhs: 5990, includedSeats: 20, additionalSeatGhs: 30 },
  PLATINUM: { moduleKey: "school", tier: "PLATINUM" as const, monthlyGhs: 1099, annualGhs: 10990, includedSeats: 50, additionalSeatGhs: 30 },
};

const modulePriceMap = new Map([
  ["school", { moduleKey: "school", monthlyGhs: 599, annualGhs: 5990, includedSeats: 20, additionalSeatGhs: 30 }],
  ["crm", { moduleKey: "crm", monthlyGhs: 249, annualGhs: 2490, includedSeats: 5, additionalSeatGhs: 20 }],
  ["inventory", { moduleKey: "inventory", monthlyGhs: 349, annualGhs: 3490, includedSeats: 5, additionalSeatGhs: 20 }],
  ["accounting", { moduleKey: "accounting", monthlyGhs: 449, annualGhs: 4490, includedSeats: 5, additionalSeatGhs: 20 }],
]);

vi.mock("@/lib/db", () => ({ db: mockDb }));
vi.mock("@/lib/audit", () => ({ logAuditEvent: vi.fn() }));
vi.mock("@/lib/accounting-integration", () => ({ ensureRevenueAccountsForOrg: vi.fn() }));
vi.mock("@/lib/pricing", () => ({
  getModulePriceMap: vi.fn(async () => modulePriceMap),
  getPricingBundleMap: vi.fn(async () => new Map([
    ["business-starter", { key: "business-starter", name: "Business Starter", monthlyGhs: 1699, moduleKeys: ["crm", "inventory", "accounting"], modules: ["CRM", "Inventory", "Accounting"] }],
  ])),
  getModuleTierPrice: vi.fn(async (moduleKey: string, tier: keyof typeof SCHOOL_RUNGS) =>
    (moduleKey === "school" ? SCHOOL_RUNGS[tier] ?? null : null)),
}));

const {
  createSelfServiceSubscription,
  createSelfServiceBundleSubscription,
  createSelfServiceCartSubscription,
  createSubscription,
  UnavailablePlanTierError,
} = await import("@/platform/subscriptions/service");

beforeEach(() => {
  captured.length = 0;
  tx.subscription.findFirst.mockResolvedValue(null);
  tx.module.findMany.mockImplementation(async (args: { where: { code: { in: string[] } } }) =>
    args.where.code.in.map((code) => ({ id: `module-${code}`, code })));
});

function onlyCreate() {
  expect(captured).toHaveLength(1);
  return captured[0]!.data;
}

describe("every subscription creation path sets a tier explicitly", () => {
  it("stores the rung the customer picked for a module with a published ladder", async () => {
    await createSelfServiceSubscription({
      organizationId: "org-1",
      moduleKey: "school",
      tier: "PLATINUM",
      billingCycle: "MONTHLY",
      autoRenew: true,
      actorId: "user-1",
    });
    const data = onlyCreate();
    expect(data.tier).toBe("PLATINUM");
    // Priced from the rung, not the single headline price.
    expect(String(data.amount)).toBe("1099");
    expect(data.seatLimit).toBe(50);
  });

  it("charges Basic the Basic price, which is the whole point of the ladder", async () => {
    await createSelfServiceSubscription({
      organizationId: "org-1",
      moduleKey: "school",
      tier: "BASIC",
      billingCycle: "ANNUAL",
      autoRenew: true,
      actorId: "user-1",
    });
    const data = onlyCreate();
    expect(data.tier).toBe("BASIC");
    expect(String(data.amount)).toBe("2990");
    expect(data.seatLimit).toBe(10);
  });

  it("keeps Pro identical to the pre-tier deal, so an older link buys the same thing", async () => {
    // School's Pro rung is deliberately priced at the module's long-standing
    // headline (GHS 599 / 5990, 20 seats). If this drifts, every customer who
    // bought before tiers is on a plan that no longer matches what they pay.
    await createSelfServiceSubscription({
      organizationId: "org-1",
      moduleKey: "school",
      tier: "PRO",
      billingCycle: "ANNUAL",
      autoRenew: true,
      actorId: "user-1",
    });
    const data = onlyCreate();
    expect(String(data.amount)).toBe(String(modulePriceMap.get("school")!.annualGhs));
    expect(data.seatLimit).toBe(modulePriceMap.get("school")!.includedSeats);
  });

  it("refuses a module with a ladder when no plan was chosen, rather than guessing", async () => {
    await expect(createSelfServiceSubscription({
      organizationId: "org-1",
      moduleKey: "school",
      billingCycle: "MONTHLY",
      autoRenew: true,
      actorId: "user-1",
    })).rejects.toBeInstanceOf(UnavailablePlanTierError);
    expect(captured).toHaveLength(0);
  });

  it("refuses the quote-only plan at self-service checkout", async () => {
    await expect(createSelfServiceSubscription({
      organizationId: "org-1",
      moduleKey: "school",
      tier: "ENTERPRISE",
      billingCycle: "MONTHLY",
      autoRenew: true,
      actorId: "user-1",
    })).rejects.toBeInstanceOf(UnavailablePlanTierError);
    expect(captured).toHaveLength(0);
  });

  it("sells a module whose ladder is still pending at its single price and full access", async () => {
    // CRM has no ladder, so its one price buys all of it, exactly as before
    // tiers. Storing BASIC here would be a silent price rise.
    await createSelfServiceSubscription({
      organizationId: "org-1",
      moduleKey: "crm",
      billingCycle: "MONTHLY",
      autoRenew: true,
      actorId: "user-1",
    });
    const data = onlyCreate();
    expect(data.tier).toBe(UNTIERED_LEGACY_TIER);
    expect(String(data.amount)).toBe("249");
  });

  it("ignores a tier passed for a module that has no ladder", async () => {
    await createSelfServiceSubscription({
      organizationId: "org-1",
      moduleKey: "crm",
      tier: "BASIC",
      billingCycle: "MONTHLY",
      autoRenew: true,
      actorId: "user-1",
    });
    const data = onlyCreate();
    expect(data.tier).toBe(UNTIERED_LEGACY_TIER);
    expect(String(data.amount)).toBe("249");
  });

  it("stores full access for a suite, whose price was set when a module meant the module", async () => {
    await createSelfServiceBundleSubscription({
      organizationId: "org-1",
      bundleKey: "business-starter",
      billingCycle: "MONTHLY",
      autoRenew: true,
      actorId: "user-1",
    });
    expect(onlyCreate().tier).toBe(UNTIERED_LEGACY_TIER);
  });

  it("stores full access for an ad-hoc cart, for the same reason", async () => {
    await createSelfServiceCartSubscription({
      organizationId: "org-1",
      moduleKeys: ["crm", "inventory"],
      billingCycle: "MONTHLY",
      autoRenew: true,
      actorId: "user-1",
    });
    expect(onlyCreate().tier).toBe(UNTIERED_LEGACY_TIER);
  });

  it("defaults an operator-entered agreement to full access, never to the restricted end", async () => {
    await createSubscription({
      organizationId: "org-1",
      moduleId: "module-1",
      mode: "MANUAL_OFFLINE",
      durationMonths: 12,
      amount: "7500",
      currency: "GHS",
      autoRenew: false,
      seatLimit: 40,
      actorId: "user-1",
    });
    expect(onlyCreate().tier).toBe(UNTIERED_LEGACY_TIER);
  });

  it("honours the tier an operator chose on the form", async () => {
    await createSubscription({
      organizationId: "org-1",
      moduleId: "module-1",
      mode: "MANUAL_OFFLINE",
      durationMonths: 12,
      amount: "2990",
      currency: "GHS",
      autoRenew: false,
      tier: "BASIC",
      seatLimit: 10,
      actorId: "user-1",
    });
    expect(onlyCreate().tier).toBe("BASIC");
  });
});

describe("the invariant itself", () => {
  it("has no subscription.create in the service that omits a tier", async () => {
    // The behavioural tests above cover the four paths that exist today. This
    // one fails when a fifth is added without a tier, which is the mistake
    // that actually happened and would otherwise reach production priced as
    // a full module and entitled as a Basic one.
    const { readFile } = await import("node:fs/promises");
    const source = await readFile(new URL("../src/platform/subscriptions/service.ts", import.meta.url), "utf8");

    const blocks: string[] = [];
    const needle = "subscription.create({";
    for (let index = source.indexOf(needle); index !== -1; index = source.indexOf(needle, index + 1)) {
      // Each create call's object literal, up to the line that closes it at
      // the same indentation the call opened on.
      const end = source.indexOf("\n    });", index);
      blocks.push(source.slice(index, end === -1 ? source.length : end));
    }

    expect(blocks.length).toBeGreaterThanOrEqual(4);
    const missing = blocks.filter((block) => !/\btier:/.test(block));
    expect(missing, `subscription.create call(s) with no tier:\n\n${missing.join("\n\n---\n\n")}`).toEqual([]);
  });
});
