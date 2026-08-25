import { LayoutGrid, Users, Package, FileText, Receipt, Wallet, UserRound, BarChart3, Settings } from "lucide-react";
import type { ModuleNavItem } from "@/types/module";

export const installmentNavigation: ModuleNavItem[] = [
  { label: "Installment Overview", href: "/app/installment", icon: <LayoutGrid className="size-4" />, description: "See at-a-glance counts of customers, active accounts, products, and total outstanding balance." },
  { label: "Customers", href: "/app/installment/customers", icon: <Users className="size-4" />, description: "Add customers buying on installment and assign each one to a staff member." },
  { label: "Products", href: "/app/installment/products", icon: <Package className="size-4" />, description: "Set up products for installment sale with cost price, daily payment amount, and duration." },
  { label: "Customer Accounts", href: "/app/installment/accounts", icon: <FileText className="size-4" />, description: "Open, deliver, reactivate, and manage each customer's installment account and its status." },
  { label: "Payments", href: "/app/installment/payments", icon: <Receipt className="size-4" />, description: "Record and edit customer installment payments and manage resulting credits." },
  { label: "Collections", href: "/app/installment/collections", icon: <Wallet className="size-4" />, description: "Compare expected versus actual collections for each day of the current week." },
  { label: "Staff", href: "/app/installment/staff", icon: <UserRound className="size-4" />, description: "Manage installment staff profiles, their linked login, monthly salary, and salary payment history." },
  { label: "Reports", href: "/app/installment/reports", icon: <BarChart3 className="size-4" />, description: "Review receivables, profit, payroll, and staff performance summaries for the installment business." },
  { label: "Installment Settings", href: "/app/installment/settings", icon: <Settings className="size-4" />, description: "Configure default installment duration, refund fee percentage, payment edit window, and procurement threshold." },
];
