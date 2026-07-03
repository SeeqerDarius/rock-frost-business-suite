# Module Guidelines

Every Rock Frost module must be reusable, tenant-safe, and consistent with the platform architecture.

## Universal Module Requirements

Every module must include:

- Overview
- Navigation
- Permissions
- Reports
- Settings
- Notifications
- Audit logging
- AI integration plan
- API design
- Testing plan
- Documentation

## Data Requirements

- Every business model must include `organizationId`.
- Add `branchId` when branch-level segmentation is useful.
- Add `createdAt` and `updatedAt` to mutable records.
- Prefer clear enums for statuses.
- Do not leak data across organizations.

## Navigation

Module navigation should:

- Fit inside the dashboard shell.
- Use clear route names.
- Avoid hardcoded company-specific language.
- Expose only routes the user's role can access.

## Permissions

Each module should define:

- View permissions
- Create permissions
- Edit permissions
- Delete or archive permissions
- Report permissions
- Settings permissions
- Admin permissions

## Reports

Reports should be tenant-scoped and export-ready. Reports should not mutate transactional records.

## Settings

Module settings should be organization-scoped and auditable. Settings should not be hardcoded into UI components.

## Notifications

Module events should be able to generate notifications through the shared notification system when implemented.

Examples:

- Maintenance request approved
- Payment verified
- Contract completed
- Inventory threshold reached

## Audit Logging

Critical business actions should generate audit records when the audit service is implemented.

Examples:

- Record created
- Status changed
- Payment verified
- Permission changed
- Settings updated

## AI Integration

AI should use approved platform boundaries. Module AI must:

- Respect tenant scope.
- Avoid exposing sensitive data.
- Provide useful operational guidance.
- Never bypass permissions.

## API

Module APIs should:

- Use consistent resource naming.
- Validate authentication and authorization.
- Resolve tenant context server-side.
- Return structured errors.
- Avoid exposing internal implementation details.

## Testing

Each module should eventually include:

- Type checks
- Build validation
- Service tests
- Tenant isolation tests
- Permission tests
- UI regression checks where practical

## Documentation

Each module should document:

- Purpose
- Routes
- Data model
- Permissions
- Reports
- Settings
- Known limitations
- Future work

## Example Modules

### Fleet

Fleet manages vehicles, owners, drivers, insurance/roadworthy status, maintenance, work-and-pay contracts, payments, reports, and investor views.

### CRM

CRM should manage leads, customers, interactions, pipeline, tasks, and customer reports.

### Inventory

Inventory should manage products, stock levels, warehouses, adjustments, suppliers, and stock reports.

### Accounting

Accounting should manage income, expenses, accounts, invoices, reconciliation, and financial reports.

### Payroll

Payroll should manage employee pay, deductions, allowances, payroll periods, approvals, and payslips.

### HR

HR should manage staff records, attendance, leave, performance, onboarding, and HR reports.

### School

School should manage students, classes, fees, attendance, exams, guardians, and academic reports.

### Hospital

Hospital should manage patients, appointments, departments, staff, billing, records, and clinical workflows.

### Agriculture

Agriculture should manage farms, crops, livestock, inputs, harvests, equipment, and production reports.

### Construction

Construction should manage projects, sites, materials, subcontractors, budgets, equipment, and progress reports.

### Hotel

Hotel should manage rooms, bookings, guests, housekeeping, payments, occupancy, and hospitality reports.
