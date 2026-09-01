import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { getEnabledModuleTiles } from "@/platform/modules/enabled-module-tiles";

/**
 * Every activated module should be visible in the sidebar at once: the
 * module the current page belongs to shows its own real pages directly, and
 * every other enabled module is a single flat link beneath it - no
 * click-to-expand step is needed to see what's inside the module you're
 * already in. AppShell renders this via ModuleSectionsNav, driven by
 * getFullModuleNavigation(), which computes every enabled module's own
 * permission-filtered page list server-side, reusing each module's own
 * filtering function (Fleet, Installment, HR+Payroll,
 * Inventory+Procurement) so a role's real access can never drift between
 * the module's own layout and the sidebar. An earlier revision rendered
 * this as a true click-to-expand accordion, one module open at a time;
 * that was reverted back to this flatter, always-visible design.
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

describe("ModuleSectionsNav", () => {
  const sectionsNav = readFileSync("src/components/navigation/module-sections-nav.tsx", "utf8");

  it("is a client component with no open/closed state - the current section is derived fresh from the pathname every render", () => {
    expect(sectionsNav).toContain('"use client"');
    expect(sectionsNav).not.toContain("useState");
    expect(sectionsNav).not.toContain("useEffect");
  });

  it("matches the current module by each item's own href, not only the section's routePrefix", () => {
    // HR and Inventory each combine a second route tree (Payroll,
    // Procurement) whose pages live under a different prefix entirely -
    // matching on routePrefix alone would miss a Payroll or Procurement page.
    expect(sectionsNav).toContain("section.items.some((item) => pathBelongsTo(pathname, item.href))");
  });

  it("renders the current section's real items directly, not behind a toggle", () => {
    expect(sectionsNav).toContain("currentSection ? (");
    expect(sectionsNav).toContain("<SidebarNav items={currentSection.items}");
  });

  it("renders every other enabled module as a single flat link grouped under one heading, not an inline expand toggle", () => {
    expect(sectionsNav).toContain('group: "Other modules"');
    expect(sectionsNav).not.toContain("ChevronDown");
  });
});

describe("AppShell: moduleSections prop and ModuleSectionsNav wiring", () => {
  const appShell = readFileSync("src/components/layout/app-shell.tsx", "utf8");

  it("accepts moduleSections and renders it via ModuleSectionsNav in both the desktop sidebar and the mobile sheet", () => {
    expect(appShell).toContain("moduleSections?: ModuleNavSection[]");
    const occurrences = appShell.split("<ModuleSectionsNav").length - 1;
    expect(occurrences).toBe(2);
  });

  it("suppresses the flat navigation list inside a business module (already ModuleSectionsNav's own current section) to avoid showing the same pages twice", () => {
    expect(appShell).toContain("const showFlatNavigation = !moduleKey");
  });

  it("stamps the onboarding tour's data-tour-nav targets on the current section only when the flat list isn't also rendering them", () => {
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
