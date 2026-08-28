import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { getEnabledModuleTiles } from "@/platform/modules/enabled-module-tiles";

/**
 * User request (after seeing a competitor ERP's sidebar): every activated
 * module should be visible in the sidebar at once, not just the one you're
 * currently in - click one and it "drops down" into its own pages. Rather
 * than centralizing every module's permission-filtered page list (only each
 * module's own layout knows which of its pages the current role can see),
 * AppShell now shows the current module's own already-filtered page list
 * expanded, plus every OTHER enabled module as a single collapsed link -
 * clicking one navigates into it, where its own layout takes over and
 * expands its real pages. Suppressed by the same showModuleLauncher flag
 * that already hides the header module launcher for locked-down roles.
 */
describe("getEnabledModuleTiles", () => {
  it("returns only modules the organization has actually enabled", () => {
    const tiles = getEnabledModuleTiles(["fleet"]);
    expect(tiles.map((t) => t.key)).toEqual(["fleet"]);
  });

  it("returns nothing when no modules are enabled", () => {
    expect(getEnabledModuleTiles([])).toEqual([]);
  });

  it("resolves a product-group key (e.g. payroll) back to its own module entry, not a locked one", () => {
    // hr and payroll share a product group (src/platform/modules/product-groups.ts);
    // an org with only Payroll enabled should still see a real, working tile.
    const tiles = getEnabledModuleTiles(["payroll"]);
    const hrTile = tiles.find((t) => t.key === "hr");
    expect(hrTile).toBeDefined();
    expect(hrTile?.routePrefix).not.toBe("");
  });

  it("excludes coming-soon/placeholder modules even if somehow marked enabled", () => {
    const tiles = getEnabledModuleTiles(["fleet", "installment", "crm", "inventory", "accounting", "hr", "procurement", "payroll", "analytics", "pos", "projects", "hotel", "school", "hostel", "pharmacy", "hospital"]);
    for (const tile of tiles) {
      expect(tile.routePrefix.startsWith("/app/")).toBe(true);
    }
  });
});

describe("AppShell all-modules sidebar wiring", () => {
  const appShell = readFileSync("src/components/layout/app-shell.tsx", "utf8");

  it("builds the other-modules list from the shared enabled-tiles helper, excluding the current module", () => {
    expect(appShell).toContain("getEnabledModuleTiles(enabledModuleKeys)");
    expect(appShell).toContain(".filter((tile) => tile.key !== moduleKey)");
  });

  it("suppresses the other-modules list under the same flag that hides the header module launcher", () => {
    expect(appShell).toContain("const otherModuleNavItems: ModuleNavItem[] = showModuleLauncher");
  });

  it("renders the other-modules list in both the desktop sidebar and the mobile sheet", () => {
    const occurrences = appShell.split("otherModuleNavItems.length > 0").length - 1;
    expect(occurrences).toBe(2);
  });

  it("never passes a raw icon component reference across the props boundary - only already-rendered elements", () => {
    // ModuleNavItem.icon must be a ReactNode (pre-rendered element), never a
    // component reference - see the comment on ModuleNavItem in
    // src/types/module.ts. AppShell renders <tile.icon .../> itself (a
    // client component invoking a component during its own render), then
    // hands the already-rendered element to SidebarNav - it never threads
    // the bare `tile.icon` reference through as a prop value.
    expect(appShell).toContain("icon: <tile.icon");
  });
});
