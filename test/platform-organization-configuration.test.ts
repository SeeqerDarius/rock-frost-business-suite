import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import {
  ORGANIZATION_ADDONS,
  SMS_NOTIFICATION_MODULES,
  addonModulesInUse,
  moduleScopedAddons,
  organizationAddon,
  organizationScopedAddons,
} from "@/platform/organizations/feature-addons";
import { getPlatformNavigation } from "@/platform/modules/platform-navigation";

const schema = readFileSync(path.join(process.cwd(), "prisma", "schema.prisma"), "utf8");
const pageSource = readFileSync(
  path.join(process.cwd(), "src", "app", "app", "platform", "organizations", "[organizationId]", "page.tsx"),
  "utf8",
);

function organizationModelBody(): string {
  const start = schema.indexOf("\nmodel Organization {");
  const end = schema.indexOf("\n}", start);
  return schema.slice(start, end);
}

describe("organization feature add-on catalogue", () => {
  it("names grant columns that really exist on the Organization model", () => {
    // The pane reads `organization[addon.grantField]` by key, so a renamed
    // column would type-check against Prisma's generated client but silently
    // render every add-on as "Not granted" if the catalogue drifted.
    const body = organizationModelBody();
    for (const addon of ORGANIZATION_ADDONS) {
      expect(body, addon.key).toContain(`${addon.grantField} `);
      expect(body, addon.key).toContain(`${addon.grantedAtField} `);
    }
  });

  it("declares exactly the modules that carry their own SMS switch", () => {
    // The SMS add-on's help text promises the operator that granting it only
    // unlocks each module's own smsNotificationsEnabled toggle. That promise
    // is only true for modules whose settings model actually has the column.
    const settingsModelsWithSms = [...schema.matchAll(/model (\w+)Settings \{([\s\S]*?)\n\}/g)]
      .filter(([, , body]) => body.includes("smsNotificationsEnabled"))
      .map(([, name]) => name.toLowerCase());

    expect([...SMS_NOTIFICATION_MODULES].sort()).toEqual(settingsModelsWithSms.sort());
  });

  it("nests a module-scoped add-on under its own module only", () => {
    expect(moduleScopedAddons("school").map((addon) => addon.key)).toEqual(["schoolPortal"]);
    expect(moduleScopedAddons("hotel")).toEqual([]);
    expect(moduleScopedAddons("fleet")).toEqual([]);
  });

  it("keeps multi-module grants out of any single module's row", () => {
    const shared = organizationScopedAddons().map((addon) => addon.key);
    expect(shared).toEqual(["offlineAccess", "smsNotifications"]);
    expect(shared).not.toContain("schoolPortal");
    // Every add-on is rendered exactly once: either nested under its module
    // or in the shared group, never both and never neither.
    const nested = ORGANIZATION_ADDONS.filter((addon) => addon.scope === "module").map((addon) => addon.key);
    expect([...shared, ...nested].sort()).toEqual(ORGANIZATION_ADDONS.map((addon) => addon.key).sort());
  });

  it("resolves an add-on's reach against what the organization actually enabled", () => {
    const sms = organizationAddon("smsNotifications");
    expect(addonModulesInUse(sms, ["school", "fleet", "hotel"])).toEqual(["hotel", "school"]);
    expect(addonModulesInUse(sms, ["fleet", "crm"])).toEqual([]);
    expect(addonModulesInUse(organizationAddon("schoolPortal"), ["school"])).toEqual(["school"]);
  });

  it("throws on an unknown add-on key rather than rendering an empty row", () => {
    expect(() => organizationAddon("nope" as never)).toThrow("Unknown organization add-on");
  });
});

describe("organization configuration pane", () => {
  it("renders every section it offers in the navigation", () => {
    // Guards the one failure mode of a ?section= pane: a key listed in the
    // section nav with no branch rendering it, which looks like a dead tab.
    const declared = [...pageSource.matchAll(/^\s*\["([a-z]+)", "[^"]+"\],$/gm)].map(([, key]) => key);
    expect(declared.length).toBeGreaterThan(1);
    for (const key of declared) {
      expect(pageSource, key).toContain(`section === "${key}"`);
    }
  });

  it("routes every section a Server Action redirects back with to a real section", () => {
    const declared = new Set([...pageSource.matchAll(/^\s*\["([a-z]+)", "[^"]+"\],$/gm)].map(([, key]) => key));
    const mapped = [...pageSource.matchAll(/^\s*"?[\w-]+"?: "([a-z]+)",$/gm)].map(([, key]) => key);
    expect(mapped.length).toBeGreaterThan(0);
    for (const key of mapped) expect(declared, key).toContain(key);
  });

  it("stays operator-only", () => {
    expect(pageSource).toContain("requirePlatformOperator()");
    expect(pageSource).toContain("isPlatformAnchorOrganization");
  });
});

describe("platform sidebar navigation", () => {
  it("groups every destination after the overview and explains each one", () => {
    const items = getPlatformNavigation();
    const [overview, ...grouped] = items;

    expect(overview.group).toBeUndefined();
    for (const item of grouped) expect(item.group, item.label).toBeTruthy();
    for (const item of items) expect(item.description, item.label).toBeTruthy();
  });

  it("keeps each group's items contiguous so one label covers them all", () => {
    // SidebarNav prints a group heading only when an item's group differs
    // from the previous item's, so a group split across the list would render
    // its heading twice.
    const groups = getPlatformNavigation().map((item) => item.group);
    const firstSeenAt = new Map<string | undefined, number>();
    groups.forEach((group, index) => {
      if (!firstSeenAt.has(group)) firstSeenAt.set(group, index);
    });
    for (const [group, start] of firstSeenAt) {
      const last = groups.lastIndexOf(group);
      expect(groups.slice(start, last + 1).every((value) => value === group), String(group)).toBe(true);
    }
  });
});
