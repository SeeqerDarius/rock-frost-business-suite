/**
 * Pure platform-bootstrap data and logic, with zero import-time side
 * effects (no PrismaClient construction, no top-level execution) — safe to
 * import from anywhere, including test fixtures that need the same
 * permissions/roles/modules seeded into a disposable test database.
 * `prisma/seed.ts` is the thin CLI wrapper around `seedPlatform()` below;
 * `test/integration/setup/fixtures.ts` is the other caller.
 *
 * The permission key list is intentionally duplicated from
 * src/lib/auth/permissions.ts rather than imported from it — that file has
 * `import "server-only"` at the top (a Next.js bundler intrinsic, not a
 * real resolvable package outside Next's own build), which a plain `tsx`/
 * Vitest execution can't resolve without the alias workaround
 * vitest.config.ts already uses for other test files. If you add a new
 * permission key to permissions.ts, add it here too.
 */
import type { PrismaClient } from "@prisma/client";

export const PERMISSIONS = {
  DASHBOARD_VIEW: "dashboard.view",
  ORG_SETTINGS_MANAGE: "org.settings.manage",
  ORG_DATA_EXPORT: "org.data.export",
  AI_ASSISTANT_USE: "ai.assistant.use",
  AUDIT_VIEW: "audit.view",
  AUDIT_EXPORT: "audit.export",
  FLEET_VIEW: "fleet.view",
  FLEET_VEHICLES_MANAGE: "fleet.vehicles.manage",
  FLEET_OWNERS_MANAGE: "fleet.owners.manage",
  FLEET_DRIVERS_MANAGE: "fleet.drivers.manage",
  FLEET_INSURANCE_MANAGE: "fleet.insurance.manage",
  FLEET_MAINTENANCE_MANAGE: "fleet.maintenance.manage",
  FLEET_WORKANDPAY_MANAGE: "fleet.workandpay.manage",
  FLEET_PAYMENTS_MANAGE: "fleet.payments.manage",
  FLEET_REPORTS_VIEW: "fleet.reports.view",
  FLEET_INVESTOR_VIEW: "fleet.investor.view",
  HIREPURCHASE_VIEW: "hirepurchase.view",
  HIREPURCHASE_CUSTOMERS_MANAGE: "hirepurchase.customers.manage",
  HIREPURCHASE_ACCOUNTS_MANAGE: "hirepurchase.accounts.manage",
  HIREPURCHASE_PAYMENTS_MANAGE: "hirepurchase.payments.manage",
  HIREPURCHASE_PRODUCTS_MANAGE: "hirepurchase.products.manage",
  HIREPURCHASE_STAFF_MANAGE: "hirepurchase.staff.manage",
  HIREPURCHASE_CREDITS_MANAGE: "hirepurchase.credits.manage",
  HIREPURCHASE_REPORTS_VIEW: "hirepurchase.reports.view",
  HIREPURCHASE_SETTINGS_MANAGE: "hirepurchase.settings.manage",
  CRM_VIEW: "crm.view",
  CRM_CONTACTS_MANAGE: "crm.contacts.manage",
  CRM_LEADS_MANAGE: "crm.leads.manage",
  CRM_DEALS_MANAGE: "crm.deals.manage",
  CRM_REPORTS_VIEW: "crm.reports.view",
  CRM_SETTINGS_MANAGE: "crm.settings.manage",
  INVENTORY_VIEW: "inventory.view",
  INVENTORY_ITEMS_MANAGE: "inventory.items.manage",
  INVENTORY_WAREHOUSES_MANAGE: "inventory.warehouses.manage",
  INVENTORY_MOVEMENTS_MANAGE: "inventory.movements.manage",
  INVENTORY_REPORTS_VIEW: "inventory.reports.view",
  INVENTORY_SETTINGS_MANAGE: "inventory.settings.manage",
  ACCOUNTING_VIEW: "accounting.view",
  ACCOUNTING_ACCOUNTS_MANAGE: "accounting.accounts.manage",
  ACCOUNTING_INVOICES_MANAGE: "accounting.invoices.manage",
  ACCOUNTING_EXPENSES_MANAGE: "accounting.expenses.manage",
  ACCOUNTING_REPORTS_VIEW: "accounting.reports.view",
  ACCOUNTING_SETTINGS_MANAGE: "accounting.settings.manage",
  HR_VIEW: "hr.view",
  HR_EMPLOYEES_MANAGE: "hr.employees.manage",
  HR_LEAVE_MANAGE: "hr.leave.manage",
  HR_REVIEWS_MANAGE: "hr.reviews.manage",
  HR_REPORTS_VIEW: "hr.reports.view",
  HR_SETTINGS_MANAGE: "hr.settings.manage",
  PROCUREMENT_VIEW: "procurement.view",
  PROCUREMENT_VENDORS_MANAGE: "procurement.vendors.manage",
  PROCUREMENT_REQUESTS_MANAGE: "procurement.requests.manage",
  PROCUREMENT_ORDERS_MANAGE: "procurement.orders.manage",
  PROCUREMENT_REPORTS_VIEW: "procurement.reports.view",
  PROCUREMENT_SETTINGS_MANAGE: "procurement.settings.manage",
  PAYROLL_VIEW: "payroll.view",
  PAYROLL_COMPENSATION_MANAGE: "payroll.compensation.manage",
  PAYROLL_RUNS_MANAGE: "payroll.runs.manage",
  PAYROLL_PAYSLIPS_VIEW: "payroll.payslips.view",
  PAYROLL_REPORTS_VIEW: "payroll.reports.view",
  PAYROLL_SETTINGS_MANAGE: "payroll.settings.manage",
  ANALYTICS_VIEW: "analytics.view",
  ANALYTICS_FINANCIAL_VIEW: "analytics.financial.view",
  ANALYTICS_SALES_VIEW: "analytics.sales.view",
  ANALYTICS_OPERATIONS_VIEW: "analytics.operations.view",
  ANALYTICS_PEOPLE_VIEW: "analytics.people.view",
  ANALYTICS_SETTINGS_MANAGE: "analytics.settings.manage",
  POS_VIEW: "pos.view",
  POS_REGISTERS_MANAGE: "pos.registers.manage",
  POS_SESSIONS_MANAGE: "pos.sessions.manage",
  POS_SALES_MANAGE: "pos.sales.manage",
  POS_REPORTS_VIEW: "pos.reports.view",
  POS_SETTINGS_MANAGE: "pos.settings.manage",
  PROJECTS_VIEW: "projects.view",
  PROJECTS_PROJECTS_MANAGE: "projects.projects.manage",
  PROJECTS_TASKS_MANAGE: "projects.tasks.manage",
  PROJECTS_MILESTONES_MANAGE: "projects.milestones.manage",
  PROJECTS_REPORTS_VIEW: "projects.reports.view",
  PROJECTS_SETTINGS_MANAGE: "projects.settings.manage",
  HOTEL_VIEW: "hotel.view",
  HOTEL_PROPERTIES_MANAGE: "hotel.properties.manage",
  HOTEL_ROOMS_MANAGE: "hotel.rooms.manage",
  HOTEL_GUESTS_MANAGE: "hotel.guests.manage",
  HOTEL_RESERVATIONS_MANAGE: "hotel.reservations.manage",
  HOTEL_FOLIOS_MANAGE: "hotel.folios.manage",
  HOTEL_HOUSEKEEPING_MANAGE: "hotel.housekeeping.manage",
  HOTEL_RESTAURANT_MANAGE: "hotel.restaurant.manage",
  HOTEL_CHANNELS_MANAGE: "hotel.channels.manage",
  HOTEL_REPORTS_VIEW: "hotel.reports.view",
  HOTEL_SETTINGS_MANAGE: "hotel.settings.manage",
  SCHOOL_VIEW: "school.view",
  SCHOOL_CAMPUSES_MANAGE: "school.campuses.manage",
  SCHOOL_STUDENTS_MANAGE: "school.students.manage",
  SCHOOL_ACADEMICS_MANAGE: "school.academics.manage",
  SCHOOL_ENROLLMENT_MANAGE: "school.enrollment.manage",
  SCHOOL_ATTENDANCE_MANAGE: "school.attendance.manage",
  SCHOOL_FEES_MANAGE: "school.fees.manage",
  SCHOOL_EXAMS_MANAGE: "school.exams.manage",
  SCHOOL_EXAMS_PUBLISH: "school.exams.publish",
  SCHOOL_TIMETABLES_MANAGE: "school.timetables.manage",
  SCHOOL_TRANSPORT_MANAGE: "school.transport.manage",
  SCHOOL_LIBRARY_MANAGE: "school.library.manage",
  SCHOOL_PAYROLL_MANAGE: "school.payroll.manage",
  SCHOOL_REPORTS_VIEW: "school.reports.view",
  SCHOOL_SETTINGS_MANAGE: "school.settings.manage",
  PHARMACY_VIEW: "pharmacy.view",
  PHARMACY_MEDICINES_MANAGE: "pharmacy.medicines.manage",
  PHARMACY_STOCK_MANAGE: "pharmacy.stock.manage",
  PHARMACY_PATIENTS_MANAGE: "pharmacy.patients.manage",
  PHARMACY_PRESCRIPTIONS_MANAGE: "pharmacy.prescriptions.manage",
  PHARMACY_DISPENSING_MANAGE: "pharmacy.dispensing.manage",
  PHARMACY_RESTRICTED_VIEW: "pharmacy.restricted.view",
  PHARMACY_REPORTS_VIEW: "pharmacy.reports.view",
  PHARMACY_SETTINGS_MANAGE: "pharmacy.settings.manage",
  HOSPITAL_VIEW: "hospital.view",
  HOSPITAL_FACILITY_MANAGE: "hospital.facility.manage",
  HOSPITAL_PATIENTS_MANAGE: "hospital.patients.manage",
  HOSPITAL_APPOINTMENTS_MANAGE: "hospital.appointments.manage",
  HOSPITAL_ENCOUNTERS_MANAGE: "hospital.encounters.manage",
  HOSPITAL_ADMISSIONS_MANAGE: "hospital.admissions.manage",
  HOSPITAL_LAB_MANAGE: "hospital.lab.manage",
  HOSPITAL_IMAGING_MANAGE: "hospital.imaging.manage",
  HOSPITAL_MEDICATIONS_MANAGE: "hospital.medications.manage",
  HOSPITAL_NURSING_MANAGE: "hospital.nursing.manage",
  HOSPITAL_BILLING_MANAGE: "hospital.billing.manage",
  HOSPITAL_REPORTS_VIEW: "hospital.reports.view",
  HOSPITAL_SETTINGS_MANAGE: "hospital.settings.manage",
} as const;

