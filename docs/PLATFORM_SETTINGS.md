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

## Marketing and privacy rules

Do not publish a customer until Rock Frost has permission to use its organization name, logo, quote, and attribution. The software does not infer consent from onboarding or from an existing independent delivery relationship. When the global showcase switch is off, the entire section and external public logos are unavailable.

Create, edit, reorder, global-setting, and delete operations write platform audit events. Settings and customer changes revalidate both the owner settings page and public homepage.
