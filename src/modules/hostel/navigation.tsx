import { LayoutDashboard, Building2, Users, ShieldCheck, Receipt, BarChart3, Settings } from "lucide-react";
import type { ModuleNavItem } from "@/types/module";

export const hostelNavigation: ModuleNavItem[] = [
  { label: "Hostel Overview", shortLabel: "Overview", href: "/app/hostel", icon: <LayoutDashboard className="size-4" /> },
  { label: "Buildings & Rooms", shortLabel: "Buildings", href: "/app/hostel/buildings", icon: <Building2 className="size-4" /> },
  { label: "Allocations", href: "/app/hostel/allocations", icon: <Users className="size-4" /> },
  { label: "Wardens", href: "/app/hostel/wardens", icon: <ShieldCheck className="size-4" /> },
  { label: "Fees & Payments", shortLabel: "Fees", href: "/app/hostel/fees", icon: <Receipt className="size-4" /> },
  { label: "Reports", href: "/app/hostel/reports", icon: <BarChart3 className="size-4" /> },
  { label: "Hostel Settings", shortLabel: "Settings", href: "/app/hostel/settings", icon: <Settings className="size-4" /> },
];
