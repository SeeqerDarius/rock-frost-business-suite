import { LayoutDashboard, Building2, Users, ShieldCheck, Receipt, BarChart3, Settings } from "lucide-react";
import type { ModuleNavItem } from "@/types/module";

export const hostelNavigation: ModuleNavItem[] = [
  { label: "Hostel Overview", shortLabel: "Overview", href: "/app/hostel", icon: <LayoutDashboard className="size-4" />, description: "See building, room, and bed occupancy, allocation, warden, and outstanding-invoice counts at a glance." },
  { label: "Buildings & Rooms", shortLabel: "Buildings", href: "/app/hostel/buildings", icon: <Building2 className="size-4" />, description: "Create hostel buildings and their rooms, optionally linking a building to a school campus." },
  { label: "Allocations", href: "/app/hostel/allocations", icon: <Users className="size-4" />, description: "Assign an active student to an available bed for an academic year, or end an existing allocation." },
  { label: "Wardens", href: "/app/hostel/wardens", icon: <ShieldCheck className="size-4" />, description: "Assign staff members as wardens responsible for a specific hostel building." },
  { label: "Fees & Payments", shortLabel: "Fees", href: "/app/hostel/fees", icon: <Receipt className="size-4" />, description: "Set up hostel fee structures, issue invoices to students, and record payments against them." },
  { label: "Reports", href: "/app/hostel/reports", icon: <BarChart3 className="size-4" />, description: "View occupancy, allocation, and fee-billing indicators and export hostel reports." },
  { label: "Hostel Settings", shortLabel: "Settings", href: "/app/hostel/settings", icon: <Settings className="size-4" />, description: "Placeholder page. Hostel-wide configuration options are not yet built here." },
];
