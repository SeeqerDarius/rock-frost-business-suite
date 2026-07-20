import { LayoutGrid, Banknote, PlayCircle, ReceiptText, BarChart3, Settings } from "lucide-react";
import type { ModuleNavItem } from "@/types/module";

export const payrollNavigation: ModuleNavItem[] = [
  { label: "Payroll Overview", href: "/app/payroll", icon: <LayoutGrid className="size-4" /> },
  { label: "Compensation", href: "/app/payroll/compensation", icon: <Banknote className="size-4" /> },
  { label: "Runs", href: "/app/payroll/runs", icon: <PlayCircle className="size-4" /> },
  { label: "Payslips", href: "/app/payroll/payslips", icon: <ReceiptText className="size-4" /> },
  { label: "Reports", href: "/app/payroll/reports", icon: <BarChart3 className="size-4" /> },
  { label: "Payroll Settings", href: "/app/payroll/settings", icon: <Settings className="size-4" /> },
];
