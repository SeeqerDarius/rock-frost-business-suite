# Plan tiers

Every module subscription sits on a ladder: **Basic → Pro → Platinum → Enterprise**.
The ladder is ordered and cumulative. Anything a lower tier includes, every higher
tier also includes, and no limit ever shrinks as the tier rises, because a customer
who pays more must never get less. `assertCatalogueIsMonotonic()` enforces the second
half of that and `test/plan-tier-catalogue.test.ts` runs it over every module.

Enterprise is quote-only. It never reaches self-service checkout and has no list price.

## Where each piece lives

| File | Holds |
| --- | --- |
| `src/platform/entitlements/tiers.ts` | The ladder itself: labels, `tierAtLeast()`, `UNTIERED_LEGACY_TIER`. Client-safe. |
| `src/platform/entitlements/catalogue.ts` | What each tier includes per module: features and limits. Client-safe. |
| `src/platform/entitlements/resolve.ts` | `resolveOrganizationEntitlements()`, the one gate. Server-only. |
| `prisma/schema.prisma` | `PlanTier`, `Subscription.tier`, `ModuleTierPrice`. |
| `prisma/seed-data.ts` | `MODULE_TIER_PRICING_SEED`. |

`tierAtLeast()` is the only sanctioned way to compare tiers. Comparing the strings, or
their array indices by hand, is what lets the cumulative invariant rot.

## Features and limits

Two kinds of entry, because "what does Basic get you" has two different answers:

- A **feature** is present or absent. It names the minimum tier that includes it and,
  optionally, the routes it gates. Navigation filtering and the page guards both read
  those route declarations, so adding a feature to a tier cannot leave the sidebar behind.
- A **limit** exists at every tier with a different ceiling. `null` means unlimited.

A feature key is namespaced by module (`school.fees`). An **undeclared key is always
false**, which is what lets a module with no ladder stay closed rather than becoming
accidentally open.

## School's ladder

School is the only module with a real ladder today.

| | Basic | Pro | Platinum |
| --- | --- | --- | --- |
| Students, classes, attendance, staff, settings | yes | yes | yes |
| Fees and payments | | yes | yes |
| Exams, grading, broadsheets | | yes | yes |
| Timetables, transport, library | | yes | yes |
| SMS notifications | | yes | yes |
| Reports and exports | | yes | yes |
| Parent and Student portal | | | yes |
| Guardian messaging | | | yes |
| School payroll inputs | | | yes |
| Enrolled students | 200 | 1,500 | Unlimited |
| Campuses | 1 | 3 | Unlimited |

`/app/school/chats` is deliberately **not** route-gated either. Staff chat with staff
needs no add-on, so gating the route would take it from Basic and Pro, which nobody
bought; only the guardian branch of that route checks `school.guardianMessaging`, and
only together with the portal guardians read it from.

`/app/school/campuses` is deliberately **not** route-gated. The campus count is the
limit, so the page has to stay reachable for a Basic school to manage the one campus
it is allowed.

### Every other module

The other fifteen modules are declared `tieringPending: true` with no gated features
and no limits, so every tier grants the same access and their behaviour is unchanged.
This is deliberate. Defining depth ladders for sixteen modules at once is how a paying
customer quietly loses a feature. Each module gets its ladder in its own change, with
its own check of who is currently using what.

## Grandfathering

Gating core depth is the part that can take access away, so none of it applies
retroactively. Three layers:

1. The migration `20260917020000_add_plan_tiers` backfilled **every pre-existing
   `Subscription` to `PLATINUM`**. Those customers bought unrestricted access before
   tiers existed; a new column must not withdraw it. New rows default to `BASIC` and an
   operator picks explicitly, because over-granting silently is worse than having to choose.
2. A module enabled through the legacy `OrganizationModule.enabled` path with **no
   subscription row** resolves at `UNTIERED_LEGACY_TIER` (also Platinum), for the same reason.
3. The pre-existing add-on columns (`smsNotificationsGranted`, `schoolPortalGranted`,
   `schoolGuardianMessagingGranted`) keep working, with a deliberate asymmetry:

   - **With a subscription for that module**, the tier decides and a set column can
     only *add*. An organization granted the portal on a Pro plan keeps it.
   - **With no subscription**, the column is **authoritative in both directions**. In
     that world the columns *are* the entitlement system: they are the only record of
     what an operator decided about each add-on. The first version of this let the
     grandfathered Platinum tier grant an add-on anyway, which silently reversed
     deliberate revocations and handed SMS to organizations that never bought it. That
     is the opposite of what grandfathering is for.

   Depth features no column speaks for (fees, exams, timetables and the rest) always
   come from the grandfathered tier, so an unsubscribed organization keeps everything
   it had before tiers.

Tiers therefore only ever restrict an agreement created after they shipped, and they
never reverse an add-on decision an operator already made.

## SMS, specifically

SMS was the original reason for this work: one organization-wide boolean gated it for
all five notifying modules at once.

`sendSms()` now requires a `moduleKey` for every non-OTP send and gates on
`canSendModuleSms()`, which checks in this order:

1. `Organization.smsNotificationsGranted` as an operator override. Set means every
   module may send, exactly as before tiers.
2. Otherwise the module's own `<module>.sms` feature.

School declares `school.sms` at Pro. **Hotel, Pharmacy, Payroll and Hospital
deliberately declare none** while their ladders are pending, so for them an unset
override still means no SMS, which is their behaviour today. Declaring one early would
make it tier-included and therefore ungated, loosening billing instead of tightening it.

