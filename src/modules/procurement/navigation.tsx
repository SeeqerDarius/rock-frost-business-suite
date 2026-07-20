import { LayoutGrid, Building2, FileText, PackageCheck, BarChart3, Settings } from "lucide-react";
import type { ModuleNavItem } from "@/types/module";

export const procurementNavigation: ModuleNavItem[] = [
  { label: "Procurement Overview", href: "/app/procurement", icon: <LayoutGrid className="size-4" /> },
  { label: "Vendors", href: "/app/procurement/vendors", icon: <Building2 className="size-4" /> },
  { label: "Requests", href: "/app/procurement/requests", icon: <FileText className="size-4" /> },
  { label: "Orders", href: "/app/procurement/orders", icon: <PackageCheck className="size-4" /> },
  { label: "Reports", href: "/app/procurement/reports", icon: <BarChart3 className="size-4" /> },
  { label: "Procurement Settings", href: "/app/procurement/settings", icon: <Settings className="size-4" /> },
];