export const ALL_PERMISSIONS = Object.values(PERMISSIONS);

export const SYSTEM_ROLES: { name: string; description: string }[] = [
  { name: "Super Admin", description: "Platform-level administrator role reserved for Rock Frost operators." },
  { name: "Organization Owner", description: "Tenant owner with organization administration privileges." },
  { name: "Fleet Manager", description: "Operational fleet role for vehicles, drivers, maintenance, payments, and reports." },
  { name: "Driver", description: "Fleet driver role for assigned vehicle access and operational updates." },
  { name: "Mechanic", description: "Maintenance service role for assigned repair workflows." },
  { name: "Investor", description: "Read-only stakeholder role for approved portfolio and performance visibility." },
  { name: "Hire Purchase Manager", description: "Operational Installment role for customers, accounts, payments, products, staff, and reports." },
  { name: "Hire Purchase Staff", description: "Field sales role scoped to managing their own assigned Installment customers, accounts, and payments." },
  { name: "CRM Manager", description: "Operational CRM role for contacts, leads, deals, and reports." },
  { name: "Inventory Manager", description: "Operational Inventory role for items, warehouses, movements, and reports." },
  { name: "Accounting Manager", description: "Operational Accounting role for the ledger, invoices, expenses, and reports." },
  { name: "HR Manager", description: "Operational HR role for employees, leave, reviews, and reports." },
  { name: "Procurement Manager", description: "Operational Procurement role for vendors, requests, orders, and reports." },
  { name: "Payroll Manager", description: "Operational Payroll role for compensation, runs, payslips, and reports." },
  { name: "Analytics Manager", description: "Read-only cross-module reporting role." },
  { name: "POS Cashier", description: "Operational Point of Sale role for registers, sessions, and sales." },
  { name: "Projects Manager", description: "Operational Project Management role for projects, tasks, and milestones." },
  { name: "Hotel Manager", description: "Full operational Hotel Management role." },
  { name: "Front Desk Agent", description: "Hotel guest, reservation, check-in, folio, and payment role." },
  { name: "Housekeeping Supervisor", description: "Hotel room-readiness and housekeeping supervision role." },
  { name: "Housekeeper", description: "Hotel housekeeping task execution role." },
  { name: "Restaurant Manager", description: "Hotel restaurant menu, order, and reconciliation role." },
  { name: "Revenue Manager", description: "Hotel reporting, rates, and distribution role." },
  { name: "School Administrator", description: "Full operational School Management role." },
  { name: "Admissions Officer", description: "School student, guardian, admission, and enrollment role." },
  { name: "Teacher", description: "School attendance, assessment, and timetable role." },
  { name: "Academic Head", description: "School academic-period, assessment, grading, and publishing role." },
  { name: "Bursar", description: "School fees, receipts, financial reporting, and payroll-input role." },
  { name: "Librarian", description: "School library catalog and circulation role." },
  { name: "Transport Manager", description: "School route and student transport assignment role." },
  { name: "Pharmacy Manager", description: "Full operational Pharmacy Management role." },
  { name: "Pharmacist", description: "Prescription validation, dispensing, restricted-register, and patient-care role." },
  { name: "Pharmacy Technician", description: "Medicine, stock, patient, and supervised dispensing operations role." },
  { name: "Hospital Administrator", description: "Full operational Hospital Management role." },
  { name: "Receptionist", description: "Hospital patient registration and appointment scheduling role." },
  { name: "Doctor", description: "Hospital clinical role for encounters, admissions, lab/imaging orders, and medication orders." },
  { name: "Nurse", description: "Hospital clinical role for vitals, encounters, admissions, and nursing tasks." },
  { name: "Laboratory Scientist", description: "Hospital laboratory order, specimen, and result role." },
  { name: "Radiology Staff", description: "Hospital imaging order, scheduling, and finding role." },
  { name: "Hospital Pharmacist", description: "Hospital medication-order review role for the dispensing-integration boundary." },
  { name: "Billing Officer", description: "Hospital invoicing, payment, and insurance-claim role." },
  { name: "Records Officer", description: "Hospital patient-record and reporting role." },
];

