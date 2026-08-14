# Consolidated Products

## Purpose

Rock Frost sells Human Resources & Payroll as one product and Inventory & Procurement as one product. The consolidation removes confusing duplicate purchases without deleting mature internal boundaries or customer data.

## Compatibility contract

- `hr` is the primary product key and `payroll` is its internal companion.
- `inventory` is the primary product key and `procurement` is its internal companion.
- An active subscription or enabled assignment for either key unlocks both keys.
- Existing `/app/payroll/*` and `/app/procurement/*` routes remain valid.
- Old public `/modules/payroll` and `/modules/procurement` links permanently redirect to the primary product page.
- Existing database rows, permission keys, roles, audit events, and JSON backup scope identifiers are not renamed.
- Public pricing, sales requests, tenant requests, module launchers, and owner subscription controls show only the primary products.

## Human Resources & Payroll

The two route trees use one shared People and Payroll navigation. Visibility remains permission-based. HR users see employee, leave, review, report, and HR settings areas. Payroll users see compensation, runs, payslips, reports, and payroll settings. Users holding both permission families see the complete workflow.

Payroll administrators can create the minimal employee record directly from Compensation before assigning salary. This means a legacy Payroll-only customer is not blocked by a missing HR administrator role. The employee record remains owned by HR and can later be enriched through the HR interface.

## Inventory & Procurement

Inventory continues to own items, warehouses, quantities, and movements. Procurement continues to own suppliers, purchase requests, approvals, orders, and receiving. Receiving must continue through the Inventory service so stock and movement history remain atomic.

The combined customer navigation, overview, receiving guidance, and settings are maintained without renaming internal routes or data models.

## Billing and seats

The primary HR product and primary Inventory product carry the published prices. Companion keys have no independent public price. Seat usage counts a member once per combined product when their role contains at least one permission from either internal namespace. If legacy and primary subscriptions coexist, seat reporting groups them under one product and uses the effective configured allowance.
