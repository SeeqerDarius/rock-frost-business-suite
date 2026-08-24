import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const platformMarketing = readFileSync("src/lib/platform-marketing.ts", "utf8");
const publicContact = readFileSync("src/lib/public-contact.ts", "utf8");
const homePage = readFileSync("src/app/(public)/page.tsx", "utf8");
const settingsActions = readFileSync("src/app/app/platform/settings/actions.ts", "utf8");
const organizationsActions = readFileSync("src/app/app/platform/organizations/actions.ts", "utf8");

describe("public marketing data caching", () => {
  it("wraps every public marketing read in unstable_cache tagged with the shared cache tag", () => {
    expect(platformMarketing).toContain('export const PUBLIC_MARKETING_CACHE_TAG = "public-marketing"');
    expect(platformMarketing).toContain("unstable_cache(");
    expect(platformMarketing).toMatch(/tags:\s*\[PUBLIC_MARKETING_CACHE_TAG\]/);
    expect(publicContact).toContain("unstable_cache(");
    expect(publicContact).toMatch(/tags:\s*\[PUBLIC_MARKETING_CACHE_TAG\]/);
    expect(homePage).toContain("unstable_cache(");
    expect(homePage).toMatch(/tags:\s*\[PUBLIC_MARKETING_CACHE_TAG\]/);
  });

  it("keeps the homepage's per-request connection() guard so builds never require database access", () => {
    expect(homePage).toContain('import { connection } from "next/server"');
    expect(homePage).toContain("await connection();");
  });

  it("busts the cache tag from every action that changes cached public marketing data", () => {
    expect(settingsActions).toContain("updateTag(PUBLIC_MARKETING_CACHE_TAG)");
    expect(organizationsActions).toContain("updateTag(PUBLIC_MARKETING_CACHE_TAG)");
  });
});
