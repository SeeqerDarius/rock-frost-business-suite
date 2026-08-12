import { LayoutGrid, Pill, PackagePlus, Users, ClipboardList, ShoppingBag, ShieldAlert, BarChart3, Settings } from "lucide-react";
import type { ModuleNavItem } from "@/types/module";

export const pharmacyNavigation: ModuleNavItem[] = [
  { label: "Pharmacy Overview", href: "/app/pharmacy", icon: <LayoutGrid className="size-4" /> },
  { label: "Medicines", href: "/app/pharmacy/medicines", icon: <Pill className="size-4" /> },
  { label: "Stock & Batches", href: "/app/pharmacy/stock", icon: <PackagePlus className="size-4" /> },
  { label: "Patients", href: "/app/pharmacy/patients", icon: <Users className="size-4" /> },
  { label: "Prescriptions", href: "/app/pharmacy/prescriptions", icon: <ClipboardList className="size-4" /> },
  { label: "Dispensing", href: "/app/pharmacy/dispensing", icon: <ShoppingBag className="size-4" /> },
  { label: "Restricted Register", href: "/app/pharmacy/restricted", icon: <ShieldAlert className="size-4" /> },
  { label: "Reports", href: "/app/pharmacy/reports", icon: <BarChart3 className="size-4" /> },
  { label: "Pharmacy Settings", href: "/app/pharmacy/settings", icon: <Settings className="size-4" /> },
];
