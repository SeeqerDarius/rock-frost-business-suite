# Hostel Management module

**Status:** implemented, foundation-plus-billing tranche complete (2026-08-20). This document is the product and
architecture contract for the vertical, following the isolation rules in `docs/MODULE_BOUNDARIES.md`: every owned
record carries `organizationId`, every lookup and mutation is tenant-scoped, and the module's one deliberate
cross-module integration (occupants are `SchoolStudent` records) reaches School only through its existing public
service functions, never School's tables directly.

## Relationship to School Management

Hostel is a **separately subscribable companion module to School Management**, not a sub-feature of it — a school
without residential facilities never needs to activate it, and a school that adds a hostel later can subscribe to
Hostel without re-provisioning anything in School. Concretely this means Hostel:

- Owns no student, guardian, or campus identity of its own — every allocation references an existing
  `SchoolStudent`, validated as belonging to the same organization before the allocation is created.
- Owns no academic-calendar model — allocations and fee structures are scoped to School's own
  `SchoolAcademicYear`/`SchoolTerm` records, not a parallel Hostel term concept.
- Can be enabled for an organization that runs School without Hostel ever being activated, and vice versa is not
  meaningful (Hostel without School has no students to allocate) — the product is only offered as an add-on today,
  not standalone.

## Scope delivered (2026-08-20)

1. **Buildings, rooms, and beds** — `HostelBuilding` (optionally linked to a `SchoolCampus`), `HostelRoom`, and
   `HostelBed`. Creating a room creates its beds in the same transaction, labeled `A`, `B`, `C`... up to the room's
   capacity (1-20) — beds are not a separately managed resource; they are fixed by the room they belong to.
2. **Allocations** — `HostelAllocation` assigns one student to one bed for an academic year. `createHostelAllocation`
   claims the bed with a guarded `AVAILABLE -> OCCUPIED` `updateMany` (the same `count`-checked atomic-transition
   pattern `markInvoiceSent`/Hotel's room check-in/Hospital's bed admission all use), so two concurrent allocation
   attempts for the same bed can never both succeed. A student already holding an `ACTIVE` allocation anywhere is
   blocked from a second one — one bed per student at a time. `endHostelAllocation` claims the reverse
   `ACTIVE -> ENDED` transition the same way before freeing the bed, so a checkout can't be double-processed and a
   bed can't be freed twice.
3. **Wardens** — `HostelWarden` assigns an active organization member to a building, with an optional title
   ("Warden", "Assistant Warden"). No approval workflow or scheduling; a straightforward assignment/removal list.
4. **Fee billing** — `HostelFeeStructure`/`HostelFeeInvoice`/`HostelFeePayment`, a field-for-field mirror of School's
   own fee models and service functions. `issueHostelFeeStructure` bulk-issues one invoice per `ACTIVE` allocation
   currently matching the structure's academic year (and building, when the structure is scoped to one), skipping
   students who already have an invoice from that structure, inside an advisory-locked transaction so invoice
   numbers stay sequential. `recordHostelFeePayment` is the same row-serialized, `Prisma.Decimal`-balance-checked
   payment guard `recordSchoolFeePayment` uses, so a payment can never push an invoice past its outstanding balance
   even under concurrent submission.
5. **Reporting** — `getHostelSummary()` (buildings, rooms, bed occupancy, active allocations, wardens, outstanding
   invoice count/total) backs both the Reports page and the dashboard widget, and is wired into the shared
   PDF/Excel report-export path (`/api/reports/hostel?format=pdf|xlsx`) built earlier the same day.

## Permissions and roles

Seven permission keys under the `hostel.` prefix: `view`, `buildings.manage`, `allocations.manage`,
`wardens.manage`, `fees.manage`, `reports.view`, `settings.manage`. Two new seeded system roles: "Hostel Manager"
(full access) and "Warden" (`view` + `allocations.manage` + `reports.view` — day-to-day occupancy work without
building/fee/warden administration rights).

## Pricing

Added to the module catalogue (`src/lib/pricing.ts`) at GHS 449/month (GHS 4,490/year, 8 included seats, GHS
25/additional seat) — priced below School (599) as a satellite add-on, above CRM/Projects since it carries real
allocation/capacity/billing logic, not just record-keeping. A "School & Hostel Complete" bundle (School + Hostel +
Accounting + HR, GHS 1,699/month against a 1,946 à-la-carte total) sits alongside the existing "School Complete"
bundle rather than replacing it, since Hostel is only relevant to schools that actually run a boarding facility.

## Known gaps — explicitly deferred, not silent

The user's request was for "a 100% full hostel management system"; this tranche is the foundation plus fee billing,
not the complete feature set. Scoped out of this pass by explicit choice, tracked as the next increment:

- **Curfew and attendance** — no night roll-call or curfew check-in/out workflow yet.
- **Visitor logs** — no visitor sign-in/out register.
- **Incident and disciplinary records** — no incident log or disciplinary-action tracking tied to a resident.
- **Maintenance requests** — no room/building maintenance-issue workflow (Hotel and Fleet both have one; Hostel does
  not yet reuse or parallel either).
- **Settings** is an honest placeholder page today — there is no hostel-wide configuration (invoice numbering
  prefix, default check-in/out policy, or similar) to manage yet, so the page says so rather than fabricating
  options with nothing behind them, the same treatment Fleet's original Settings page used.
