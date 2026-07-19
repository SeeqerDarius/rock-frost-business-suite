/**
 * Permission key catalog. Keys are stored verbatim in the `Permission.key`
 * column and referenced by `RolePermission` rows — see prisma/seed-rbac.ts
 * for how roles are mapped to these keys.
 *
 * Kept in a separate file (no "server-only" import) so it can be imported
 * from plain Node scripts like prisma/seed-rbac.ts, not just Next.js server code.
 */
export const PERMISSIONS = {
  DASHBOARD_VIEW: "dashboard.view",
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
  ORG_SETTINGS_MANAGE: "org.settings.manage",
  AI_ASSISTANT_USE: "ai.assistant.use",
} as const;

export type PermissionKey = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];
