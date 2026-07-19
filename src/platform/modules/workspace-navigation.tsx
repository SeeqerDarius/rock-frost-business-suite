import { LayoutGrid, Grid3x3, BarChart3, Bell, Building2, ShieldCheck } from "lucide-react";
import type { ModuleNavItem } from "@/types/module";

/** Top-level workspace navigation — organization scope, not tied to any one module. */
export const workspaceNavigation: ModuleNavItem[] = [
  { label: "Overview", href: "/app/dashboard", icon: <LayoutGrid className="size-4" /> },
  { label: "Modules", href: "/app/modules", icon: <Grid3x3 className="size-4" /> },
  { label: "Reports", href: "/app/reports", icon: <BarChart3 className="size-4" /> },
  { label: "Notifications", href: "/app/notifications", icon: <Bell className="size-4" /> },
  { label: "Organization", href: "/app/organization", icon: <Building2 className="size-4" /> },
  { label: "Administration", href: "/app/administration", icon: <ShieldCheck className="size-4" /> },
];