function moduleRolePermissions(keys: (typeof ALL_PERMISSIONS)[number][]) {
  return [PERMISSIONS.DASHBOARD_VIEW, PERMISSIONS.AI_ASSISTANT_USE, ...keys];
}

export const ROLE_PERMISSIONS: Record<string, string[]> = {
  "Super Admin": ALL_PERMISSIONS,
  "Organization Owner": ALL_PERMISSIONS,
  "Fleet Manager": moduleRolePermissions([
    PERMISSIONS.FLEET_VIEW,
    PERMISSIONS.FLEET_VEHICLES_MANAGE,
    PERMISSIONS.FLEET_OWNERS_MANAGE,
    PERMISSIONS.FLEET_DRIVERS_MANAGE,
    PERMISSIONS.FLEET_INSURANCE_MANAGE,
    PERMISSIONS.FLEET_MAINTENANCE_MANAGE,
    PERMISSIONS.FLEET_WORKANDPAY_MANAGE,
    PERMISSIONS.FLEET_PAYMENTS_MANAGE,
    PERMISSIONS.FLEET_REPORTS_VIEW,
  ]),
  Driver: [PERMISSIONS.DASHBOARD_VIEW, PERMISSIONS.FLEET_VIEW, PERMISSIONS.FLEET_MAINTENANCE_MANAGE, PERMISSIONS.AI_ASSISTANT_USE],
  Mechanic: [PERMISSIONS.DASHBOARD_VIEW, PERMISSIONS.FLEET_VIEW, PERMISSIONS.FLEET_MAINTENANCE_MANAGE, PERMISSIONS.AI_ASSISTANT_USE],
  Investor: [PERMISSIONS.DASHBOARD_VIEW, PERMISSIONS.FLEET_INVESTOR_VIEW, PERMISSIONS.FLEET_REPORTS_VIEW, PERMISSIONS.AI_ASSISTANT_USE],
  "Hire Purchase Manager": moduleRolePermissions([
    PERMISSIONS.HIREPURCHASE_VIEW,
    PERMISSIONS.HIREPURCHASE_CUSTOMERS_MANAGE,
    PERMISSIONS.HIREPURCHASE_ACCOUNTS_MANAGE,
    PERMISSIONS.HIREPURCHASE_PAYMENTS_MANAGE,
    PERMISSIONS.HIREPURCHASE_PRODUCTS_MANAGE,
    PERMISSIONS.HIREPURCHASE_STAFF_MANAGE,
    PERMISSIONS.HIREPURCHASE_CREDITS_MANAGE,
    PERMISSIONS.HIREPURCHASE_REPORTS_VIEW,
    PERMISSIONS.HIREPURCHASE_SETTINGS_MANAGE,
  ]),
  "Hire Purchase Staff": [
    PERMISSIONS.DASHBOARD_VIEW,
    PERMISSIONS.HIREPURCHASE_VIEW,
    PERMISSIONS.HIREPURCHASE_CUSTOMERS_MANAGE,
    PERMISSIONS.HIREPURCHASE_ACCOUNTS_MANAGE,
    PERMISSIONS.HIREPURCHASE_PAYMENTS_MANAGE,
    PERMISSIONS.AI_ASSISTANT_USE,
  ],
  "CRM Manager": moduleRolePermissions([
    PERMISSIONS.CRM_VIEW,
    PERMISSIONS.CRM_CONTACTS_MANAGE,
    PERMISSIONS.CRM_LEADS_MANAGE,
    PERMISSIONS.CRM_DEALS_MANAGE,
    PERMISSIONS.CRM_REPORTS_VIEW,
    PERMISSIONS.CRM_SETTINGS_MANAGE,
  ]),
  "Inventory Manager": moduleRolePermissions([
    PERMISSIONS.INVENTORY_VIEW,
    PERMISSIONS.INVENTORY_ITEMS_MANAGE,
    PERMISSIONS.INVENTORY_WAREHOUSES_MANAGE,
    PERMISSIONS.INVENTORY_MOVEMENTS_MANAGE,
    PERMISSIONS.INVENTORY_REPORTS_VIEW,
    PERMISSIONS.INVENTORY_SETTINGS_MANAGE,
  ]),
  "Accounting Manager": moduleRolePermissions([
    PERMISSIONS.ACCOUNTING_VIEW,
    PERMISSIONS.ACCOUNTING_ACCOUNTS_MANAGE,
    PERMISSIONS.ACCOUNTING_INVOICES_MANAGE,
    PERMISSIONS.ACCOUNTING_EXPENSES_MANAGE,
    PERMISSIONS.ACCOUNTING_REPORTS_VIEW,
    PERMISSIONS.ACCOUNTING_SETTINGS_MANAGE,
  ]),
  "HR Manager": moduleRolePermissions([
    PERMISSIONS.HR_VIEW,
    PERMISSIONS.HR_EMPLOYEES_MANAGE,
    PERMISSIONS.HR_LEAVE_MANAGE,
    PERMISSIONS.HR_REVIEWS_MANAGE,
    PERMISSIONS.HR_REPORTS_VIEW,
    PERMISSIONS.HR_SETTINGS_MANAGE,
  ]),
  "Procurement Manager": moduleRolePermissions([
    PERMISSIONS.PROCUREMENT_VIEW,
    PERMISSIONS.PROCUREMENT_VENDORS_MANAGE,
    PERMISSIONS.PROCUREMENT_REQUESTS_MANAGE,
    PERMISSIONS.PROCUREMENT_ORDERS_MANAGE,
    PERMISSIONS.PROCUREMENT_REPORTS_VIEW,
    PERMISSIONS.PROCUREMENT_SETTINGS_MANAGE,
  ]),
  "Payroll Manager": moduleRolePermissions([
    PERMISSIONS.PAYROLL_VIEW,
    PERMISSIONS.PAYROLL_COMPENSATION_MANAGE,
    PERMISSIONS.PAYROLL_RUNS_MANAGE,
    PERMISSIONS.PAYROLL_PAYSLIPS_VIEW,
    PERMISSIONS.PAYROLL_REPORTS_VIEW,
    PERMISSIONS.PAYROLL_SETTINGS_MANAGE,
  ]),
  "Analytics Manager": moduleRolePermissions([
    PERMISSIONS.ANALYTICS_VIEW,
    PERMISSIONS.ANALYTICS_FINANCIAL_VIEW,
    PERMISSIONS.ANALYTICS_SALES_VIEW,
    PERMISSIONS.ANALYTICS_OPERATIONS_VIEW,
    PERMISSIONS.ANALYTICS_PEOPLE_VIEW,
    PERMISSIONS.ANALYTICS_SETTINGS_MANAGE,
  ]),
  "POS Cashier": moduleRolePermissions([
    PERMISSIONS.POS_VIEW,
    PERMISSIONS.POS_REGISTERS_MANAGE,
    PERMISSIONS.POS_SESSIONS_MANAGE,
    PERMISSIONS.POS_SALES_MANAGE,
    PERMISSIONS.POS_REPORTS_VIEW,
    PERMISSIONS.POS_SETTINGS_MANAGE,
  ]),
  "Projects Manager": moduleRolePermissions([
    PERMISSIONS.PROJECTS_VIEW,
    PERMISSIONS.PROJECTS_PROJECTS_MANAGE,
    PERMISSIONS.PROJECTS_TASKS_MANAGE,
    PERMISSIONS.PROJECTS_MILESTONES_MANAGE,
    PERMISSIONS.PROJECTS_REPORTS_VIEW,
    PERMISSIONS.PROJECTS_SETTINGS_MANAGE,
  ]),
  "Hotel Manager": moduleRolePermissions([
    PERMISSIONS.HOTEL_VIEW, PERMISSIONS.HOTEL_PROPERTIES_MANAGE, PERMISSIONS.HOTEL_ROOMS_MANAGE,
    PERMISSIONS.HOTEL_GUESTS_MANAGE, PERMISSIONS.HOTEL_RESERVATIONS_MANAGE, PERMISSIONS.HOTEL_FOLIOS_MANAGE,
    PERMISSIONS.HOTEL_HOUSEKEEPING_MANAGE, PERMISSIONS.HOTEL_RESTAURANT_MANAGE, PERMISSIONS.HOTEL_CHANNELS_MANAGE,
    PERMISSIONS.HOTEL_REPORTS_VIEW, PERMISSIONS.HOTEL_SETTINGS_MANAGE,
  ]),
  "Front Desk Agent": moduleRolePermissions([
    PERMISSIONS.HOTEL_VIEW, PERMISSIONS.HOTEL_GUESTS_MANAGE, PERMISSIONS.HOTEL_RESERVATIONS_MANAGE,
    PERMISSIONS.HOTEL_FOLIOS_MANAGE, PERMISSIONS.HOTEL_REPORTS_VIEW,
  ]),
  "Housekeeping Supervisor": moduleRolePermissions([PERMISSIONS.HOTEL_VIEW, PERMISSIONS.HOTEL_ROOMS_MANAGE, PERMISSIONS.HOTEL_HOUSEKEEPING_MANAGE, PERMISSIONS.HOTEL_REPORTS_VIEW]),
  Housekeeper: moduleRolePermissions([PERMISSIONS.HOTEL_VIEW, PERMISSIONS.HOTEL_HOUSEKEEPING_MANAGE]),
  "Restaurant Manager": moduleRolePermissions([PERMISSIONS.HOTEL_VIEW, PERMISSIONS.HOTEL_RESTAURANT_MANAGE, PERMISSIONS.HOTEL_REPORTS_VIEW]),
  "Revenue Manager": moduleRolePermissions([PERMISSIONS.HOTEL_VIEW, PERMISSIONS.HOTEL_CHANNELS_MANAGE, PERMISSIONS.HOTEL_REPORTS_VIEW, PERMISSIONS.HOTEL_SETTINGS_MANAGE]),
  "School Administrator": moduleRolePermissions([
    PERMISSIONS.SCHOOL_VIEW, PERMISSIONS.SCHOOL_CAMPUSES_MANAGE, PERMISSIONS.SCHOOL_STUDENTS_MANAGE,
    PERMISSIONS.SCHOOL_ACADEMICS_MANAGE, PERMISSIONS.SCHOOL_ENROLLMENT_MANAGE, PERMISSIONS.SCHOOL_ATTENDANCE_MANAGE,
    PERMISSIONS.SCHOOL_FEES_MANAGE, PERMISSIONS.SCHOOL_EXAMS_MANAGE, PERMISSIONS.SCHOOL_EXAMS_PUBLISH,
    PERMISSIONS.SCHOOL_TIMETABLES_MANAGE, PERMISSIONS.SCHOOL_TRANSPORT_MANAGE, PERMISSIONS.SCHOOL_LIBRARY_MANAGE,
    PERMISSIONS.SCHOOL_PAYROLL_MANAGE, PERMISSIONS.SCHOOL_REPORTS_VIEW, PERMISSIONS.SCHOOL_SETTINGS_MANAGE,
  ]),
  "Admissions Officer": moduleRolePermissions([PERMISSIONS.SCHOOL_VIEW, PERMISSIONS.SCHOOL_STUDENTS_MANAGE, PERMISSIONS.SCHOOL_ENROLLMENT_MANAGE]),
  Teacher: moduleRolePermissions([PERMISSIONS.SCHOOL_VIEW, PERMISSIONS.SCHOOL_ATTENDANCE_MANAGE, PERMISSIONS.SCHOOL_EXAMS_MANAGE, PERMISSIONS.SCHOOL_TIMETABLES_MANAGE]),
  "Academic Head": moduleRolePermissions([PERMISSIONS.SCHOOL_VIEW, PERMISSIONS.SCHOOL_ACADEMICS_MANAGE, PERMISSIONS.SCHOOL_ENROLLMENT_MANAGE, PERMISSIONS.SCHOOL_ATTENDANCE_MANAGE, PERMISSIONS.SCHOOL_EXAMS_MANAGE, PERMISSIONS.SCHOOL_EXAMS_PUBLISH, PERMISSIONS.SCHOOL_TIMETABLES_MANAGE, PERMISSIONS.SCHOOL_REPORTS_VIEW]),
  Bursar: moduleRolePermissions([PERMISSIONS.SCHOOL_VIEW, PERMISSIONS.SCHOOL_FEES_MANAGE, PERMISSIONS.SCHOOL_PAYROLL_MANAGE, PERMISSIONS.SCHOOL_REPORTS_VIEW]),
  Librarian: moduleRolePermissions([PERMISSIONS.SCHOOL_VIEW, PERMISSIONS.SCHOOL_LIBRARY_MANAGE, PERMISSIONS.SCHOOL_REPORTS_VIEW]),
  "Transport Manager": moduleRolePermissions([PERMISSIONS.SCHOOL_VIEW, PERMISSIONS.SCHOOL_TRANSPORT_MANAGE, PERMISSIONS.SCHOOL_REPORTS_VIEW]),
  "Pharmacy Manager": moduleRolePermissions([PERMISSIONS.PHARMACY_VIEW, PERMISSIONS.PHARMACY_MEDICINES_MANAGE, PERMISSIONS.PHARMACY_STOCK_MANAGE, PERMISSIONS.PHARMACY_PATIENTS_MANAGE, PERMISSIONS.PHARMACY_PRESCRIPTIONS_MANAGE, PERMISSIONS.PHARMACY_DISPENSING_MANAGE, PERMISSIONS.PHARMACY_RESTRICTED_VIEW, PERMISSIONS.PHARMACY_REPORTS_VIEW, PERMISSIONS.PHARMACY_SETTINGS_MANAGE]),
  Pharmacist: moduleRolePermissions([PERMISSIONS.PHARMACY_VIEW, PERMISSIONS.PHARMACY_MEDICINES_MANAGE, PERMISSIONS.PHARMACY_STOCK_MANAGE, PERMISSIONS.PHARMACY_PATIENTS_MANAGE, PERMISSIONS.PHARMACY_PRESCRIPTIONS_MANAGE, PERMISSIONS.PHARMACY_DISPENSING_MANAGE, PERMISSIONS.PHARMACY_RESTRICTED_VIEW, PERMISSIONS.PHARMACY_REPORTS_VIEW]),
  "Pharmacy Technician": moduleRolePermissions([PERMISSIONS.PHARMACY_VIEW, PERMISSIONS.PHARMACY_MEDICINES_MANAGE, PERMISSIONS.PHARMACY_STOCK_MANAGE, PERMISSIONS.PHARMACY_PATIENTS_MANAGE, PERMISSIONS.PHARMACY_DISPENSING_MANAGE]),
  "Hospital Administrator": moduleRolePermissions([
    PERMISSIONS.HOSPITAL_VIEW, PERMISSIONS.HOSPITAL_FACILITY_MANAGE, PERMISSIONS.HOSPITAL_PATIENTS_MANAGE,
    PERMISSIONS.HOSPITAL_APPOINTMENTS_MANAGE, PERMISSIONS.HOSPITAL_ENCOUNTERS_MANAGE, PERMISSIONS.HOSPITAL_ADMISSIONS_MANAGE,
    PERMISSIONS.HOSPITAL_LAB_MANAGE, PERMISSIONS.HOSPITAL_IMAGING_MANAGE, PERMISSIONS.HOSPITAL_MEDICATIONS_MANAGE,
    PERMISSIONS.HOSPITAL_NURSING_MANAGE, PERMISSIONS.HOSPITAL_BILLING_MANAGE, PERMISSIONS.HOSPITAL_REPORTS_VIEW,
    PERMISSIONS.HOSPITAL_SETTINGS_MANAGE,
  ]),
  Receptionist: moduleRolePermissions([PERMISSIONS.HOSPITAL_VIEW, PERMISSIONS.HOSPITAL_PATIENTS_MANAGE, PERMISSIONS.HOSPITAL_APPOINTMENTS_MANAGE]),
  Doctor: moduleRolePermissions([
    PERMISSIONS.HOSPITAL_VIEW, PERMISSIONS.HOSPITAL_PATIENTS_MANAGE, PERMISSIONS.HOSPITAL_ENCOUNTERS_MANAGE,
    PERMISSIONS.HOSPITAL_ADMISSIONS_MANAGE, PERMISSIONS.HOSPITAL_LAB_MANAGE, PERMISSIONS.HOSPITAL_IMAGING_MANAGE,
    PERMISSIONS.HOSPITAL_MEDICATIONS_MANAGE, PERMISSIONS.HOSPITAL_REPORTS_VIEW,
  ]),
  Nurse: moduleRolePermissions([
    PERMISSIONS.HOSPITAL_VIEW, PERMISSIONS.HOSPITAL_PATIENTS_MANAGE, PERMISSIONS.HOSPITAL_ENCOUNTERS_MANAGE,
    PERMISSIONS.HOSPITAL_ADMISSIONS_MANAGE, PERMISSIONS.HOSPITAL_NURSING_MANAGE,
  ]),
  "Laboratory Scientist": moduleRolePermissions([PERMISSIONS.HOSPITAL_VIEW, PERMISSIONS.HOSPITAL_LAB_MANAGE]),
  "Radiology Staff": moduleRolePermissions([PERMISSIONS.HOSPITAL_VIEW, PERMISSIONS.HOSPITAL_IMAGING_MANAGE]),
  "Hospital Pharmacist": moduleRolePermissions([PERMISSIONS.HOSPITAL_VIEW, PERMISSIONS.HOSPITAL_MEDICATIONS_MANAGE]),
  "Billing Officer": moduleRolePermissions([PERMISSIONS.HOSPITAL_VIEW, PERMISSIONS.HOSPITAL_BILLING_MANAGE, PERMISSIONS.HOSPITAL_REPORTS_VIEW]),
  "Records Officer": moduleRolePermissions([PERMISSIONS.HOSPITAL_VIEW, PERMISSIONS.HOSPITAL_PATIENTS_MANAGE, PERMISSIONS.HOSPITAL_REPORTS_VIEW]),
};

