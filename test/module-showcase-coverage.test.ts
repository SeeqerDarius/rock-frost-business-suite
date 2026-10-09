import { describe, expect, it } from "vitest";
import { publicCatalogueModuleRegistry } from "@/platform/modules/registry";
import { MODULE_SCREENSHOTS } from "@/components/marketing/module-showcase";

describe("module marketing screenshot coverage", () => {
  it("every publicly listed module has a real product screenshot configured", () => {
    const missing = publicCatalogueModuleRegistry
      .map((module_) => module_.key)
      .filter((key) => !MODULE_SCREENSHOTS[key]);
    expect(missing).toEqual([]);
    expect(Object.values(MODULE_SCREENSHOTS).every(({ src }) => src.startsWith("/screenshots/modules/"))).toBe(true);
  });
});
