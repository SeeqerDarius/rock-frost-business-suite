# Per-organization module and feature configuration

Added 2026-10-11. How a Rock Frost platform administrator controls which
modules and features one organization can use, from
`/app/platform/organizations/[organizationId]?section=features` and each
module's configuration page
`/app/platform/organizations/[organizationId]/modules/[moduleId]`.

## Four separate layers

| Layer | Question it answers | Stored in | Changed by |
|---|---|---|---|
| 1. Module availability | Can any organization use this module? | `Module.status` | Platform modules page (`/app/platform/modules`) |
| 2. Organization entitlement | Is it on for this organization, and is any subscription for it paid and current? | `OrganizationModule.enabled`, `Subscription` | Module switch on the configuration page; Plan and billing; self-service checkout |
| 3. Per-feature configuration | Which add-ons and optional capabilities does this organization have? | Organization grant columns (add-ons), `OrganizationFeatureSetting` (optional capabilities) | Feature switches on the configuration page |
| 4. User permissions | Which people inside the organization can use it? | Roles and permission keys | The organization's own Administration |

`entitledModuleKeysForOrganization` (layers 1 and 2) is unchanged. The
operator views read it through `moduleEntitlementState`, which uses the same
inputs and rule, so the screens cannot disagree with real access.

## Module statuses

Derived once in `src/platform/organizations/module-configuration-view.ts` and
shown on both the organization list and the module page:

| Status | Meaning |
|---|---|
| Enabled | On, and any subscription is paid and current. |
| On, waiting for payment | On, but a non-cancelled subscription for the product is unpaid or lapsed, so nobody can open it. |
| Disabled | Off. |
| Available as an add-on | Off, and offered as a companion to a module this organization uses (Hostel with School). |
| Unavailable | `Module.status` is not ACTIVE for the platform, so it cannot be used anywhere. |

## Configurable features (the complete list)

Declared in `src/platform/modules/feature-catalogue.ts`. Only features with a
server-side enforcement point are listed; nothing is a display-only switch.

| Feature | Kind | Module(s) | Default | Needs | Enforced by |
|---|---|---|---|---|---|
| Offline access | Optional add-on, whole organization | POS, Fleet, Inventory, Accounting, School, Hostel, Hotel, Pharmacy, Hospital | Off | none | `/api/offline/devices` refuses registration |
| SMS notifications | Optional add-on, whole organization | Payroll, Hotel, School, Pharmacy, Hospital | Off | none | `sendSms()` refuses non-login texts |
| Parent and Student portal | Optional add-on | School | Off | none | Portal and Portal Access pages and invite actions |
| Guardian messaging | Optional add-on | School | Off | Parent and Student portal | School chat refuses guardian conversations |
| Assignments & Assessments | Optional add-on | School | Off | none (works best with the portal: students submit there) | Every assignment service function |
| Transport | Included, can be switched off | School | On | none | Every School transport service function, page, and action |
| Library | Included, can be switched off | School | On | none | Every School library service function, page, and action; dashboard reminders |

Other modules have no separately configurable features yet. Their
configuration page says so and lists what the module includes (from its
navigation), rather than offering switches the server would not honour.

Add-ons keep their existing `Organization.<name>Granted`, `...GrantedAt`, and
`...GrantedById` columns, so every existing enforcement point and the existing
per-add-on toggle actions are unchanged. Optional capabilities use the new
`OrganizationFeatureSetting` table (`unique(organizationId, featureKey)`): no
row means the catalogue default, so organizations created before this change
behave exactly as before and no backfill was needed. Switching an optional
capability off never deletes records; they return when it is switched back on.

## Rules on every change

All writes go through `setOrganizationFeature()`
(`src/platform/organizations/feature-config-service.ts`) or
`toggleOrganizationModule()` (`src/app/app/platform/actions.ts`):

- **Authorization**: the Server Action re-verifies the platform operator role
  and refuses the protected platform organization. The UI is not the boundary.
- **Dependencies**: Guardian messaging cannot be turned on without the portal,
  and the portal cannot be turned off while Guardian messaging is on. Hostel
  cannot be switched on without School, and School cannot be switched off
  while Hostel is on. The page disables the switch and states the reason; the
  server re-checks inside the transaction. Combinations that already existed
  before enforcement are shown as conflicts, not changed.
- **Concurrency**: each change carries the value the operator saw. If it
  changed since the page loaded, nothing is written and the operator is told to
  reload. An organization-scoped advisory lock serializes changes.
- **Audit**: `AuditLog` action `organization_feature.updated` (or
  `module.enabled` / `module.disabled`) with actor, organization, module,
  feature, old value, new value, and timestamp.
- **Billing honesty**: granting an add-on records the grant only. It creates no
  subscription, invoice, or payment, and the page says so. A price is shown
  only when `AddonPricingPlan` holds a confirmed row; module billing shows only
  facts from the recorded `Subscription`.
- **Confirmation**: every switch opens a confirmation stating the consequence;
  the visible value changes only after the server saves it, and pending, saved,
  failed, and blocked states are announced to screen readers.

The organization's legal and display identity is shown but never edited here.
Module display branding (organization settings) is separate from entitlements
and feature access.

## Tenant module settings (advanced)

The previous raw JSON editor remains on the module page under "Advanced". It
edits `OrganizationModule.configuration`, which each module's own tenant
Settings page also writes (number prefixes, reminder days, reorder points). It
is not an entitlement store and holds no platform feature switches.

## Tests

- `test/platform-module-feature-configuration.test.ts`: catalogue integrity
  against the schema and navigation, enforcement coverage of every optional
  capability, dependency rules, stale-change refusal, audit metadata, operator
  and protected-organization guards, billing copy, em dash rule.
- `test/integration/tenant-isolation/organization-feature-settings.test.ts`
  (real Postgres): defaults without rows, per-organization scoping, School
  library enforcement with records kept, dependency and stale refusal, add-on
  column writes, audit rows, and status derivation.

## Known gaps

- Only School has optional capabilities so far. Adding one elsewhere means
  adding an `optional` catalogue entry and an enforcement point in that
  module's service layer, plus tests; the page picks it up automatically.
- Granting an add-on is not tied to a subscription. Add-ons are still sold
  through an assisted sale.
- The two organization-wide add-ons are also toggleable from the organization's
  Shared capabilities list through their original actions, which audit with
  their original action names.
