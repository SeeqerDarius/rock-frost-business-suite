import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * The homepage was restructured to match a competitor's landing-page flow
 * (hero -> module overview -> feature spotlights -> trust/differentiators ->
 * FAQ -> closing CTA) after a direct user request to look at that
 * competitor's page and match its structure - deliberately keeping Rock
 * Frost's own visual identity and writing entirely original copy, never
 * reproducing the competitor's actual marketing text.
 */
describe("homepage restructure", () => {
  const homepage = readFileSync(resolve("src/app/(public)/page.tsx"), "utf8");
  const whyRockFrost = readFileSync(resolve("src/components/marketing/why-rock-frost.tsx"), "utf8");
  const faq = readFileSync(resolve("src/components/marketing/homepage-faq.tsx"), "utf8");

  it("adds feature-spotlight sections for three distinct modules, alternating layout for visual rhythm", () => {
    expect(homepage).toContain("<AccountingModuleShowcase />");
    expect(homepage).toContain("<FleetModuleShowcase reverse />");
    expect(homepage).toContain("<PharmacyModuleShowcase />");
    expect(homepage).toContain('href="/modules/accounting"');
    expect(homepage).toContain('href="/modules/fleet"');
    expect(homepage).toContain('href="/modules/pharmacy"');
  });

  it("adds a trust/differentiators section with only real, currently-implemented claims", () => {
    expect(homepage).toContain("<WhyRockFrost />");
    // Never state an external certification or a fabricated adoption metric
    // here - see docs/COMPLIANCE_AND_ASSURANCE.md, which explicitly
    // distinguishes implemented product controls from certifications no
    // current document backs.
    for (const forbidden of ["SOC 2", "ISO 27001", "ISO/IEC 27001", "DPC-approved", "GRA-approved", "40,000", "40K"]) {
      expect(whyRockFrost).not.toContain(forbidden);
    }
  });

  it("adds an FAQ section with original, accurate answers grounded in already-published product facts", () => {
    expect(homepage).toContain("<HomepageFaq />");
    expect(faq).toContain("Trial workspaces are limited to three customer-facing products");
    expect(faq).toContain("JSON system backups");
  });
});
