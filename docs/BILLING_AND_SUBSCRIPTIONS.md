# Billing and Subscriptions

This document covers platform billing. Tenant operational collections use `docs/SHARED_PAYMENTS_AND_SETTLEMENTS.md`. Operational revenue never activates subscriptions or becomes Rock Frost subscription revenue.

## Module user seats

## Production pricing catalogue

The customer-facing catalogue contains fourteen products. Human Resources & Payroll is one subscription backed by the internal `hr` and `payroll` permission domains. Inventory & Procurement is one subscription backed by the internal `inventory` and `procurement` domains. Legacy subscriptions recorded against Payroll or Procurement continue to unlock the full matching product group, so no customer loses access during consolidation. New quotes and subscriptions offer only the primary HR and Inventory product records.

**The catalogue is database-backed and operator-editable (2026-08-25).** `ModulePricingPlan` (one row per `moduleKey`) and `PricingBundle` (one row per suite `key`, with `moduleKeys` as an un-expanded product-key array) hold the live prices; `src/lib/pricing.ts` is now a thin read layer (`listModulePrices`, `listPricingBundles`, `getModulePriceMap`, `getPricingBundleMap`, `recommendedSubscriptionQuote`) over those tables, and `src/lib/pricing-shared.ts` holds the client-safe types and pure helpers (`formatGhs`, `computeRecommendedQuote`) that `organization/billing/module-cart.tsx` (a "use client" component) imports directly, since `pricing.ts` itself carries `import "server-only"`. `prisma/seed-data.ts`'s `MODULE_PRICING_SEED`/`PRICING_BUNDLE_SEED` seed each table once via a create-only upsert (`update: {}`) — a platform operator's price edit is never overwritten by a later deploy re-running the seed, unlike the `Module` catalogue rows, which do sync from code on every deploy. A platform operator edits prices from the "Pricing catalogue" section of `/app/platform/subscriptions` (`pricing-actions.ts`'s `updateModulePricePlan`/`updatePricingBundlePrice`); every consumer (the public `/pricing` page, `/subscribe`, org billing self-service checkout, and the platform subscription quote form) reads through the same tables, so an edit takes effect for every surface at once. The catalogue read is deliberately **not** wrapped in `unstable_cache`: `platform/subscriptions/service.ts`'s self-service checkout functions call it directly, and those functions are also called directly (outside any live Next.js request) by the real-Postgres integration suite and any future one-off script — `unstable_cache` throws ("incrementalCache missing") in that context. The catalogue is small enough (14 module rows, a handful of bundles) that an uncached read on every call is cheap; the public `/pricing` page uses the same `connection()`-before-render guard as the homepage so a database-backed page is never statically pre-rendered at build time. As of the 2026-08-23 Accounting integration and Insights upgrade, the seeded starting prices are: Accounting GHS 849 monthly or GHS 8,490 annually with 8 seats, Inventory & Procurement GHS 799 with 12 seats, Point of Sale GHS 599 with 8 seats, Pharmacy GHS 999 with 15 seats, and Hospital GHS 2,499 with 30 seats. Seeded suite prices are Business Starter GHS 1,699, Retail Suite GHS 2,299, Business Complete GHS 3,499, School Complete GHS 3,199, School & Hostel Complete GHS 3,499, Pharmacy Complete GHS 2,899, and Hospital Complete GHS 5,199 monthly. Twelve-month subscriptions use ten monthly payments, providing approximately two months of savings. Additional-user guidance is stored per module. `test/pricing-catalogue.test.ts` and `test/product-consolidation.test.ts` assert the seed data's own invariants directly (uniqueness, positive prices, registry coverage) and exercise `computeRecommendedQuote` (imported from `pricing-shared.ts`, which has no `next/cache`/`@/lib/db` dependency) without touching the database, consistent with `test/public-marketing-caching.test.ts`'s established precedent of testing `unstable_cache`-adjacent code via source assertion rather than direct invocation.

Catalogue changes apply to new quotes and renewal offers. Existing subscriptions retain their stored amount, currency, term, and seat limit until an operator explicitly records a renewed agreement. The platform never recalculates a live contract from the current catalogue.

The public `/pricing` page publishes individual modules, included seats, annual amounts, connected ERP suites, and the enterprise starting price. Each module includes a concise audience and workflow description derived from implemented product behavior. The marketing layer may change positioning and plan presentation, but it never invents or overwrites catalogue amounts. The platform subscription form uses the same catalogue to prefill the agreed amount and seat limit when an operator selects a module. These values remain editable because negotiated discounts, migrations, extra branches, custom development, and enterprise agreements must still be recorded at their actually agreed amount.

Combined suites are first-class self-service entitlements. One `Subscription` stores the stable suite key and the exact module keys granted by that purchase. One verified payment enables every entitled module atomically; renewal failure, cancellation, and access checks cover the same entitlement set. Existing module-specific subscriptions remain unchanged. Students, guardians, patients, and customer records are business records and do not consume staff-user seats.

Each subscription can carry a positive user-seat limit or be explicitly unlimited. A seat is consumed by every `ACTIVE` or `INVITED` organization membership whose assigned role contains a permission under that product's permission namespace. Combined products count a member once when the role contains either internal namespace. A role spanning several unrelated products consumes one seat in each applicable product. Pending invitations reserve seats immediately; revoking an invitation marks its membership removed and releases the seat.

Tenant administrators see current usage in Administration and Billing. The platform owner sets the initial allowance while creating a subscription and can change it from the subscription ledger. A limit cannot be lowered below current usage. Invitation assignment takes an organization-scoped PostgreSQL advisory transaction lock, recomputes current active subscription entitlements, and fails before writing the membership if any applicable module is full. Legacy subscriptions with a null allowance remain unlimited until Rock Frost assigns a limit.

Organization administrators can change a member's role, reversibly deactivate/reactivate active members, and see both used and remaining seats per module. Role changes are limited to roles compatible with the organization's currently active modules and are rejected if the destination role would exceed any applicable seat limit. Deactivation changes the membership to `SUSPENDED`, which immediately removes it from authentication and seat counts; reactivation rechecks current seat availability before restoring access. The acting administrator cannot deactivate themselves, and the final active Organization Owner cannot be deactivated or demoted.

## Implemented lifecycle

### Direct public subscription

Visitors can bypass the demo and operator-approval workflow from `/pricing` or `/subscribe`. They choose an individual product or combined suite, monthly or annual billing, and provide organization-owner details. The server verifies bot protection, validates the product against the authoritative catalogue, creates an isolated organization with a pending subscription, and emails the existing single-use invitation. The invitation returns the verified owner to Billing after password setup and sign-in. Payment is deliberately not taken before email ownership is verified.

Paystack confirmation activates the selected product or every entitlement in the selected suite without platform-owner approval. The browser redirect never grants access by itself. The existing signed webhook and server-to-server payment verification remain authoritative.

Trial workspaces may have at most three customer-facing products enabled at once. Consolidated internal pairs, including HR plus Payroll and Inventory plus Procurement, count as one product. The limit is enforced inside the module-enable transaction and the request-approval enable path, not only in the interface. Paid suites are not restricted by the trial cap because payment moves the organization to `ACTIVE`.

The public acquisition and platform-operator workflows share one record chain:

1. A visitor chooses **Request demo** or **Request module** on `/modules`.
2. `/contact` is preselected for that exact module and collects the
   organization, contact person, email, phone/WhatsApp, preferred contact
   channel, expected users, industry, country, and business need.
3. The submission is persisted as a `ContactSubmission`. Every active
   platform Super Admin receives an in-app notification, and the enquiry
   appears in `/app/platform/requests`.
4. An operator contacts the prospect by their selected email, phone, or
   WhatsApp channel. The request queue provides direct `mailto:`, `tel:`, and
   WhatsApp links when the corresponding contact details exist.
5. **Create organization from inquiry** opens the organization form with the
   submitted company and contact fields prefilled. Tenant codes are generated
   on the server from the organization name, with a numeric suffix added when
   needed; operators do not type or choose tenant codes.
6. Creating the organization creates its owner invitation and converts the
   enquiry into a first-class `ModuleRequest` (`DEMO`, `ENABLE_EXISTING`, or
   `CUSTOM_MODULE`).
7. The operator records the agreed module, price, currency, duration, and
   billing mode in `/app/platform/subscriptions`.
8. Confirming payment activates the subscription, calculates its end date,
   enables the module, completes the linked module request, records an audit
   event, and notifies organization members.

## Billing modes

- `MANUAL_OFFLINE` covers negotiated arrangements paid outside the platform,
  such as bank transfer, cash, mobile money, or an externally issued invoice.
  The operator records the payment method and reference before activation.
- `PLATFORM_MANAGED` subscriptions are paid online, inside the platform, by
  the organization's own admin — from `/app/organization/billing` (linked
  from Organization; requires `org.settings.manage`, the same permission as
  the rest of that section). There is no public/unauthenticated payment link;
  the customer must already be a signed-in member of the org the subscription
  belongs to.

