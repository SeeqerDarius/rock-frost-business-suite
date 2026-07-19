import { LayoutGrid, Users, Package, FileText, Receipt, Wallet, UserRound, BarChart3, Settings } from "lucide-react";
import type { ModuleNavItem } from "@/types/module";

export const installmentNavigation: ModuleNavItem[] = [
  { label: "Installment Overview", href: "/app/installment", icon: <LayoutGrid className="size-4" /> },
  { label: "Customers", href: "/app/installment/customers", icon: <Users className="size-4" /> },
  { label: "Products", href: "/app/installment/products", icon: <Package className="size-4" /> },
  { label: "Customer Accounts", href: "/app/installment/accounts", icon: <FileText className="size-4" /> },
  { label: "Payments", href: "/app/installment/payments", icon: <Receipt className="size-4" /> },
  { label: "Collections", href: "/app/installment/collections", icon: <Wallet className="size-4" /> },
  { label: "Staff", href: "/app/installment/staff", icon: <UserRound className="size-4" /> },
  { label: "Reports", href: "/app/installment/reports", icon: <BarChart3 className="size-4" /> },
  { label: "Installment Settings", href: "/app/installment/settings", icon: <Settings className="size-4" /> },
];
