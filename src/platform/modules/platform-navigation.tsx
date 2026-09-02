import { AnimatedSettingsIcon } from "@/components/icons/animated-settings-icon";
import { AnimatedActivityIcon } from "@/components/icons/animated-activity-icon";
import { LayoutGrid, Building2, CreditCard, Blocks, Inbox, MessageSquareHeart, Receipt, Hourglass } from "lucide-react";
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
    { label: "Feedback", href: "/app/platform/feedback", icon: <MessageSquareHeart className="size-4" /> },
    { label: "Subscriptions", href: "/app/platform/subscriptions", icon: <CreditCard className="size-4" /> },
    { label: "Billing", href: "/app/platform/billing", icon: <Receipt className="size-4" /> },
    { label: "Trials", href: "/app/platform/trials", icon: <Hourglass className="size-4" /> },
    { label: "Modules", href: "/app/platform/modules", icon: <Blocks className="size-4" /> },
    { label: "System Activity", href: "/app/platform/activity", icon: <AnimatedActivityIcon size={16} /> },
  ];
}

export const platformFooterNavigation: ModuleNavItem[] = [
  { label: "Platform Settings", shortLabel: "Settings", href: "/app/platform/settings", icon: <AnimatedSettingsIcon size={16} /> },
];
