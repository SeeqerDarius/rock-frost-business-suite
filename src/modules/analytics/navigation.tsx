import { LayoutGrid, Wallet, Handshake, Truck, UsersRound, Settings } from "lucide-react";
import type { ModuleNavItem } from "@/types/module";

export const analyticsNavigation: ModuleNavItem[] = [
  { label: "Analytics Overview", href: "/app/analytics", icon: <LayoutGrid className="size-4" /> },
  { label: "Financial", href: "/app/analytics/financial", icon: <Wallet className="size-4" /> },
  { label: "Sales & CRM", href: "/app/analytics/sales", icon: <Handshake className="size-4" /> },
  { label: "Operations", href: "/app/analytics/operations", icon: <Truck className="size-4" /> },
  { label: "People", href: "/app/analytics/people", icon: <UsersRound className="size-4" /> },
  { label: "Analytics Settings", href: "/app/analytics/settings", icon: <Settings className="size-4" /> },
];
