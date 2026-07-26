# Billing and Subscriptions

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
- `PLATFORM_MANAGED` identifies subscriptions intended for automated platform
  checkout and renewal. The subscription lifecycle and auto-renew preference
  are implemented, but no external payment processor is connected yet.
  Until one is selected and configured, an operator must still confirm the
  payment reference before access activates.

The schema reserves `PAYSTACK` and `FLUTTERWAVE` as gateway-provider values,
and server-only adapters can initialize and verify transactions and validate
Paystack signatures or Flutterwave webhook hashes. They are not yet connected
to a checkout page, callback route, or webhook route, so platform-managed
subscriptions still require operator payment confirmation. Provider
credentials are documented in `.env.example` and remain optional.

The application must never claim that an online payment succeeded without a
verified provider callback. A future gateway integration should call the same
subscription activation service from a signed webhook after verifying the
provider event.

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
