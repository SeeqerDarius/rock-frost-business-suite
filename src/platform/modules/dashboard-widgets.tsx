import type { ComponentType } from "react";
import { FleetDashboardWidget } from "@/modules/fleet/dashboard-widget";
import { InstallmentDashboardWidget } from "@/modules/installment/dashboard-widget";
import { CrmDashboardWidget } from "@/modules/crm/dashboard-widget";
import { InventoryDashboardWidget } from "@/modules/inventory/dashboard-widget";
import { AccountingDashboardWidget } from "@/modules/accounting/dashboard-widget";
import { HrDashboardWidget } from "@/modules/hr/dashboard-widget";
import { ProcurementDashboardWidget } from "@/modules/procurement/dashboard-widget";
import { PayrollDashboardWidget } from "@/modules/payroll/dashboard-widget";
import { PosDashboardWidget } from "@/modules/pos/dashboard-widget";
import { ProjectsDashboardWidget } from "@/modules/projects/dashboard-widget";

/**
 * Per-module dashboard summary widgets, keyed by module key. Deliberately a
 * separate file from registry.ts: registry.ts is imported by the client-side
 * ModuleLauncher, and a widget component here does its own org-scoped data
 * fetching (server-only). Mixing the two would pull server-only code into
 * the client bundle. Only the organization dashboard page should import
 * this file.
 *
 * A module with no entry here just doesn't get a widget — the dashboard
 * falls back to its generic "open module" card for that module.
 */
export const dashboardWidgets: Record<string, ComponentType> = {
  fleet: FleetDashboardWidget,
  installment: InstallmentDashboardWidget,
  crm: CrmDashboardWidget,
  inventory: InventoryDashboardWidget,
  accounting: AccountingDashboardWidget,
  hr: HrDashboardWidget,
  procurement: ProcurementDashboardWidget,
  payroll: PayrollDashboardWidget,
  pos: PosDashboardWidget,
  projects: ProjectsDashboardWidget,
};
