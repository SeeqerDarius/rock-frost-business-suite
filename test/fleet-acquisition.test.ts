import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("module public acquisition", () => {
  it("gives every module a low-friction, measurable pilot path", () => {
    const modulePage = readFileSync("src/app/(public)/modules/[moduleKey]/page.tsx", "utf8");
    const contactPage = readFileSync("src/app/(public)/contact/page.tsx", "utf8");
    const conversionLink = readFileSync("src/components/marketing/conversion-link.tsx", "utf8");

    expect(modulePage).toContain("14-day assisted pilot");
    expect(modulePage).toContain("Book a walkthrough");
    expect(modulePage).toContain("/pricing#${moduleKey}-pricing");
    expect(contactPage).toContain("Show us how your team works.");
    expect(contactPage).toContain('name="moduleCode" value={selectedModule?.key}');
    expect(conversionLink).toContain('readCookieConsent(document.cookie) === "analytics"');
  });
});
