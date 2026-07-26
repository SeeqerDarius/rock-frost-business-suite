import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/seo";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: ["/", "/solutions", "/modules", "/modules/", "/industries", "/company", "/contact"],
      disallow: ["/app/", "/api/", "/login", "/forgot-password", "/reset-password", "/invite"],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: new URL(SITE_URL).host,
  };
}
