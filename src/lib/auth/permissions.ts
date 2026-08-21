import "server-only";
import type { TenantContext } from "@/lib/tenant";
import { getModule, moduleRegistry } from "@/platform/modules/registry";

/** Every permission key currently seeded in the database (see the archived seed-rbac.ts). */
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
  FLEET_DRIVER_SELF_SERVICE: "fleet.driver.self_service",
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
  INVENTORY_COUNTS_MANAGE: "inventory.counts.manage",
  INVENTORY_COUNTS_APPROVE: "inventory.counts.approve",
  ACCOUNTING_VIEW: "accounting.view",
  ACCOUNTING_ACCOUNTS_MANAGE: "accounting.accounts.manage",
  ACCOUNTING_INVOICES_MANAGE: "accounting.invoices.manage",
  ACCOUNTING_EXPENSES_MANAGE: "accounting.expenses.manage",
  ACCOUNTING_REPORTS_VIEW: "accounting.reports.view",
  ACCOUNTING_SETTINGS_MANAGE: "accounting.settings.manage",
  ACCOUNTING_CASHBOOK_MANAGE: "accounting.cashbook.manage",
  ACCOUNTING_RECONCILIATIONS_MANAGE: "accounting.reconciliations.manage",
  HR_VIEW: "hr.view",
  HR_EMPLOYEES_MANAGE: "hr.employees.manage",
  HR_EMPLOYEES_VIEW: "hr.employees.view",
  HR_EMPLOYEES_EDIT: "hr.employees.edit",
  HR_TERMINATIONS_INITIATE: "hr.terminations.initiate",
  HR_TERMINATIONS_APPROVE: "hr.terminations.approve",
  HR_EMPLOYEES_REINSTATE: "hr.employees.reinstate",
  HR_SENSITIVE_DOCUMENTS_MANAGE: "hr.sensitive_documents.manage",
  HR_EMPLOYEES_EXPORT: "hr.employees.export",
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
  HOSTEL_VIEW: "hostel.view",
  HOSTEL_BUILDINGS_MANAGE: "hostel.buildings.manage",
  HOSTEL_ALLOCATIONS_MANAGE: "hostel.allocations.manage",
  HOSTEL_WARDENS_MANAGE: "hostel.wardens.manage",
  HOSTEL_FEES_MANAGE: "hostel.fees.manage",
  HOSTEL_REPORTS_VIEW: "hostel.reports.view",
  HOSTEL_SETTINGS_MANAGE: "hostel.settings.manage",
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

export function hasPermission(tenant: TenantContext, key: string): boolean {
  if (!tenant.permissions.includes(key)) return false;

  // A role may retain its seeded permission after the organization disables
  // the corresponding module. Treat that permission as inactive everywhere,
  // so a missed page/action guard still fails closed.
  const owningModule = moduleRegistry.find(
    (module_) => module_.permissionPrefix && key.startsWith(module_.permissionPrefix),
  );
  return !owningModule || tenant.enabledModuleKeys.includes(owningModule.key);
}

/**
 * Module access is deliberately keyed on the module's registered permission
 * *prefix* (see `ModuleDefinition.permissionPrefix` in `src/types/module.ts`),
 * not a single ".view" permission — e.g. the Investor role has
 * fleet.investor.view and fleet.reports.view but not fleet.view, and still
 * needs to reach the Fleet module shell. Any permission under the prefix
 * grants entry to that module's section; page-level features inside it are
 * gated more narrowly per page (see each module's own permission checks).
 */
export function canAccessModule(tenant: TenantContext, moduleKey: string): boolean {
  if (!tenant.enabledModuleKeys.includes(moduleKey)) return false;
  const module_ = getModule(moduleKey);
  if (!module_ || module_.status !== "available") return false;
  const prefix = module_.permissionPrefix;
  if (!prefix) return false;
  return tenant.permissions.some((permission) => permission.startsWith(prefix));
}

/**
 * Platform operators are gated on the "Super Admin" system role directly
 * rather than a permission key: Organization Owner also holds every
 * permission (ALL_PERMISSIONS in the RBAC seed), but must NOT reach
 * /app/platform/* — that's Rock Frost's own operator surface, not a tenant's.
 */
export function isPlatformOperator(tenant: TenantContext): boolean {
  return tenant.role === "Super Admin" && tenant.roleIsSystem && tenant.roleOrganizationId === null;
}
