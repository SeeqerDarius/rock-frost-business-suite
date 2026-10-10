import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import robots from "@/app/robots";
import sitemap from "@/app/sitemap";
import { MODULE_SEO, SITE_URL, createPublicMetadata } from "@/lib/seo";
import { getModule, publicCatalogueModuleKeys } from "@/platform/modules/registry";
import { RESOURCE_ARTICLES } from "@/lib/resource-articles";
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
    // Every publicly listed module has a landing page; unlisted modules (Contracts) have none yet.
    for (const key of publicCatalogueModuleKeys) {
      expect(key in MODULE_SEO).toBe(true);
      expect(urls).toContain(`${SITE_URL}/modules/${key}`);
    }
    expect(urls).not.toContain(`${SITE_URL}/modules/contracts`);
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

  it("publishes deeper search content for priority Ghana module queries", () => {
    for (const key of ["fleet", "inventory", "hr", "hotel", "school"] as const) {
      const seo = MODULE_SEO[key];
      expect(seo.shortName).toContain("Ghana");
      expect(seo.content.outcomes).toHaveLength(3);
      expect(seo.content.workflows.length).toBeGreaterThanOrEqual(5);
      // School carries a fourth FAQ for its optional Assignments & Assessments add-on.
      expect(seo.content.faqs.length).toBeGreaterThanOrEqual(3);
      expect(seo.content.faqs.length).toBeLessThanOrEqual(4);
      expect(seo.content.ghana?.length).toBeGreaterThan(0);
      expect(seo.content.security?.length).toBeGreaterThan(0);
      for (const integration of seo.content.integrations ?? []) {
        expect(getModule(integration.module)).toBeDefined();
      }
    }

    const modulePage = readFileSync("src/app/(public)/modules/[moduleKey]/page.tsx", "utf8");
    expect(modulePage).toContain('"@type": "FAQPage"');
    expect(modulePage).toContain("Who this software is for");
    expect(modulePage).toContain("How your team can use it");
    expect(modulePage).toContain("Connected Rock Frost modules");
  });

  it("does not claim automated PAYE or SSNIT calculation that Payroll does not implement", () => {
    const hrFaqs = MODULE_SEO.hr.content.faqs.map((faq) => `${faq.question} ${faq.answer}`).join(" ");
    expect(hrFaqs).toMatch(/PAYE/);
    expect(hrFaqs).toMatch(/SSNIT/);
    expect(hrFaqs).toMatch(/Not yet/);

    const payrollService = readFileSync("src/modules/payroll/service.ts", "utf8");
    expect(payrollService).not.toMatch(/SSNIT/i);
  });

  it("publishes the resources guides section and links each article to a real destination", () => {
    const urls = sitemap().map((entry) => entry.url);
    expect(urls).toContain(`${SITE_URL}/resources`);

    const config = robots();
    const rules = Array.isArray(config.rules) ? config.rules[0] : config.rules;
    expect(rules.allow).toEqual(expect.arrayContaining(["/resources"]));

    expect(RESOURCE_ARTICLES.length).toBeGreaterThanOrEqual(5);
    for (const article of RESOURCE_ARTICLES) {
      expect(urls).toContain(`${SITE_URL}/resources/${article.slug}`);
      expect(article.description.length).toBeLessThanOrEqual(160);
      if (article.relatedModuleKey) {
        expect(article.relatedModuleKey in MODULE_SEO).toBe(true);
        expect(getModule(article.relatedModuleKey)).toBeDefined();
      } else {
        expect(article.relatedPath).toBeTruthy();
      }
    }
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

describe("multi-module public positioning", () => {
  it("leads public module lists with cross-industry modules, not Fleet", async () => {
    const { publicCatalogueModuleKeys, catalogueModuleKeys } = await import("@/platform/modules/registry");
    expect(publicCatalogueModuleKeys[0]).toBe("accounting");
    expect(publicCatalogueModuleKeys.indexOf("fleet")).toBeGreaterThan(publicCatalogueModuleKeys.indexOf("school"));
    // Every catalogue module is public unless it is deliberately unlisted (publicListing: false).
    const { catalogueModuleRegistry } = await import("@/platform/modules/registry");
    const listed = catalogueModuleRegistry.filter((module_) => module_.publicListing !== false).map((module_) => module_.key);
    expect([...publicCatalogueModuleKeys].sort()).toEqual([...listed].sort());
    expect(catalogueModuleKeys).toContain("contracts");
    expect(publicCatalogueModuleKeys).not.toContain("contracts");
  });

  it("describes the suite without leading on a single vertical", async () => {
    const { DEFAULT_DESCRIPTION, MODULE_SEO } = await import("@/lib/seo");
    expect(DEFAULT_DESCRIPTION.length).toBeLessThanOrEqual(160);
    expect(DEFAULT_DESCRIPTION.toLowerCase().indexOf("accounting")).toBeLessThan(DEFAULT_DESCRIPTION.toLowerCase().indexOf("fleet"));
    expect(MODULE_SEO.accounting.content?.faqs.length).toBeGreaterThan(0);
  });
});
