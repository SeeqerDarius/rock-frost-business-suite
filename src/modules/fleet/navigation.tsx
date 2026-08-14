import { Truck, Users, UserRound, ShieldCheck, Wrench, Handshake, Receipt, BarChart3, Settings, Landmark, Gauge } from "lucide-react";
import type { ModuleNavItem } from "@/types/module";

export const fleetNavigation: ModuleNavItem[] = [
  { label: "Fleet Overview", href: "/app/fleet", icon: <Truck className="size-4" /> },
  { label: "Vehicles", href: "/app/fleet/vehicles", icon: <Truck className="size-4" /> },
  { label: "Drivers", href: "/app/fleet/drivers", icon: <UserRound className="size-4" /> },
  { label: "Driver Workspace", href: "/app/fleet/driver-portal", icon: <Gauge className="size-4" /> },
  { label: "Owners", href: "/app/fleet/owners", icon: <Users className="size-4" /> },
  { label: "Maintenance", href: "/app/fleet/maintenance", icon: <Wrench className="size-4" /> },
  { label: "Insurance & Roadworthy", href: "/app/fleet/insurance-roadworthy", icon: <ShieldCheck className="size-4" /> },
  { label: "Payments", href: "/app/fleet/payments", icon: <Receipt className="size-4" /> },
  { label: "Work & Pay", href: "/app/fleet/work-and-pay", icon: <Handshake className="size-4" /> },
  { label: "Reports", href: "/app/fleet/reports", icon: <BarChart3 className="size-4" /> },
  { label: "Investor Dashboard", href: "/app/fleet/investor", icon: <Landmark className="size-4" /> },
  { label: "Fleet Settings", href: "/app/fleet/settings", icon: <Settings className="size-4" /> },
];