A missing `moduleKey` fails closed and never consults the resolver: falling back to an
organization-wide check would reintroduce the cross-module leak the key exists to
prevent. OTP sends carry no module key and are never gated, so 2FA keeps working for an
organization that has bought no SMS at all.

## Changing a tier

Operators change a tier from the Plan and billing section of the Organization
Configuration pane (`?section=plan`), which lists what each rung adds over the one
below it, generated from the catalogue.

`updateSubscriptionTier()` **refuses a downgrade the organization's usage already
exceeds** and names every breach. Applying it silently would leave a school unable to
admit a student the next morning with nobody warned. The check counts usage exactly the
way the creating services count it, so the refusal and the error a user would hit cannot
disagree. Upgrades are never blocked, and because `resolveOrganizationEntitlements()` is
uncached, features unlock on the next request.

## Pricing

`ModulePricingPlan` keeps each module's single headline price, which every pre-tier
quote, checkout and public price already reads. `ModuleTierPrice` adds the other rungs
beside it. **A module's Pro row must equal its headline**, so adding tiers reprices
nothing a customer is already on; a unit test asserts it.

A module is sold by plan only when its ladder is both **published** (a real
`catalogue.ts` entry, not `tieringPending`) and **priced** (`ModuleTierPrice` rows
exist). `moduleHasPublishedLadder()` and `listModuleLadders()` require both, and the
two really can disagree: a price row for a module with no ladder would advertise a
Basic plan that behaves exactly like Platinum, and a ladder with no rows would let
checkout invent a price. When either is missing the module shows its single headline
price and sells exactly as it did before tiers.

## Which tier a purchase stores

`Subscription.tier` is set explicitly by **every** path that creates a subscription.
This matters more than it looks: the column default is `BASIC`, the restrictive end of
the ladder, while the amount charged comes from the price catalogue. A path that left
the tier implicit would charge a school the full GHS 599 headline and then withhold
fees, exams, timetables, transport, library, SMS and reports, with a 200-student and
single-campus ceiling on top, and nothing would fail loudly. All four creation paths
did exactly that when tiers first landed.

`test/subscription-tier-assignment.test.ts` pins the invariant, including a case that
walks `service.ts` for a `subscription.create` with no `tier:`, so a fifth path added
later cannot quietly skip it.

| Path | Tier stored | Why |
| --- | --- | --- |
| Self-service module checkout | The rung the customer picked | Priced from `ModuleTierPrice`. A module with a ladder and no chosen plan is **refused**, never defaulted: every fallback is either charging for access the customer will not get or granting access they have not paid for. |
| Self-service suite checkout | `PLATINUM` | A suite price was set when each module in it meant the whole module, and a suite has no per-module plan choice. |
| Self-service cart checkout | `PLATINUM` | Same reasoning. The cart is priced on the plain sum of each module's headline. |
| Operator-entered agreement | The tier on the form, default `PLATINUM` | A negotiated amount was quoted in a conversation about the whole module. Falling through to `BASIC` would restrict a customer who paid for more. |

Modules with a ladder are **not sold through the cart**. The cart carries one price per
module and has nowhere to make a plan decision, so including one would hand over full
access at whatever the single headline price happens to be and undercut the ladder it
exists to sell. They get their own card with a plan picker on the tenant Billing page,
and `startCartCheckout()` refuses them even if a crafted post puts one back.

Both checkouts settle the plan **before anything is written**. The service layer refuses
an unsellable tier on its own, but by then the rows exist: public signup creates the
organization, user and membership before the subscription, so a late refusal would
strand a workspace nobody can pay for, and the tenant path would leave a
`PENDING_PAYMENT` subscription with no way to pay it.

## The public price list

`/pricing` renders a plan ladder per module from `PlanLadder`
(`src/components/marketing/plan-ladder.tsx`), generated from the catalogue rather than
hand-written. Nothing on that page is a maintained list of what each plan includes:
each column shows the features whose `minTier` is that rung, framed as "Everything in
Pro, plus", with the limits read through `limitsAt()`. A price list that drifts from
the gate is a refund request, so the page and the gate read the same declaration.

Quote-only tiers are derived from `QUOTE_ONLY_TIERS`, so Enterprise shows no amount and
routes to sales, and a tier that stops being quote-only gains a price column and a
checkout button with nothing to remember. Modules whose ladders are still pending keep
their single-price card.

One rough edge: an Enterprise enquiry arrives as the existing `MODULE` enquiry intent.
A dedicated `ENTERPRISE` value would need an `EnquiryIntent` enum migration, so sales
cannot currently filter Enterprise enquiries apart from module enquiries.

## Adding a ladder to another module

1. Replace that module's `tieringPending: true` entry in `catalogue.ts` with real
   features and limits. Keep it cumulative.
2. Add a counter for each new limit key in `countForLimit()`
   (`src/platform/subscriptions/service.ts`) so downgrades can be checked, and call
   `assertWithinModuleLimit()` in the creating service.
3. Guard each newly gated page server-side, and declare its routes on the feature.
4. Add `MODULE_TIER_PRICING_SEED` rows with Pro equal to the headline, one per
   purchasable rung. Until they exist the module keeps its single price, so the
   catalogue entry and the rows should land together.
5. Nothing else is needed to sell it. The public ladder, the tenant plan picker, the
   subscribe form's plan select and the cart exclusion all derive from
   `moduleHasPublishedLadder()` and appear on their own.
6. **Check who is currently using what before you ship it.** Every organization already
   resolves at Platinum, so the ladder only bites for new agreements, but an operator
   downgrading someone afterwards is a real decision with real consequences.
