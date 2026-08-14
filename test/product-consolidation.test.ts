import { describe, expect, it } from "vitest";
import { MODULE_PRICE_BY_KEY } from "@/lib/pricing";
import { catalogueModuleRegistry, getModule } from "@/platform/modules/registry";
import { expandProductModuleKeys, primaryProductKey, productGroupKeys } from "@/platform/modules/product-groups";

describe("consolidated module products", () => {
  it("sells HR with Payroll and Inventory with Procurement as single products", () => {
    const catalogueKeys = catalogueModuleRegistry.map((module) => module.key);
    expect(catalogueKeys).toContain("hr");
    expect(catalogueKeys).toContain("inventory");
    expect(catalogueKeys).not.toContain("payroll");
    expect(catalogueKeys).not.toContain("procurement");
    expect(getModule("payroll")?.productKey).toBe("hr");
    expect(getModule("procurement")?.productKey).toBe("inventory");
  });

  it("expands legacy and primary entitlements in both directions", () => {
    expect(productGroupKeys("hr")).toEqual(["hr", "payroll"]);
    expect(productGroupKeys("payroll")).toEqual(["hr", "payroll"]);
    expect(productGroupKeys("inventory")).toEqual(["inventory", "procurement"]);
    expect(productGroupKeys("procurement")).toEqual(["inventory", "procurement"]);
    expect(primaryProductKey("payroll")).toBe("hr");
    expect(primaryProductKey("procurement")).toBe("inventory");
    expect(expandProductModuleKeys(["payroll", "procurement"]).sort()).toEqual(
      ["hr", "inventory", "payroll", "procurement"].sort(),
    );
  });

  it("keeps prices only on customer-facing products", () => {
    expect(MODULE_PRICE_BY_KEY.has("hr")).toBe(true);
    expect(MODULE_PRICE_BY_KEY.has("inventory")).toBe(true);
    expect(MODULE_PRICE_BY_KEY.has("payroll")).toBe(false);
    expect(MODULE_PRICE_BY_KEY.has("procurement")).toBe(false);
  });
});
