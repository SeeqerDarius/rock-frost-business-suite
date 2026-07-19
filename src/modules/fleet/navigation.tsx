import { Truck, Users, UserRound, ShieldCheck, Wrench, Handshake, Receipt, BarChart3, Settings } from "lucide-react";
import type { ModuleNavItem } from "@/types/module";

export const fleetNavigation: ModuleNavItem[] = [
  { label: "Fleet Overview", href: "/fleet", icon: <Truck className="size-4" /> },
  { label: "Vehicles", href: "/fleet/vehicles", icon: <Truck className="size-4" /> },
  { label: "Drivers", href: "/fleet/drivers", icon: <UserRound className="size-4" /> },
  { label: "Owners", href: "/fleet/owners", icon: <Users className="size-4" /> },
  { label: "Maintenance", href: "/fleet/maintenance", icon: <Wrench className="size-4" /> },
  { label: "Insurance & Roadworthy", href: "/fleet/insurance-roadworthy", icon: <ShieldCheck className="size-4" /> },
  { label: "Payments", href: "/fleet/payments", icon: <Receipt className="size-4" /> },
  { label: "Work & Pay", href: "/fleet/work-and-pay", icon: <Handshake className="size-4" /> },
  { label: "Reports", href: "/fleet/reports", icon: <BarChart3 className="size-4" /> },
  { label: "Fleet Settings", href: "/fleet/settings", icon: <Settings className="size-4" /> },
];
