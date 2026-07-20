import "server-only";
import type { TenantContext } from "@/lib/tenant";

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
} as const;

/**
 * Module access is deliberately keyed on a permission *prefix*, not a single
 * ".view" permission — e.g. the Investor role has fleet.investor.view and
 * fleet.reports.view but not fleet.view, and still needs to reach the Fleet
 * module shell. Any permission under a module's prefix grants entry to that
 * module's section; page-level features inside it are gated more narrowly
 * once those pages have real functionality (Phase 6/7).
 */
export const MODULE_PERMISSION_PREFIX: Record<string, string> = {
  fleet: "fleet.",
  installment: "hirepurchase.",
};

export function hasPermission(tenant: TenantContext, key: string): boolean {
  return tenant.permissions.includes(key);
}

export function canAccessModule(tenant: TenantContext, moduleKey: string): boolean {
  if (!tenant.enabledModuleKeys.includes(moduleKey)) return false;
  const prefix = MODULE_PERMISSION_PREFIX[moduleKey];
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
