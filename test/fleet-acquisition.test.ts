import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("Fleet public acquisition", () => {
  it("gives prospects a low-friction, measurable pilot path", () => {
    const modulePage = readFileSync("src/app/(public)/modules/[moduleKey]/page.tsx", "utf8");
    const contactPage = readFileSync("src/app/(public)/contact/page.tsx", "utf8");
    const conversionLink = readFileSync("src/components/marketing/conversion-link.tsx", "utf8");

    expect(modulePage).toContain("14-day assisted Fleet pilot");
    expect(modulePage).toContain("Book a Fleet walkthrough");
    expect(modulePage).toContain("/pricing#fleet-pricing");
    expect(contactPage).toContain("Show us how your fleet operates.");
    expect(contactPage).toContain('name="moduleCode" value="fleet"');
    expect(conversionLink).toContain('readCookieConsent(document.cookie) === "analytics"');
  });
});