### Payment gateways: Paystack and Flutterwave

Both providers are supported, chosen because both cover Ghana (this
platform's primary market) and West Africa broadly. Both are offered to the
customer as separate buttons on the billing page — whichever gateway is
configured (has its secret key set, per `isGatewayConfigured()` in
`src/lib/payments/config.ts`) shows up; an unconfigured gateway's button is
hidden rather than offered and failing, the same graceful-degradation pattern
`RESEND_API_KEY` already uses elsewhere in this codebase.

Client code lives in `src/lib/payments/`: `paystack.ts` / `flutterwave.ts`
implement `initializeTransaction()` (starts a hosted checkout),
`verifyTransaction()` (server-to-server confirmation by reference), and each
provider's own webhook-authenticity check (`verifySignature()` — HMAC-SHA512
for Paystack; `verifyWebhookHash()` — constant-time shared-secret comparison
for Flutterwave, since Flutterwave doesn't sign its webhook payload).
Provider credentials are documented in `.env.example`
(`PAYSTACK_SECRET_KEY`/`PAYSTACK_PUBLIC_KEY`,
`FLUTTERWAVE_SECRET_KEY`/`FLUTTERWAVE_PUBLIC_KEY`/`FLUTTERWAVE_WEBHOOK_HASH`)
and remain optional — the gateway is simply unavailable until set.

### Paystack automatic renewal

`PLATFORM_MANAGED` subscriptions with `autoRenew` enabled use Paystack recurring card billing for supported contract terms. The application creates a dedicated Paystack plan for the stored agreement amount and currency, then includes that plan in the customer's first hosted checkout. Supported recurring terms are 1 month, 3 months, 6 months, and 12 months, matching Paystack's monthly, quarterly, biannual, and annual intervals. The stored agreement remains authoritative. Existing subscriptions are never repriced from the current public catalogue.

The signed Paystack webhook stores the provider plan, customer, subscription, email-token, status, and next-payment identifiers without storing card numbers or authorization secrets. Successful renewal charges are verified server-to-server, recorded once in `SubscriptionPayment`, and extend access by the subscription's stored duration. A PostgreSQL advisory transaction lock and the unique provider/reference constraint make webhook replays and concurrent callback delivery idempotent.

Paystack does not retry failed subscription charges. An `invoice.payment_failed` event is therefore recorded once, moves the subscription to `PAST_DUE`, pauses only the affected module, and exposes a payment-management path to organization administrators. Successful later payment reactivates the module and clears the failure counter. Tenant administrators can open Paystack's hosted card-management page or cancel future renewal. Cancelling renewal does not end already-paid access; it remains available until the stored end date.

Paystack recurring subscriptions currently support cards for Ghana. Direct Debit recurring subscriptions are provider-limited to Nigeria. Mobile Money can still be used for supported one-time checkout, but it is not represented as an automatically reusable Ghana subscription authorization in this implementation.

Production must define `PAYSTACK_SECRET_KEY` and `PAYSTACK_PUBLIC_KEY` in Vercel and configure Paystack's live webhook URL as `https://app.rockfrostgroup.com/api/payments/paystack/webhook`. The secret key is server-only. Never expose it in client code, logs, screenshots, source control, or support messages.

### Tenant self-service checkout

An organization administrator with organization-settings permission can purchase an unsubscribed catalogue product directly from `/app/organization/billing`. They choose monthly or annual billing and whether Paystack should renew the subscription automatically. The client submits only the product key and billing-period choice. The server re-reads the authoritative catalogue price, included seats, active module record, organization identity, and authenticated payer before creating the pending subscription and redirecting to Paystack. A PostgreSQL advisory transaction lock prevents simultaneous clicks from creating duplicate active or pending subscriptions for the same consolidated product.

**Cart checkout (2026-08-23).** The "Add modules" section is a genuine multi-select cart, not one payment form per module: an administrator checks any number of products, sees a running total for the whole selection (plain sum of each selected module's own catalogue price — not a `PRICING_BUNDLES` discount, since this is an ad-hoc self-selected combination, not a curated suite), picks one shared billing period for the whole cart, and completes exactly one Paystack payment for everything checked. `createSelfServiceCartSubscription()` (`src/platform/subscriptions/service.ts`) reuses the same `entitledModuleKeys` mechanism `createSelfServiceBundleSubscription()` already established for combined suites — one `Subscription` row stores every selected module's expanded product-group key (e.g. selecting Inventory also entitles Procurement), `bundleKey` stays null since this isn't a catalogue suite, and the shared activation transaction (`subscriptionModuleIds()`) already reads `entitledModuleKeys` generically regardless of whether it came from a suite or a cart — no activation, renewal, or notification code needed to change for the cart to work correctly. The advisory lock is scoped `self-service-cart:{organizationId}`, matching the existing per-operation-type lock convention (a single-module lock and a bundle lock already run under separate keys today; a concurrent cross-type conflict is still caught by the transaction's own existing-subscription query, the same safety margin the module/bundle paths have always had). The selection UI itself (`module-cart.tsx`) is a small client component — the actual form submission is a native multi-value `moduleKeys` checkbox field posted to a server action, so it degrades to a working (if less live-updating) checkout even without JavaScript.

No platform-owner approval is required for this path. Access is still never granted by the browser redirect alone. After Paystack verifies the charge server-to-server, the shared activation transaction enables the product, activates the organization where necessary, provisions connected Accounting revenue accounts, records the immutable payment, sends notifications, and writes the tenant audit event. The signed webhook remains the authoritative recovery path if the customer closes checkout before returning.

Paystack returns the customer to `/app/organization/billing/callback/paystack`. A verified payment renders a dedicated thank-you page with the product, amount, payment date, access period, end date, renewal status, payment reference, a direct `Open module` action, and a link back to Billing. Failed or delayed verification never displays a false success; the customer is sent back to Billing to check status or retry.

**Reference/idempotency model.** `Subscription.paymentReference` is written
twice, not once: at **initiation** (`initiateGatewayPayment()` in
`src/platform/subscriptions/service.ts`), our own generated reference
(`sub_<subscriptionId>_<random>`) is stamped onto the subscription alongside
`gatewayProvider` via a guarded `updateMany`, without changing status; at
**activation** (`activateSubscriptionFromGateway()`), the subscription is
looked up *by* that reference + provider, and the payment is only accepted
once the gateway's own `verifyTransaction()` call confirms success **and**
the verified amount/currency match the subscription's stored
`amount`/`currency` exactly — the webhook/callback payload's own claimed
amount is never trusted directly.

Two independent callers can reach `activateSubscriptionFromGateway()` for the
same payment: the **webhook**
(`src/app/api/payments/{paystack,flutterwave}/webhook/route.ts` — the
authoritative path, registered in each provider's dashboard) and the
**browser callback page**
(`/app/organization/billing/callback/{paystack,flutterwave}` — a UX
accelerant so the customer isn't stuck waiting for the webhook). The function
is idempotent: a subscription already `ACTIVE` by the time either caller
reaches it is returned as-is rather than re-processed or rejected, so
whichever lands first wins and the other is a safe no-op. Neither webhook
route requires a signed-in session — they're called server-to-server by the
gateway, not a browser; authenticity comes entirely from the signature/hash
check.

**Honestly unverified**, consistent with this project's existing practice
(see `OPERATOR_HANDOFF.md`'s Hardening Pass 4 section): the webhook routes
and the full checkout round-trip are written carefully against each
provider's documented API shape and are `tsc`-clean, but have not been
exercised against a real Paystack/Flutterwave sandbox from this environment —
there's no way to receive an inbound webhook call here. Run a real sandbox
transaction through both providers and confirm the webhook actually lands
before relying on this in production.

## Access and expiry

Legacy `OrganizationModule` activations with no subscription history continue
to work. Once an organization/module pair has a `Subscription`, access becomes
subscription-controlled: `getCurrentTenant()` exposes that module only while
there is an `ACTIVE` subscription whose start/end window includes the current
time. This fail-closed read-time check prevents an expired subscription from
retaining module access even if a scheduled expiry job has not run.

Cancelling a subscription disables the module unless another current active
subscription covers the same organization/module pair.

## Data and audit trail

`Subscription` stores the organization, module, linked enquiry/request,
billing mode, status, price, currency, duration, term, renewal preference,
payment reference/method, and creating/activating operators. Creation,
activation, and cancellation are audit logged.

Card numbers, mobile-money PINs, bank credentials, and provider secrets must
never be stored in `Subscription`, notes, audit metadata, or notifications.
# Workspace access indication

Tenant pages display the workspace state in the application header:

- `TRIAL` is shown as **Trial workspace**, with the remaining days in the
  standard 14-day window calculated from the organization creation date.
- A confirmed manual or gateway payment activates the subscription, enables
  the module, and moves the organization to `ACTIVE`; tenant pages then show
  **Subscribed workspace**.
- Suspended or cancelled states are shown as **Subscription inactive**.

The 14-day window is enforced automatically. Vercel invokes the authenticated
`/api/cron/expire-trials` route daily. The sweep excludes the internal platform
anchor and organizations with a current active subscription, then atomically
suspends each eligible tenant, disables its enabled modules, notifies active
members, and records `organization.trial_expired` in the audit log. Operators
can still convert or suspend a trial early. See
`docs/OPERATIONS_AND_MONITORING.md`.
