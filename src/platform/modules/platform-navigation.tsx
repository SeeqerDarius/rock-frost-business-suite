import { LayoutGrid, Building2, CreditCard, Blocks, Activity, Inbox, Settings } from "lucide-react";
import type { ModuleNavItem } from "@/types/module";

/** Platform-scope navigation — for Rock Frost operators managing the SaaS across all tenant organizations. */
export const platformNavigation: ModuleNavItem[] = [
  { label: "Overview", href: "/app/platform/dashboard", icon: <LayoutGrid className="size-4" /> },
  { label: "Organizations", href: "/app/platform/organizations", icon: <Building2 className="size-4" /> },
  { label: "Requests", href: "/app/platform/requests", icon: <Inbox className="size-4" /> },
  { label: "Subscriptions", href: "/app/platform/subscriptions", icon: <CreditCard className="size-4" /> },
  { label: "Modules", href: "/app/platform/modules", icon: <Blocks className="size-4" /> },
  { label: "System Activity", href: "/app/platform/activity", icon: <Activity className="size-4" /> },
  { label: "Settings", href: "/app/platform/settings", icon: <Settings className="size-4" /> },
];
