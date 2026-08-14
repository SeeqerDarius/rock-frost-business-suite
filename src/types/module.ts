import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

export interface ModuleNavItem {
  label: string;
  /** Optional compact label used when horizontal space is constrained. */
  shortLabel?: string;
  /** Optional visual section label for long module navigation lists. */
  group?: string;
  href: string;
  /**
   * A pre-rendered icon element (e.g. `<Truck className="size-4" />`), not a component
   * reference. Nav arrays are passed as props into the client-side AppShell/SidebarNav,
   * and component references (functions) cannot cross the Server->Client props boundary —
   * a rendered element can, since it's a plain serializable object.
   */
  icon: ReactNode;
}

export interface ModuleDefinition {
  /** Stable machine key, e.g. "fleet". Used for permission checks and DB module-activation records. */
  key: string;
  /** Human-readable name shown in the module launcher and navigation. */
  name: string;
  description: string;
  icon: LucideIcon;
  /** Route prefix under the workspace route group, e.g. "/fleet". */
  routePrefix: string;
  /** Sidebar navigation shown only while the user is inside this module. */
  navigation: ModuleNavItem[];
  /** Whether this module has real functionality yet, or is a placeholder shell. */
  status: "available" | "coming-soon";
  /**
   * Permission-key prefix that grants entry to this module's section (e.g. "fleet.").
   * Deliberately a prefix rather than a single ".view" permission — a role can hold a
   * narrower permission under the prefix (e.g. Investor's fleet.investor.view) without
   * holding fleet.view itself, and should still reach the module. Required once a module
   * is "available"; omitted for "coming-soon" placeholders that have no permissions yet.
   */
  permissionPrefix?: string;
  /** Hidden legacy capability behind a consolidated customer-facing product. */
  catalogueVisible?: boolean;
  /** Stable customer-facing product key shared by consolidated capabilities. */
  productKey?: string;
}
