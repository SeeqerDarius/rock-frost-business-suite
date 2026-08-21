# Billing and Subscriptions

## Module user seats

## Production pricing catalogue

The customer-facing catalogue contains fourteen products. Human Resources & Payroll is one subscription backed by the internal `hr` and `payroll` permission domains. Inventory & Procurement is one subscription backed by the internal `inventory` and `procurement` domains. Legacy subscriptions recorded against Payroll or Procurement continue to unlock the full matching product group, so no customer loses access during consolidation. New quotes and subscriptions offer only the primary HR and Inventory product records.

The catalogue is defined in `src/lib/pricing.ts` and is the single source of truth for public prices and platform-operator quote defaults. Following the 2026-08-21 operational upgrades, Accounting is GHS 699 monthly with 8 seats, Inventory & Procurement is GHS 799 with 12 seats, Point of Sale is GHS 599 with 8 seats, Pharmacy is GHS 999 with 15 seats, and Hospital is GHS 2,499 with 30 seats. Twelve-month subscriptions use the explicit annual catalogue amount (approximately two months of savings); other terms multiply the monthly price by the selected duration. Additional-user guidance is also stored per module.

Catalogue changes apply to new quotes and renewal offers. Existing subscriptions retain their stored amount, currency, term, and seat limit until an operator explicitly records a renewed agreement. The platform never recalculates a live contract from the current catalogue.

The public `/pricing` page publishes individual modules, included seats, annual amounts, popular suites, and the enterprise starting price. The platform subscription form uses the same catalogue to prefill the agreed amount and seat limit when an operator selects a module. These values remain editable because negotiated discounts, migrations, extra branches, custom development, and enterprise agreements must still be recorded at their actually agreed amount.

Bundles are sales packages rather than a new entitlement object. Operators must create the underlying module subscriptions with the correct module-specific seat limits so access, roles, backups, cancellation, and expiry remain isolated per module. Students, guardians, patients, and customer records are business records and do not consume staff-user seats.

Each subscription can carry a positive user-seat limit or be explicitly unlimited. A seat is consumed by every `ACTIVE` or `INVITED` organization membership whose assigned role contains a permission under that product's permission namespace. Combined products count a member once when the role contains either internal namespace. A role spanning several unrelated products consumes one seat in each applicable product. Pending invitations reserve seats immediately; revoking an invitation marks its membership removed and releases the seat.

Tenant administrators see current usage in Administration and Billing. The platform owner sets the initial allowance while creating a subscription and can change it from the subscription ledger. A limit cannot be lowered below current usage. Invitation assignment takes an organization-scoped PostgreSQL advisory transaction lock, recomputes current active subscription entitlements, and fails before writing the membership if any applicable module is full. Legacy subscriptions with a null allowance remain unlimited until Rock Frost assigns a limit.

Organization administrators can change a member's role, reversibly deactivate/reactivate active members, and see both used and remaining seats per module. Role changes are limited to roles compatible with the organization's currently active modules and are rejected if the destination role would exceed any applicable seat limit. Deactivation changes the membership to `SUSPENDED`, which immediately removes it from authentication and seat counts; reactivation rechecks current seat availability before restoring access. The acting administrator cannot deactivate themselves, and the final active Organization Owner cannot be deactivated or demoted.

## Implemented lifecycle

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
