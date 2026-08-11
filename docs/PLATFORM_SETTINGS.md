# Platform Settings

`/app/platform/settings` is the Rock Frost owner control center. It is restricted to the global system `Super Admin` role and is intentionally separate from personal profile settings.

## Navigation ownership

- **Platform Settings** appears in its own footer area at the bottom of the platform sidebar on desktop and mobile.
- The avatar menu exposes **Profile settings**, which opens `/app/platform/account` for identity, photo, email, password, and 2FA. It does not open platform-wide controls.
- Tenant users continue to use their tenant account and organization settings; they cannot reach this page or its server actions.

## Operational controls

The organization deletion recovery duration controls how long scheduled tenant deletions remain recoverable before permanent deletion becomes eligible. The accepted range is 1–365 days.

## Public customer showcase controls

The owner can:

- show or hide the complete customer-story section without deleting entries;
- edit the section label, headline, and description;
- show or hide industry labels;
- add customers whose independent systems are not tenants on this platform;
- upload or replace JPG, PNG, or WebP logos up to 1 MB;
- edit customer name, industry, approved quote, and attribution;
- publish or hide each independent customer;
- move independent customers up or down to control display order;
- remove an entry after an explicit confirmation.

Independent customer entries are stored under the platform anchor organization's existing `metadata.publicMarketing` object, so no schema migration is required. Logos remain server-side data URLs and are delivered through `/api/public/external-showcase-logo/[customerId]`. Logo responses use `private, no-store`, so hiding an entry takes effect without waiting for browser or CDN cache expiry. A hidden logo returns 404 to unauthenticated users and is available only to an authenticated platform operator for settings preview.

On-platform tenant showcases remain managed from each organization detail page. They still require ACTIVE status, an uploaded logo, complete approved copy, and explicit publication approval. The public homepage combines published independent customers with approved platform tenants, capped at twelve items.

## Demonstration showcase entries

`src/lib/demo-showcase-customers.ts` holds a small, fixed set of **fictional** organizations (Northstar Learning Academy, Harborview Suites, Greenline Mobility, Cedar & Stone Retail) used only to keep the homepage showcase looking intentional before enough real, approved customers exist. They are not managed from this settings page and are not stored in the database — they are static, committed content, isolated in that one file specifically so they can be edited or deleted in one place.

Composition rules, implemented in `src/lib/showcase-composition.ts`'s `buildShowcaseCustomers()`:

- Real approved entries (on-platform tenants and independent customers, both already governed by the rules above) always come first and are never displaced or hidden by a demonstration entry.
- Demonstration entries only appear when the real, approved count is below `MIN_SHOWCASE_ENTRIES_BEFORE_DEMO_FILL` (currently 4), and only enough of them are added to reach that minimum — never more than needed, and never past the existing twelve-item cap.
- Every demonstration card carries a visible "Sample" badge (`src/components/marketing/customer-showcase.tsx`), and the section shows a disclosure sentence — "Illustrative examples shown for demonstration. Verified customer stories will replace sample content as approvals are received." — whenever at least one demonstration entry is currently displayed.
- Demonstration remarks are written as descriptions of the product demonstration itself ("the demonstration workspace shows...", "a sample of how...") — never as a claim that the fictional organization achieved a real result, and never attributed to a named person.
- Demonstration logos are original SVGs committed under `public/demo-logos/`, not fetched from any external source.

**Configuration switch:** `DEMO_SHOWCASE_ENABLED` (top of `src/lib/demo-showcase-customers.ts`) turns every demonstration entry off immediately — set it to `false`, or delete the file and its one import in `src/app/(public)/page.tsx`, once real customer approvals make it unnecessary. No database change, deploy step, or platform-settings action is required.

## Marketing and privacy rules

Do not publish a customer until Rock Frost has permission to use its organization name, logo, quote, and attribution. The software does not infer consent from onboarding or from an existing independent delivery relationship. When the global showcase switch is off, the entire section and external public logos are unavailable.

Create, edit, reorder, global-setting, and delete operations write platform audit events. Settings and customer changes revalidate both the owner settings page and public homepage.
