import { describe, expect, it } from "vitest";
import { catalogueModuleRegistry } from "@/platform/modules/registry";
import { MODULE_SHOWCASES } from "@/components/marketing/module-showcase";

describe("module marketing showcase coverage", () => {
  it("every catalogue-visible module has a marketing preview configured", () => {
    const missing = catalogueModuleRegistry
      .map((module_) => module_.key)
      .filter((key) => !MODULE_SHOWCASES[key]);
    expect(missing).toEqual([]);
  });
});
