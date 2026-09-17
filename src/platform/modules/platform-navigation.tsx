import { AnimatedSettingsIcon } from "@/components/icons/animated-settings-icon";
import { AnimatedActivityIcon } from "@/components/icons/animated-activity-icon";
import { LayoutGrid, Building2, CreditCard, Blocks, Inbox, MessageSquareHeart, Receipt, Hourglass } from "lucide-react";
import type { ModuleNavItem } from "@/types/module";

/**
 * Platform-scope navigation — for Rock Frost operators managing the SaaS
 * across all tenant organizations.
 *
 * Grouped rather than one flat list of nine: an operator arrives with one of
 * three jobs in mind (a customer to look after, money to chase, or the
 * platform itself to adjust) and the sidebar now says which is which. The
 * `group` label is rendered by SidebarNav above the first item carrying it,
 * so order here is what defines the groups.
 *
 * Support is deliberately not listed here — it's reachable from any platform
 * page via the floating bubble (src/app/app/layout.tsx), which links to the
 * dedicated Support inbox route. See docs/SUPPORT_MESSAGING.md.
 */
export function getPlatformNavigation(): ModuleNavItem[] {
  return [
    {
      label: "Overview",
      href: "/app/platform/dashboard",
      icon: <LayoutGrid className="size-4" />,
      description: "See platform-wide totals, recent signups, and anything waiting on an operator.",
    },
    {
      label: "Organizations",
      group: "Customers",
      href: "/app/platform/organizations",
      icon: <Building2 className="size-4" />,
      description: "Onboard a tenant and configure one customer's plan, modules, members, and lifecycle.",
    },
    {
      label: "Requests",
      group: "Customers",
      href: "/app/platform/requests",
      icon: <Inbox className="size-4" />,
      description: "Work the queue of module, customization, and migration requests customers submit.",
    },
    {
      label: "Feedback",
      group: "Customers",
      href: "/app/platform/feedback",
      icon: <MessageSquareHeart className="size-4" />,
      description: "Read what customers reported about the product from inside their own workspace.",
    },
    {
      label: "Subscriptions",
      group: "Revenue",
      href: "/app/platform/subscriptions",
      icon: <CreditCard className="size-4" />,
      description: "Create agreements, confirm payment, set seat limits, and edit the pricing catalogue.",
    },
    {
      label: "Billing",
      group: "Revenue",
      href: "/app/platform/billing",
      icon: <Receipt className="size-4" />,
      description: "Trace every subscription payment recorded, by organization and reference.",
    },
    {
      label: "Trials",
      group: "Revenue",
      href: "/app/platform/trials",
      icon: <Hourglass className="size-4" />,
      description: "Watch which trials are running out so they can be converted before they lapse.",
    },
    {
      label: "Modules",
      group: "Platform",
      href: "/app/platform/modules",
      icon: <Blocks className="size-4" />,
      description: "Decide which modules the whole platform offers before any customer can subscribe.",
    },
    {
      label: "System Activity",
      group: "Platform",
      href: "/app/platform/activity",
      icon: <AnimatedActivityIcon size={16} />,
      description: "Audit what changed across every tenant, who changed it, and when.",
    },
  ];
}

export const platformFooterNavigation: ModuleNavItem[] = [
  {
    label: "Platform Settings",
    shortLabel: "Settings",
    href: "/app/platform/settings",
    icon: <AnimatedSettingsIcon size={16} />,
    description: "Configure platform-wide defaults that apply to every organization.",
  },
];
