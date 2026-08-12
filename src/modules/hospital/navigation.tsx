import {
  LayoutDashboard,
  Users,
  CalendarDays,
  Stethoscope,
  BedDouble,
  FlaskConical,
  ScanLine,
  Pill,
  Receipt,
  ClipboardList,
  BarChart3,
  Building2,
  Settings,
} from "lucide-react";
import type { ModuleNavItem } from "@/types/module";

export const hospitalNavigation: ModuleNavItem[] = [
  { label: "Hospital Overview", shortLabel: "Overview", group: "Overview", href: "/app/hospital", icon: <LayoutDashboard className="size-4" /> },
  { label: "Patients", group: "Clinical", href: "/app/hospital/patients", icon: <Users className="size-4" /> },
  { label: "Appointments", group: "Clinical", href: "/app/hospital/appointments", icon: <CalendarDays className="size-4" /> },
  { label: "Encounters", group: "Clinical", href: "/app/hospital/encounters", icon: <Stethoscope className="size-4" /> },
  { label: "Admissions & Beds", shortLabel: "Beds", group: "Clinical", href: "/app/hospital/admissions", icon: <BedDouble className="size-4" /> },
  { label: "Laboratory", group: "Clinical", href: "/app/hospital/laboratory", icon: <FlaskConical className="size-4" /> },
  { label: "Imaging", group: "Clinical", href: "/app/hospital/imaging", icon: <ScanLine className="size-4" /> },
  { label: "Medication Orders", shortLabel: "Medications", group: "Clinical", href: "/app/hospital/medication-orders", icon: <Pill className="size-4" /> },
  { label: "Nursing", group: "Clinical", href: "/app/hospital/nursing", icon: <ClipboardList className="size-4" /> },
  { label: "Billing & Claims", shortLabel: "Billing", group: "Finance & insights", href: "/app/hospital/billing", icon: <Receipt className="size-4" /> },
  { label: "Reports", group: "Finance & insights", href: "/app/hospital/reports", icon: <BarChart3 className="size-4" /> },
  { label: "Facility", group: "Configuration", href: "/app/hospital/facility", icon: <Building2 className="size-4" /> },
  { label: "Hospital Settings", shortLabel: "Settings", group: "Configuration", href: "/app/hospital/settings", icon: <Settings className="size-4" /> },
];
