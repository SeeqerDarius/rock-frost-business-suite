import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { getEnabledModuleTiles } from "@/platform/modules/enabled-module-tiles";

/**
 * User request (after seeing a competitor ERP's sidebar): every activated
 * module should be visible in the sidebar at once, and clicking any one of
 * them - not just the module you're currently in - should expand its real
 * pages right there, no navigation required. AppShell now renders a true
 * accordion (ModuleAccordionNav) driven by getFullModuleNavigation(), which
 * computes every enabled module's own permission-filtered page list
 * server-side, reusing each module's own filtering function (Fleet,
 * Installment, HR+Payroll, Inventory+Procurement) so a role's real access
 * can never drift between the module's own layout and the sidebar.
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

describe("full-navigation: per-module tenant-aware page lists", () => {
  const fullNavigation = readFileSync("src/platform/modules/full-navigation.tsx", "utf8");

  it("routes Fleet, Installment, HR, and Inventory through the exact same functions their own layout.tsx uses, not a second copy", () => {
    expect(fullNavigation).toContain("getFleetNavigationForTenant(tenant)");
    expect(fullNavigation).toContain("getInstallmentNavigationForTenant(tenant)");
    expect(fullNavigation).toContain("getPeopleAndPayrollNavigation(tenant)");
    expect(fullNavigation).toContain("getInventoryProcurementNavigation(");
  });

  it("imports the permission-checking functions from dedicated navigation-access files, not from navigation.tsx directly", () => {
    // Regression guard for a real Turbopack build failure: navigation.tsx is
    // imported by registry.ts, which AppShell (a client component) also
    // imports - and @/lib/auth/permissions starts with `import "server-only"`.
    // Putting a tenant-aware, permission-checking function directly in
    // navigation.tsx poisons AppShell's client bundle with a server-only
    // dependency. See src/modules/fleet/navigation-access.ts's own comment.
    expect(fullNavigation).toContain('from "@/modules/fleet/navigation-access"');
    expect(fullNavigation).toContain('from "@/modules/installment/navigation-access"');
  });
});

describe("navigation.tsx files stay free of @/lib/auth/permissions (registry.ts's client-bundle boundary)", () => {
  it("Fleet and Installment's plain navigation arrays never import permissions.ts", () => {
    const fleetNav = readFileSync("src/modules/fleet/navigation.tsx", "utf8");
    const installmentNav = readFileSync("src/modules/installment/navigation.tsx", "utf8");
    expect(fleetNav).not.toContain("@/lib/auth/permissions");
    expect(installmentNav).not.toContain("@/lib/auth/permissions");
  });

  it("the dedicated navigation-access files do import permissions.ts, and are never imported by registry.ts", () => {
    const registry = readFileSync("src/platform/modules/registry.ts", "utf8");
    const fleetAccess = readFileSync("src/modules/fleet/navigation-access.ts", "utf8");
    const installmentAccess = readFileSync("src/modules/installment/navigation-access.ts", "utf8");
    expect(fleetAccess).toContain("@/lib/auth/permissions");
    expect(installmentAccess).toContain("@/lib/auth/permissions");
    expect(registry).not.toContain("navigation-access");
  });
});

describe("ModuleAccordionNav", () => {
  const accordion = readFileSync("src/components/navigation/module-accordion-nav.tsx", "utf8");

  it("is a client component that only ever expands one module at a time", () => {
    expect(accordion).toContain('"use client"');
    expect(accordion).toContain("useState<string | null>");
  });

  it("matches the current module by each item's own href, not only the section's routePrefix", () => {
    // HR and Inventory each combine a second route tree (Payroll,
    // Procurement) whose pages live under a different prefix entirely -
    // matching on routePrefix alone would never auto-expand while on a
    // Payroll or Procurement page.
    expect(accordion).toContain("section.items.some((item) => pathBelongsTo(pathname, item.href))");
  });

  it("never uses an effect to sync open state with navigation - every module lives under its own layout.tsx, so a real navigation always remounts this component fresh", () => {
    expect(accordion).not.toContain("useEffect");
  });

  it("collapsed mode renders a plain navigation link per module, not an inline expand toggle", () => {
    expect(accordion).toContain("<Link");
    expect(accordion).toContain("collapsed ?");
  });
});

describe("AppShell: moduleSections prop and accordion wiring", () => {
  const appShell = readFileSync("src/components/layout/app-shell.tsx", "utf8");

  it("accepts moduleSections and renders it via ModuleAccordionNav in both the desktop sidebar and the mobile sheet", () => {
    expect(appShell).toContain("moduleSections?: ModuleNavSection[]");
    const occurrences = appShell.split("<ModuleAccordionNav").length - 1;
    expect(occurrences).toBe(2);
  });

  it("suppresses the flat navigation list inside a business module (already the accordion's own current section) to avoid showing the same pages twice", () => {
    expect(appShell).toContain("const showFlatNavigation = !moduleKey");
  });

  it("stamps the onboarding tour's data-tour-nav targets on the accordion's current section only when the flat list isn't also rendering them", () => {
    expect(appShell).toContain("tourTargets={!showFlatNavigation}");
  });
});

describe("every tenant-facing module layout passes moduleSections, platform scope does not", () => {
  const modules = ["accounting", "analytics", "crm", "fleet", "hospital", "hostel", "hotel", "hr", "installment", "inventory", "payroll", "pharmacy", "pos", "procurement", "projects", "school"];

  it.each(modules)("%s/layout.tsx wires moduleSections from getFullModuleNavigation", (moduleKey) => {
    const layout = readFileSync(`src/app/app/${moduleKey}/layout.tsx`, "utf8");
    expect(layout).toContain("getFullModuleNavigation");
    expect(layout).toContain("moduleSections=");
  });

  it("the organization-scope Overview layout also wires moduleSections", () => {
    const layout = readFileSync("src/app/app/(overview)/layout.tsx", "utf8");
    expect(layout).toContain("getFullModuleNavigation");
    expect(layout).toContain("moduleSections=");
  });

  it("platform scope does not - platform operators don't browse tenant business modules", () => {
    const layout = readFileSync("src/app/app/platform/layout.tsx", "utf8");
    expect(layout).not.toContain("moduleSections");
    expect(layout).not.toContain("getFullModuleNavigation");
  });
});
