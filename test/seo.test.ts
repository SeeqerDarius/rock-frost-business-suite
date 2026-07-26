import { describe, expect, it } from "vitest";
import robots from "@/app/robots";
import sitemap from "@/app/sitemap";
import { MODULE_SEO, SITE_URL, createPublicMetadata } from "@/lib/seo";

describe("public SEO", () => {
  it("publishes only real public pages and every module landing page", () => {
    const urls = sitemap().map((entry) => entry.url);
    expect(urls).toContain(`${SITE_URL}/solutions`);
    expect(urls).toContain(`${SITE_URL}/company`);
    expect(urls).not.toContain(`${SITE_URL}/features`);
    expect(urls).not.toContain(`${SITE_URL}/pricing`);
    expect(urls).not.toContain(`${SITE_URL}/about`);
    expect(urls).not.toContain(`${SITE_URL}/login`);
    for (const key of Object.keys(MODULE_SEO)) {
      expect(urls).toContain(`${SITE_URL}/modules/${key}`);
    }
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
});
