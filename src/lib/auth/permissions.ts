import "server-only";
import type { TenantContext } from "@/lib/tenant";
import { getModule } from "@/platform/modules/registry";

/** Every permission key currently seeded in the database (see the archived seed-rbac.ts). */
export const PERMISSIONS = {
  DASHBOARD_VIEW: "dashboard.view",
  ORG_SETTINGS_MANAGE: "org.settings.manage",
  AI_ASSISTANT_USE: "ai.assistant.use",
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
} as const;

export function hasPermission(tenant: TenantContext, key: string): boolean {
  return tenant.permissions.includes(key);
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
  const prefix = getModule(moduleKey)?.permissionPrefix;
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
  return tenant.role === "Super Admin";
}
