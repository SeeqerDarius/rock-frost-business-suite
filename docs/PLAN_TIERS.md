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
| School payroll inputs | | | yes |
| Enrolled students | 200 | 1,500 | Unlimited |
| Campuses | 1 | 3 | Unlimited |

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
3. The pre-existing `Organization.smsNotificationsGranted` and `schoolPortalGranted`
   columns became **overrides, never gates**: set adds a feature, unset takes nothing
   away. They stopped being the primary mechanism but never revoke an add-on an operator
   already granted.

Tiers therefore only ever restrict an agreement created after they shipped.

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
nothing a customer is already on; a unit test asserts it. A module with no
`ModuleTierPrice` rows is simply not sold by tier yet.

## Adding a ladder to another module

1. Replace that module's `tieringPending: true` entry in `catalogue.ts` with real
   features and limits. Keep it cumulative.
2. Add a counter for each new limit key in `countForLimit()`
   (`src/platform/subscriptions/service.ts`) so downgrades can be checked, and call
   `assertWithinModuleLimit()` in the creating service.
3. Guard each newly gated page server-side, and declare its routes on the feature.
4. Add `MODULE_TIER_PRICING_SEED` rows with Pro equal to the headline.
5. **Check who is currently using what before you ship it.** Every organization already
   resolves at Platinum, so the ladder only bites for new agreements, but an operator
   downgrading someone afterwards is a real decision with real consequences.
