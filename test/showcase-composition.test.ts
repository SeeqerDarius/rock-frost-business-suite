import { afterEach, describe, expect, it, vi } from "vitest";
import { buildShowcaseCustomers, SHOWCASE_CAP } from "../src/lib/showcase-composition";
import { DEMO_SHOWCASE_CUSTOMERS, MIN_SHOWCASE_ENTRIES_BEFORE_DEMO_FILL } from "../src/lib/demo-showcase-customers";
import type { CustomerShowcaseItem } from "../src/components/marketing/customer-showcase";

function realCustomer(id: string): CustomerShowcaseItem {
  return { id, name: `Real Org ${id}`, industry: "Testing", logoUrl: `/api/public/showcase-logo/${id}`, quote: "A real quote.", attribution: "A real attributor" };
}

describe("showcase composition (real vs. demonstration entries)", () => {
  it("never fabricates a demonstration entry that isn't clearly marked, and every demo fixture is flagged", () => {
    for (const demo of DEMO_SHOWCASE_CUSTOMERS) {
      expect(demo.attribution.toLowerCase()).toContain("demonstration");
    }
  });

  it("prioritizes real approved entries ahead of demonstration entries", () => {
    const real = [realCustomer("a"), realCustomer("b")];
    const { customers, hasDemoEntries } = buildShowcaseCustomers(real);

    expect(customers.slice(0, 2)).toEqual(real);
    expect(hasDemoEntries).toBe(true);
    expect(customers.every((c, i) => i < 2 || c.isDemo === true)).toBe(true);
  });

  it("supplements with demonstration entries only up to the configured minimum, never displacing real ones", () => {
    const real = [realCustomer("a")];
    const { customers } = buildShowcaseCustomers(real);

    expect(customers[0]).toEqual(real[0]);
    expect(customers.length).toBe(MIN_SHOWCASE_ENTRIES_BEFORE_DEMO_FILL);
    expect(customers.slice(1).every((c) => c.isDemo)).toBe(true);
  });

  it("shows no demonstration entries once there are enough real approved ones", () => {
    const real = Array.from({ length: MIN_SHOWCASE_ENTRIES_BEFORE_DEMO_FILL }, (_, i) => realCustomer(String(i)));
    const { customers, hasDemoEntries } = buildShowcaseCustomers(real);

    expect(hasDemoEntries).toBe(false);
    expect(customers).toEqual(real);
    expect(customers.some((c) => c.isDemo)).toBe(false);
  });

  it("shows no demonstration entries at all once real entries exceed the minimum", () => {
    const real = Array.from({ length: MIN_SHOWCASE_ENTRIES_BEFORE_DEMO_FILL + 3 }, (_, i) => realCustomer(String(i)));
    const { customers, hasDemoEntries } = buildShowcaseCustomers(real);

    expect(hasDemoEntries).toBe(false);
    expect(customers.length).toBe(real.length);
  });

  it("never exceeds the homepage display cap even when demo-filling", () => {
    const { customers } = buildShowcaseCustomers([]);
    expect(customers.length).toBeLessThanOrEqual(SHOWCASE_CAP);
  });

  it("returns nothing extra when there are zero real entries and demo fixtures are unavailable", () => {
    const { customers } = buildShowcaseCustomers([]);
    expect(customers.length).toBe(Math.min(DEMO_SHOWCASE_CUSTOMERS.length, MIN_SHOWCASE_ENTRIES_BEFORE_DEMO_FILL));
  });
});

describe("demonstration entries respect the configuration switch", () => {
  afterEach(() => {
    vi.doUnmock("../src/lib/demo-showcase-customers");
    vi.resetModules();
  });

  it("shows zero demonstration entries when DEMO_SHOWCASE_ENABLED is turned off, even with zero real entries", async () => {
    vi.resetModules();
    vi.doMock("../src/lib/demo-showcase-customers", async () => {
      const actual = await vi.importActual<typeof import("../src/lib/demo-showcase-customers")>("../src/lib/demo-showcase-customers");
      return { ...actual, DEMO_SHOWCASE_ENABLED: false };
    });

    const { buildShowcaseCustomers: buildWithSwitchOff } = await import("../src/lib/showcase-composition");
    const { customers, hasDemoEntries } = buildWithSwitchOff([]);

    expect(hasDemoEntries).toBe(false);
    expect(customers).toEqual([]);
  });
});
