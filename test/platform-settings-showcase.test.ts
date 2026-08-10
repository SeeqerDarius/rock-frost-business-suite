import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const settingsActions = readFileSync("src/app/app/platform/settings/actions.ts", "utf8");
const settingsPage = readFileSync("src/app/app/platform/settings/page.tsx", "utf8");
const publicPage = readFileSync("src/app/(public)/page.tsx", "utf8");
const logoRoute = readFileSync("src/app/api/public/external-showcase-logo/[customerId]/route.ts", "utf8");
const userMenu = readFileSync("src/components/navigation/user-menu.tsx", "utf8");
const platformNavigation = readFileSync("src/platform/modules/platform-navigation.tsx", "utf8");

describe("platform owner settings and external customer showcase", () => {
  it("requires platform authorization and validates uploaded customer logos", () => {
    expect(settingsActions).toContain("requirePlatformContext()");
    expect(settingsActions).toContain("isPlatformOperator(tenant)");
    expect(settingsActions).toContain("isValidProfileImage(file)");
    expect(settingsActions).toContain("platform.showcase_customer_created");
    expect(settingsActions).toContain("platform.showcase_customer_deleted");
  });

  it("provides owner controls for copy, visibility, ordering, editing, and removal", () => {
    expect(settingsPage).toContain("Show customer stories on the home page");
    expect(settingsPage).toContain("Show customer industries");
    expect(settingsPage).toContain("saveExternalShowcaseCustomer");
    expect(settingsPage).toContain("moveExternalShowcaseCustomer");
    expect(settingsPage).toContain("deleteExternalShowcaseCustomer");
    expect(publicPage).toContain("marketing.showcaseEnabled");
    expect(publicPage).toContain("marketing.externalCustomers");
  });

  it("keeps hidden logos private and separates platform settings from profile settings", () => {
    expect(logoRoute).toContain("marketing.showcaseEnabled && customer.enabled");
    expect(logoRoute).toContain("await isPlatformUser(session.user.id)");
    expect(logoRoute).toContain('\"Cache-Control\": \"private, no-store\"');
    expect(userMenu).toContain("Profile settings");
    expect(userMenu).not.toContain('settingsHref');
    expect(platformNavigation).toContain("platformFooterNavigation");
  });
});
