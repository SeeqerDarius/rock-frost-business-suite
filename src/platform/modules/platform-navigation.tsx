import { LayoutGrid, Building2, CreditCard, Blocks, Activity } from "lucide-react";
import type { ModuleNavItem } from "@/types/module";

/** Platform-scope navigation — for Rock Frost operators managing the SaaS across all tenant organizations. */
export const platformNavigation: ModuleNavItem[] = [
  { label: "Overview", href: "/platform/dashboard", icon: <LayoutGrid className="size-4" /> },
  { label: "Organizations", href: "/platform/organizations", icon: <Building2 className="size-4" /> },
  { label: "Subscriptions", href: "/platform/subscriptions", icon: <CreditCard className="size-4" /> },
  { label: "Modules", href: "/platform/modules", icon: <Blocks className="size-4" /> },
  { label: "System Activity", href: "/platform/activity", icon: <Activity className="size-4" /> },
];
