import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

export interface ModuleNavItem {
  label: string;
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
}
