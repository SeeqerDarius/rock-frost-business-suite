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
- `/modules/{module-key}` for all sixteen available modules, including dedicated
  Hotel, School, Hostel, Pharmacy, and Hospital metadata, features, canonical
  URLs, and acquisition links
- `/industries`
- `/company`
- `/contact`
- `/terms`
- `/privacy`
- `/cookie-policy`

`/app/*`, `/api/*`, and all authentication/token routes are disallowed in
`robots.ts`. Authenticated and authentication layouts additionally emit
`noindex`, `nofollow`, and `nocache` metadata. Do not add login or application
URLs to the sitemap.

## Non-indexable but reachable routes

`/subscribe` and `/subscribe/thank-you` are real, linked pages that must stay
reachable but must never be indexed or ranked: they are a checkout entry point
and a post-submit confirmation, not search-landing content. Both set
`noIndex: true` via `createPublicMetadata()` (`src/lib/seo.ts`), which adds
`robots: { index: false, follow: true }` to the page's metadata. Use this
option, not `robots.ts`, for a real page a crawler should leave alone but a
person can still open from a link (`robots.ts` is for paths that should not
exist for crawlers at all, such as `/app/*` and `/api/*`).

`startPublicSubscription` (`src/app/(public)/subscribe/actions.ts`) redirects
to `/subscribe/thank-you` without the submitted email in the URL. An email
address in an indexable, linkable, cacheable URL (browser history, analytics,
a support screenshot) is customer PII exposure with no offsetting benefit, so
it is never appended as a query parameter there.

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

## Caching the homepage and other public marketing reads

The home page (`src/app/(public)/page.tsx`) is the highest-priority indexed
URL and is crawled and visited far more than any other route, so it must not
hit the database on every single request. It still calls `await connection()`
before reading any data: that is a deliberate, load-bearing guard that forces
per-request dynamic rendering so `next build` (which runs against a
placeholder, unreachable `DATABASE_URL`, see `docs/TESTING_STRATEGY.md`) never
tries to prerender a database-backed page. Do not remove `connection()` to
"fix" caching.

Instead, the expensive reads themselves are wrapped in Next's Data Cache via
`unstable_cache()` with a 5-minute `revalidate` window, tagged with the shared
`PUBLIC_MARKETING_CACHE_TAG` (`src/lib/platform-marketing.ts`):

- `findPlatformOrganizationMetadata` and the homepage's showcase-organizations
  query (`src/lib/platform-marketing.ts`, `src/app/(public)/page.tsx`)
- `getPublicContactDetails` (`src/lib/public-contact.ts`), the sole data read
  on `/contact`

This does not make the route itself cacheable at Vercel's edge (it is still
"dynamic" from the routing layer's perspective, by design), but it removes the
redundant per-visit database round-trip, which is the actual cost driver.

Every Server Action that changes the underlying data calls
`updateTag(PUBLIC_MARKETING_CACHE_TAG)` (from `next/cache`) immediately after
writing, so an operator's settings edit or showcase change is visible right
away instead of waiting out the 5-minute window: see
`revalidateSettingsAndMarketing()` in
`src/app/app/platform/settings/actions.ts` and
`updateOrganizationPublicShowcase` in
`src/app/app/platform/organizations/actions.ts`. Adding a new write path to
this cached data must include the same call, or edits will appear stale for
up to 5 minutes. `updateTag()` requires calling from within a Server Action
(unlike the older single-argument `revalidateTag(tag)`, which Next.js 16
deprecated); it is not usable from a Route Handler.

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
SEO work and live sitemap validation were complete. The 2026-08-15 indexing
upgrade expands the sitemap to 21 canonical URLs, including the cookie policy,
and adds optional `GOOGLE_SITE_VERIFICATION` metadata support for Google's
URL-prefix verification method. A Domain property remains the preferred setup
and must be verified with Google's account-specific DNS TXT value.

No authenticated Google Search Console action is performed by the application.
Search Console ownership verification, sitemap submission, and URL inspection
must only be marked complete after Google visibly confirms them in the owner's
account. The Google Indexing API must not be used for these ordinary website
pages because it is reserved for Google's supported specialist content types.
