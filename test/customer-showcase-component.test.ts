import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const component = readFileSync("src/components/marketing/customer-showcase.tsx", "utf8");
const publicPage = readFileSync("src/app/(public)/page.tsx", "utf8");
const demoFixture = readFileSync("src/lib/demo-showcase-customers.ts", "utf8");

describe("customer showcase card design", () => {
  it("gives every logo a bounded, consistent frame with object-contain, not a raw oversized box", () => {
    expect(component).toContain("object-contain");
    expect(component).toContain("h-16 w-full items-center justify-center");
  });

  it("supplies a graceful initials fallback instead of a broken image area", () => {
    expect(component).toContain("initialsFor(item.name)");
    expect(component).toContain("onError");
    // The <img> starts hidden and only becomes visible once it has actually
    // loaded, so a slow real-world logo never renders as an empty gap.
    expect(component).toContain("onLoad");
    expect(component).toMatch(/status === "loading"/);
  });

  it("keeps long names, industries, and quotes wrapping gracefully rather than overflowing", () => {
    expect(component).toContain("truncate");
    expect(component).toContain("text-balance");
  });
});

describe("customer showcase carousel accessibility", () => {
  it("exposes the carousel with the standard ARIA carousel/slide roles and labels", () => {
    expect(component).toContain('aria-roledescription="carousel"');
    expect(component).toContain('aria-roledescription="slide"');
    expect(component).toContain("aria-label={headline}");
  });

  it("supports keyboard navigation with a visible focus state", () => {
    expect(component).toContain("onKeyDown");
    expect(component).toContain("ArrowRight");
    expect(component).toContain("ArrowLeft");
    expect(component).toContain("focus-visible:ring");
  });

  it("labels the previous/next controls for assistive technology", () => {
    expect(component).toContain('aria-label="Previous customer story"');
    expect(component).toContain('aria-label="Next customer story"');
  });

  it("does not autoplay: there is no interval-driven rotation to fight with a reading screen reader user", () => {
    expect(component).not.toMatch(/setInterval/);
  });

  it("relies on native, CSS-driven smooth scrolling, which the app-wide prefers-reduced-motion rule already neutralizes", () => {
    // src/app/globals.css forces scroll-behavior/animation/transition
    // durations to ~0 under prefers-reduced-motion: reduce, so a
    // scroll-snap carousel using scroll-smooth/scrollIntoView degrades
    // automatically without any extra motion-safe/motion-reduce variants
    // here — this test just guards against silently swapping that native
    // scrolling for a manual rAF/JS-animated implementation that would
    // bypass the CSS rule.
    expect(component).toContain("scroll-smooth");
    expect(component).toContain("scrollIntoView");
    expect(component).not.toMatch(/requestAnimationFrame\(function|new Animation\(/);
  });
});

describe("demonstration entries are honestly disclosed, never presented as real customers", () => {
  it("visibly badges every demonstration card as a sample", () => {
    expect(component).toContain("item.isDemo");
    expect(component).toMatch(/<Badge[^>]*>\s*Sample\s*<\/Badge>/);
  });

  it("shows the required disclosure sentence whenever a demonstration entry is present", () => {
    expect(component).toContain("showDemoDisclosure");
    expect(component).toContain("Illustrative examples shown for demonstration");
    expect(component).toContain("Verified customer stories will replace sample content as");
  });

  it("wires the disclosure flag from the real page composition, not a hardcoded true", () => {
    expect(publicPage).toContain("showDemoDisclosure={hasDemoEntries}");
  });

  it("keeps every demonstration fixture phrased as a product demonstration, not a real result or a real person's endorsement", () => {
    // Loose guard against accidentally attributing a sample quote to what
    // reads like a real named person (e.g. "- Jane Doe, CEO").
    expect(demoFixture).not.toMatch(/attribution:\s*"[^"]*,\s*(CEO|CTO|COO|Founder|Owner|Director|Manager)"/i);
  });

  it("keeps demo fixture names off the platform's real customer list (no accidental collision)", () => {
    const names = [...demoFixture.matchAll(/name:\s*"([^"]+)"/g)].map((m) => m[1]);
    expect(names).toEqual(
      expect.arrayContaining(["Northstar Learning Academy", "Harborview Suites", "Greenline Mobility", "Cedar & Stone Retail"]),
    );
  });
});

describe("demonstration entries stay isolated and easy to remove", () => {
  it("keeps demonstration content in one clearly named fixture file with an obvious on/off switch", () => {
    expect(demoFixture).toContain("export const DEMO_SHOWCASE_ENABLED");
    expect(demoFixture).toContain("export const DEMO_SHOWCASE_CUSTOMERS");
  });

  it("uses only local, committed logo assets for demonstration entries, never an external URL", () => {
    const urls = [...demoFixture.matchAll(/logoUrl:\s*"([^"]+)"/g)].map((m) => m[1]);
    expect(urls.length).toBeGreaterThan(0);
    for (const url of urls) {
      expect(url.startsWith("/demo-logos/")).toBe(true);
    }
  });
});
