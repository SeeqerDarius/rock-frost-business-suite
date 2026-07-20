import type { ComponentType } from "react";
import { FleetDashboardWidget } from "@/modules/fleet/dashboard-widget";

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
};