/** Matches the `key`/`name` pairs in src/platform/modules/registry.ts. Keep in sync when adding a module. */
export const MODULES: { code: string; name: string }[] = [
  { code: "fleet", name: "Fleet Management" },
  { code: "installment", name: "Installment Management" },
  { code: "crm", name: "Customer Relationship Management" },
  { code: "inventory", name: "Inventory & Procurement" },
  { code: "accounting", name: "Accounting" },
  { code: "hr", name: "Human Resources & Payroll" },
  { code: "payroll", name: "Payroll" },
  { code: "procurement", name: "Procurement" },
  { code: "projects", name: "Project Management" },
  { code: "analytics", name: "Analytics" },
  { code: "pos", name: "Point of Sale" },
  { code: "hotel", name: "Hotel Management" },
  { code: "school", name: "School Management" },
  { code: "pharmacy", name: "Pharmacy Management" },
  { code: "hospital", name: "Hospital Management" },
];

/**
 * Seeds every Permission row, every system Role with its permission grants,
 * and every Module row (marked ACTIVE). Idempotent — safe to call
 * repeatedly against the same database (used both by the one-shot CLI seed
 * and, per-suite, by integration test fixtures against the disposable test
 * database).
 */
export async function seedPlatform(db: PrismaClient, options: { log?: boolean } = {}) {
  const log = options.log ?? true;

  await db.permission.createMany({
    data: ALL_PERMISSIONS.map((key) => ({ key, name: key })),
    skipDuplicates: true,
  });
  if (log) console.log(`Upserted ${ALL_PERMISSIONS.length} permissions.`);

  for (const role of SYSTEM_ROLES) {
    const existing = await db.role.findFirst({ where: { organizationId: null, name: role.name } });
    if (!existing) {
      await db.role.create({ data: { name: role.name, description: role.description, isSystem: true, organizationId: null } });
    }
  }

  const roles = await db.role.findMany({ where: { isSystem: true, organizationId: null } });
  const permissions = await db.permission.findMany();
  const permissionByKey = new Map(permissions.map((p) => [p.key, p]));

  const grants: Array<{ roleId: string; permissionId: string }> = [];
  for (const role of roles) {
    const keys = ROLE_PERMISSIONS[role.name];
    if (!keys) {
      if (log) console.warn(`No permission mapping defined for role "${role.name}", skipping.`);
      continue;
    }

    for (const key of keys) {
      const permission = permissionByKey.get(key);
      if (!permission) continue;
      grants.push({ roleId: role.id, permissionId: permission.id });
    }
    if (log) console.log(`Seeded ${keys.length} permission grants for role "${role.name}".`);
  }
  await db.rolePermission.createMany({ data: grants, skipDuplicates: true });

  await Promise.all(MODULES.map((mod) => db.module.upsert({
    where: { code: mod.code },
    update: { name: mod.name, status: "ACTIVE" },
    create: { code: mod.code, name: mod.name, status: "ACTIVE", isCore: false },
  })));
  if (log) console.log(`Upserted ${MODULES.length} modules (all ACTIVE).`);
}
