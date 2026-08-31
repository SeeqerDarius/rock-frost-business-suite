import fs from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * Track 3 of the Fleet/Accounting redesign: a systemic audit found that
 * several Fleet management pages computed a `canManage` permission flag but
 * only ever used it to hide write-UI (buttons/columns) - the underlying
 * roster/list was still fetched and rendered for any role that could reach
 * the Fleet module shell at all (Driver, Mechanic, Vehicle Owner included),
 * relying solely on the sidebar nav link being hidden as the real boundary.
 * "Hiding navigation alone is insufficient" - every page below now returns
 * an EmptyState before its data fetch when the viewer lacks the page's own
 * manage permission, matching the pattern already correct on
 * investor/reports/settings/mechanic-portal.
 */
const PAGES: { path: string; permission: string }[] = [
  { path: "src/app/app/fleet/vehicles/page.tsx", permission: "PERMISSIONS.FLEET_VEHICLES_MANAGE" },
  { path: "src/app/app/fleet/drivers/page.tsx", permission: "PERMISSIONS.FLEET_DRIVERS_MANAGE" },
  { path: "src/app/app/fleet/owners/page.tsx", permission: "PERMISSIONS.FLEET_OWNERS_MANAGE" },
  { path: "src/app/app/fleet/mechanics/page.tsx", permission: "PERMISSIONS.FLEET_MECHANICS_MANAGE" },
  { path: "src/app/app/fleet/insurance-roadworthy/page.tsx", permission: "PERMISSIONS.FLEET_INSURANCE_MANAGE" },
  { path: "src/app/app/fleet/payments/page.tsx", permission: "PERMISSIONS.FLEET_PAYMENTS_MANAGE" },
  { path: "src/app/app/fleet/work-and-pay/page.tsx", permission: "PERMISSIONS.FLEET_WORKANDPAY_MANAGE" },
];

describe("Fleet management pages independently re-check their own manage permission before fetching data", () => {
  for (const { path, permission } of PAGES) {
    it(`${path} returns an EmptyState before any data fetch when the viewer lacks ${permission}`, () => {
      const source = fs.readFileSync(path, "utf8");
      const canManageIndex = source.indexOf(`hasPermission(tenant, ${permission})`);
      expect(canManageIndex).toBeGreaterThan(-1);

      const guardIndex = source.indexOf("if (!canManage)", canManageIndex);
      expect(guardIndex).toBeGreaterThan(canManageIndex);

      const emptyStateIndex = source.indexOf("EmptyState", guardIndex);
      expect(emptyStateIndex).toBeGreaterThan(guardIndex);

      // The data-fetching Promise.all (or, for pages with a single query,
      // the query itself) must come AFTER the guard, not before it -
      // otherwise the fetch already ran before permission was checked.
      const promiseAllIndex = source.indexOf("Promise.all(", guardIndex);
      const guardCloseIndex = source.indexOf("}", emptyStateIndex);
      if (promiseAllIndex > -1) {
        expect(promiseAllIndex).toBeGreaterThan(guardCloseIndex);
      }
    });

    it(`${path} imports the Lock icon for its restricted-access state`, () => {
      const source = fs.readFileSync(path, "utf8");
      expect(source).toMatch(/from "lucide-react"/);
      expect(source).toContain("Lock");
    });
  }
});

describe("Vehicle Owner dashboard leak fix (Track 3)", () => {
  it("redirects Vehicle Owner to the owner workspace, matching Driver/Mechanic's existing treatment", () => {
    const dashboard = fs.readFileSync("src/app/app/(overview)/dashboard/page.tsx", "utf8");
    expect(dashboard).toContain("isFleetDriverRole, isMechanicRole, isFleetOwnerRole");
    expect(dashboard).toContain('if (isFleetOwnerRole(tenant)) redirect("/app/fleet/investor");');
    // The Vehicle Owner check must come after the null-tenant early return,
    // exactly like the other two narrow-role redirects it now sits beside.
    const nullTenantIndex = dashboard.indexOf("if (!tenant) {");
    const ownerRedirectIndex = dashboard.indexOf('if (isFleetOwnerRole(tenant)) redirect("/app/fleet/investor");');
    expect(ownerRedirectIndex).toBeGreaterThan(nullTenantIndex);
  });
});
