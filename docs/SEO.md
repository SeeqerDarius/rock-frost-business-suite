# Search engine optimization

## Canonical public host

The canonical public website is `https://www.rockfrostgroup.com`. All public
metadata, Open Graph URLs, structured data, sitemap entries, and the robots
host directive use that origin. Tenant and platform application hosts are not
search landing pages.

## Indexable routes

The indexable surface is deliberately limited to:

- `/`
- `/solutions`
- `/modules`
- `/modules/{module-key}` for all thirteen available modules, including dedicated
  Hotel and School metadata, features, canonical URLs, and acquisition links
- `/industries`
- `/company`
- `/contact`

`/app/*`, `/api/*`, and all authentication/token routes are disallowed in
`robots.ts`. Authenticated and authentication layouts additionally emit
`noindex`, `nofollow`, and `nocache` metadata. Do not add login or application
URLs to the sitemap.

## Metadata and structured data

`src/lib/seo.ts` is the authoritative source for the public origin, default
description, metadata builder, and module search content. Every public route
has a unique title, description, canonical URL, keywords, Open Graph data, and
Twitter card data.

The public layout publishes truthful `Organization` and `WebSite` JSON-LD.
The home page and module pages publish `SoftwareApplication` JSON-LD, and
module pages also publish breadcrumbs. Do not add fabricated pricing, ratings,
reviews, physical addresses, or social profiles. Add those fields only when
the underlying public business information is confirmed.

`src/app/opengraph-image.tsx` provides the 1200×630 social-sharing image.
`src/app/sitemap.ts` and `src/app/robots.ts` generate their production
responses; there must not be competing static copies in `public/`.

## External launch checklist

The owner must complete these external actions after deployment:

1. Add `rockfrostgroup.com` as a Domain property in Google Search Console and
   verify it with the exact Google-provided DNS TXT record in Cloudflare.
2. Submit `https://www.rockfrostgroup.com/sitemap.xml` in Search Console.
3. Inspect the home page and the most important module pages, then request
   indexing.
4. Validate representative pages using Google's Rich Results Test.
5. Monitor Page Indexing, Core Web Vitals, search queries, clicks, impressions,
   and click-through rate. SEO is an ongoing measurement process; technical
   completeness does not guarantee a ranking position.

The verification TXT value is account-specific and must never be invented or
committed without the owner's actual value. On 2026-07-28 the application-side
SEO work and live sitemap validation were complete: the production sitemap
returned HTTP 200 as XML with 17 canonical URLs and `robots.txt` returned HTTP
200. No controllable authenticated browser session was available for the
Google account workflow, however. Search Console ownership verification and
sitemap submission must only be marked complete after Google visibly confirms
both actions.
