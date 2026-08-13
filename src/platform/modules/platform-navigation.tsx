import { LayoutGrid, Building2, CreditCard, Blocks, Activity, Inbox, Settings } from "lucide-react";
import type { ModuleNavItem } from "@/types/module";

/**
 * Platform-scope navigation — for Rock Frost operators managing the SaaS
 * across all tenant organizations.
 *
 * Support is deliberately not listed here — it's reachable from any platform
 * page via the floating bubble (src/app/app/layout.tsx), which links to the
 * dedicated Support inbox route. See docs/SUPPORT_MESSAGING.md.
 */
export function getPlatformNavigation(): ModuleNavItem[] {
  return [
    { label: "Overview", href: "/app/platform/dashboard", icon: <LayoutGrid className="size-4" /> },
    { label: "Organizations", href: "/app/platform/organizations", icon: <Building2 className="size-4" /> },
    { label: "Requests", href: "/app/platform/requests", icon: <Inbox className="size-4" /> },
    { label: "Subscriptions", href: "/app/platform/subscriptions", icon: <CreditCard className="size-4" /> },
    { label: "Modules", href: "/app/platform/modules", icon: <Blocks className="size-4" /> },
    { label: "System Activity", href: "/app/platform/activity", icon: <Activity className="size-4" /> },
  ];
}

export const platformFooterNavigation: ModuleNavItem[] = [
  { label: "Platform Settings", shortLabel: "Settings", href: "/app/platform/settings", icon: <Settings className="size-4" /> },
];
