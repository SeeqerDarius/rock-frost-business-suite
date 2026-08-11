/**
 * FICTIONAL demonstration showcase entries — isolated in this one file so
 * they can be found, edited, or deleted in a single place once enough real,
 * approved customer stories exist (see `docs/PLATFORM_SETTINGS.md`,
 * "Demonstration showcase entries").
 *
 * These are not real Rock Frost customers, not real endorsements, and must
 * never be presented as either. Every name is deliberately invented, every
 * remark is phrased as a description of the product demonstration itself
 * ("the demonstration workspace shows...", "a sample of how...") rather
 * than a claim that a real organization achieved a real result, and the
 * public homepage always renders a visible "Sample" badge plus a nearby
 * disclosure sentence on every card sourced from this file — see
 * `src/components/marketing/customer-showcase.tsx`'s `isDemo` handling and
 * `src/app/(public)/page.tsx`'s `buildShowcaseCustomers()`.
 *
 * Logos are original, locally committed SVGs under `public/demo-logos/` —
 * simple geometric marks, not copied from or resembling any real company.
 */

/**
 * The "obvious configuration switch" called for by the design brief: flip
 * to `false` (or delete this file and its one import in
 * `src/app/(public)/page.tsx`) to remove every demonstration entry from the
 * public homepage immediately, with no other code change required.
 */
export const DEMO_SHOWCASE_ENABLED = true;

/**
 * Demonstration entries only ever supplement real approved entries, and
 * only when there are too few of them for the section to look intentional
 * — see `buildShowcaseCustomers()` in `src/app/(public)/page.tsx`. Real
 * entries always come first and are never displaced.
 */
export const MIN_SHOWCASE_ENTRIES_BEFORE_DEMO_FILL = 4;

export interface DemoShowcaseCustomer {
  id: string;
  name: string;
  industry: string;
  quote: string;
  attribution: string;
  logoUrl: string;
}

export const DEMO_SHOWCASE_CUSTOMERS: DemoShowcaseCustomer[] = [
  {
    id: "demo-northstar-learning",
    name: "Northstar Learning Academy",
    industry: "Education",
    quote: "The demonstration workspace shows how daily school operations can be brought into one clear view.",
    attribution: "Product demonstration",
    logoUrl: "/demo-logos/northstar-learning.svg",
  },
  {
    id: "demo-harborview-suites",
    name: "Harborview Suites",
    industry: "Hospitality",
    quote: "A sample of how teams can coordinate reservations, service, and reporting from one workspace.",
    attribution: "Product demonstration",
    logoUrl: "/demo-logos/harborview-suites.svg",
  },
  {
    id: "demo-greenline-mobility",
    name: "Greenline Mobility",
    industry: "Fleet & Transport",
    quote: "This demonstration illustrates how vehicles, drivers, and maintenance schedules can stay organized together.",
    attribution: "Product demonstration",
    logoUrl: "/demo-logos/greenline-mobility.svg",
  },
  {
    id: "demo-cedar-stone-retail",
    name: "Cedar & Stone Retail",
    industry: "Retail",
    quote: "An illustration of how a retail team could track stock, sales, and store performance side by side.",
    attribution: "Product demonstration",
    logoUrl: "/demo-logos/cedar-stone-retail.svg",
  },
];
