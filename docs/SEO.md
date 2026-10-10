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
- `/modules/{module-key}` for all fourteen catalogue-visible modules, including
  dedicated Hotel, School, Hostel, Pharmacy, and Hospital metadata, features,
  canonical URLs, and acquisition links. Payroll and Procurement are real
  modules (`catalogueVisible: false` in `src/platform/modules/registry.ts`)
  excluded from the public catalogue, sitemap, and `generateStaticParams`,
  and `next.config.ts` permanently redirects `/modules/payroll` to
  `/modules/hr` and `/modules/procurement` to `/modules/inventory`. Never add
  either retired URL to the sitemap or link to it internally; `test/seo.test.ts`
  asserts both the sitemap exclusion and the redirects
- `/industries`
- `/company`
- `/contact`
- `/resources` and `/resources/{article-slug}` for the supporting guides
  registered in `src/lib/resource-articles.ts`, each linking to the module or
  page its topic relates to
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
module pages also publish breadcrumbs. The Fleet, Inventory, Human Resources
and Payroll, Hotel, and School landing pages additionally publish visible
audience, outcome, workflow, and FAQ content for their Ghana-focused commercial
search intent. Their FAQ JSON-LD is generated from the same questions and
answers visible on the page, so structured data cannot drift from page copy.
Do not add fabricated pricing, ratings, reviews, physical addresses, or social
profiles. Add those fields only when the underlying public business information
is confirmed.

**Optional add-ons (2026-10-10).** `PUBLIC_ADDONS` in
`src/lib/pricing-shared.ts` is the single public description of separately
priced add-ons. The School module page renders an "Optional add-on" section
for Assignments & Assessments (linking to `/pricing#schoolAssignments-pricing`),
its `featureList`, workflow, and a fourth FAQ mention the add-on, and
`/pricing` lists it under "Optional add-ons". Copy claims only implemented
behavior: automatic marking of single choice, true or false, multiple select,
and numeric answers, teacher marking of written answers, and explicit
cumulative-record opt-in. It must never claim AI marking. The pricing page
shows "Starting from" with the live catalogue amount for each individual
module and "Priced on request" for an add-on until an operator publishes a
confirmed `AddonPricingPlan` row. Assignment pages live under `/app/` and are
never indexed. See `docs/SCHOOL_ASSIGNMENTS.md`.

## Search visibility baseline and priority pages

The first connected Search Console baseline, settled through 2026-09-03,
showed a technically indexable site with very low discovery volume. The
homepage led the preceding 28 days with 23 impressions and 4 clicks. Hotel and
the retired Payroll URL had impressions around average positions 66 and 64,
while several other module pages had too little data for a stable ranking
conclusion. Treat movements based on one to four impressions as early signals,
not durable ranking changes.

The first content-depth sprint therefore targets Fleet, Inventory, Human
Resources and Payroll, Hotel, and School. `src/lib/seo.ts` is the single source
for each page's Ghana-focused title, summary, outcomes, workflows, and FAQs;
`src/app/(public)/modules/[moduleKey]/page.tsx` renders those fields. Future
content must remain specific to implemented product behavior. Regulatory,
certification, customer-result, and automated-compliance claims require direct
evidence before publication.

Each of the five expanded modules also carries optional `ghana`,
`integrations`, and `security` arrays on its `ModuleSeoContent` entry (Ghana
operating notes, only-verified cross-module integrations, and
permissions/scoping notes). Verify an `integrations` claim against the actual
source before adding it, such as `src/lib/accounting-integration.ts`'s
`MODULE_REVENUE_ACCOUNTS` for a module that posts revenue into Accounting, or
a module's own service code for a direct cross-module import. The HR and
Payroll page deliberately does not claim automated PAYE tax-band calculation
or SSNIT contribution handling: `src/modules/payroll/service.ts` only applies
one flat, organization-wide tax rate to gross pay. Its FAQ says so directly
rather than implying broader statutory automation. Do not expand that claim
until PAYE/SSNIT calculation is a real, tested feature.

The Company page title previously double-appended "Rock Frost" (the root
layout's `title.template` already adds `| Rock Frost`, and the page's own
title also ended in "Rock Frost Technologies") and its description ran to 179
characters; both are now a single, non-redundant title and a description
under 160 characters. CRM's title was expanded from the bare "CRM Software"
past the template suffix to describe who it is for.

### Multi-module positioning (2026-10-06)

Search summaries (including AI answers comparing Rock Frost Accounting to
standalone accounting packages) described the suite as aimed at "logistics
and consumer finance". The cause was public copy, not crawling: the module
registry lists Fleet and Installment first, so every public list, the
`/industries` page (only transport, retail and consumer finance), the default
description, the homepage spotlight and the share image led with Fleet. The
owner asked for the suite to be presented as broad. Now:

- `PUBLIC_MODULE_ORDER` in `src/platform/modules/registry.ts` sets the order
  for public surfaces (homepage grid, `/modules`, pricing, contact, sitemap,
  module-page related links): cross-industry modules first (Accounting, HR,
  Inventory, POS, CRM), then industry suites. In-app navigation keeps the
  registry order.
- `DEFAULT_DESCRIPTION`, the homepage hero, the Company portfolio card, the
  homepage FAQ, `/solutions` and the share image list Accounting first and
  name the industry suites together. The homepage spotlights Accounting,
  School and Pharmacy.
- `/industries` covers eight sectors (Education, Healthcare, Hospitality,
  Retail & Distribution, Professional Services, Transport & Logistics,
  Installment Sales, Multi-department), each linking to its modules.
- The Accounting module page has a full content block (Ghana VAT, NHIL,
  GETFund and withholding tax codes, verified revenue integrations, period
  locking), and `/resources/accounting-software-ghana-guide` targets
  accounting buyer searches. All claims were checked against
  `src/modules/accounting/tax-service.ts`, `docs/ACCOUNTING_MODULE.md` and
  `MODULE_REVENUE_ACCOUNTS`.

The Fleet pilot CTA and Fleet-specific contact flow stay in place for
Fleet-intent visitors; only the site-wide emphasis changed. Search results and
AI summaries update only after recrawl.

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
- `listPublishedTestimonials` (`src/lib/customer-feedback.ts`), the homepage's
  published-testimonials read. This one ran uncached on every homepage
  request until the 2026-09-06 sprint; `moderateFeedbackAction`
  (`src/app/app/platform/feedback/actions.ts`) calls
  `updateTag(PUBLIC_MARKETING_CACHE_TAG)` after a moderation write so a newly
  published testimonial does not wait out the 5-minute window.

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
6. Build local authority: a complete Google Business Profile; consistent
   company name, address, and contact information across every listing;
   submissions to credible Ghanaian business and technology directories;
   customer case studies with measurable results; links from customers,
   implementation partners, and industry associations; and genuine reviews
   and testimonials. None of this can be done from the application; it is the
   owner's manual follow-up.
7. Track monthly, not from three-day fluctuations (a query with a handful of
   impressions has statistically weak position data): non-branded
   impressions, queries entering the top 50/20/10, organic demo requests,
   click-through rate, indexed page count, rankings by module, and
   conversions by landing page. This lives in Search Console and the CRM, not
   in this codebase.

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
