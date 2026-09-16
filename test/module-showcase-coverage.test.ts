import { describe, expect, it } from "vitest";
import { catalogueModuleRegistry } from "@/platform/modules/registry";
import { MODULE_SCREENSHOTS } from "@/components/marketing/module-showcase";

describe("module marketing screenshot coverage", () => {
  it("every catalogue-visible module has a real product screenshot configured", () => {
    const missing = catalogueModuleRegistry
      .map((module_) => module_.key)
      .filter((key) => !MODULE_SCREENSHOTS[key]);
    expect(missing).toEqual([]);
    expect(Object.values(MODULE_SCREENSHOTS).every(({ src }) => src.startsWith("/screenshots/modules/"))).toBe(true);
  });
});
