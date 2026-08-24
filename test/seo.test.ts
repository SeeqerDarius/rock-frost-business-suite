import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import robots from "@/app/robots";
import sitemap from "@/app/sitemap";
import { MODULE_SEO, SITE_URL, createPublicMetadata } from "@/lib/seo";
import { catalogueModuleKeys } from "@/platform/modules/registry";
import nextConfig from "../next.config";

describe("public SEO", () => {
  it("publishes only real public pages and every module landing page", () => {
    const urls = sitemap().map((entry) => entry.url);
    expect(urls).toContain(`${SITE_URL}/solutions`);
    expect(urls).toContain(`${SITE_URL}/company`);
    expect(urls).toContain(`${SITE_URL}/pricing`);
    expect(urls).toContain(`${SITE_URL}/cookie-policy`);
    expect(urls).not.toContain(`${SITE_URL}/features`);
    expect(urls).not.toContain(`${SITE_URL}/about`);
    expect(urls).not.toContain(`${SITE_URL}/login`);
    for (const key of catalogueModuleKeys) {
      expect(key in MODULE_SEO).toBe(true);
      expect(urls).toContain(`${SITE_URL}/modules/${key}`);
    }
    expect(urls).not.toContain(`${SITE_URL}/modules/payroll`);
    expect(urls).not.toContain(`${SITE_URL}/modules/procurement`);
  });

  it("blocks private application, API, and authentication routes from crawling", () => {
    const config = robots();
    const rules = Array.isArray(config.rules) ? config.rules[0] : config.rules;
    expect(rules.disallow).toEqual(expect.arrayContaining(["/app/", "/api/", "/login", "/invite"]));
    expect(config.sitemap).toBe(`${SITE_URL}/sitemap.xml`);
    expect(config.host).toBe("www.rockfrostgroup.com");
  });

  it("builds canonical, Open Graph, and Twitter metadata", () => {
    const metadata = createPublicMetadata({
      title: "Example",
      description: "Example description",
      path: "/example",
    });
    expect(metadata.alternates).toEqual({ canonical: `${SITE_URL}/example` });
    expect(metadata.openGraph).toMatchObject({ url: `${SITE_URL}/example`, title: "Example" });
    expect(metadata.twitter).toMatchObject({ card: "summary_large_image", title: "Example" });
  });

  it("returns permanent HTTP redirects for retired companion product pages", async () => {
    const redirects = await nextConfig.redirects?.();
    expect(redirects).toEqual(expect.arrayContaining([
      { source: "/modules/payroll", destination: "/modules/hr", permanent: true },
      { source: "/modules/procurement", destination: "/modules/inventory", permanent: true },
    ]));
  });

  it("marks noIndex pages as not indexable while staying followable and canonical", () => {
    const indexable = createPublicMetadata({ title: "Example", description: "Example description", path: "/example" });
    expect(indexable.robots).toBeUndefined();

    const noIndex = createPublicMetadata({ title: "Example", description: "Example description", path: "/example", noIndex: true });
    expect(noIndex.robots).toEqual({ index: false, follow: true });
    expect(noIndex.alternates).toEqual({ canonical: `${SITE_URL}/example` });
  });

  it("keeps the post-subscribe flow out of the search index and free of exposed customer emails", () => {
    const subscribePage = readFileSync("src/app/(public)/subscribe/page.tsx", "utf8");
    const thankYouPage = readFileSync("src/app/(public)/subscribe/thank-you/page.tsx", "utf8");
    const subscribeActions = readFileSync("src/app/(public)/subscribe/actions.ts", "utf8");
    expect(subscribePage).toContain("noIndex: true");
    expect(thankYouPage).toContain("noIndex: true");
    expect(subscribeActions).not.toMatch(/redirect\(`\/subscribe\/thank-you[^)]*email/);
    expect(subscribeActions).not.toContain("?email=");
  });
});
