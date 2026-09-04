import { AnimatedSettingsIcon } from "@/components/icons/animated-settings-icon";
import { LayoutGrid, Wallet, Handshake, Truck, UsersRound } from "lucide-react";
import type { ModuleNavItem } from "@/types/module";

export const analyticsNavigation: ModuleNavItem[] = [
  { label: "Analytics Overview", href: "/app/analytics", icon: <LayoutGrid className="size-4" />, description: "See revenue, pipeline value, fleet or inventory value, and headcount rolled up across every enabled module." },
  { label: "Financial", href: "/app/analytics/financial", icon: <Wallet className="size-4" />, description: "Review cash balance, revenue, expenses, net income, and outstanding invoices and expenses from Accounting and Payroll." },
  { label: "Sales & CRM", href: "/app/analytics/sales", icon: <Handshake className="size-4" />, description: "Check CRM pipeline value, win rate, leads, and deals alongside installment collections and receivables." },
  { label: "Operations", href: "/app/analytics/operations", icon: <Truck className="size-4" />, description: "See fleet, inventory, and procurement figures like vehicle count, stock value, and open purchase orders in one place." },
  { label: "People", href: "/app/analytics/people", icon: <UsersRound className="size-4" />, description: "View total and active headcount, onboarding and leave counts, and staff numbers broken down by department." },
  { label: "Team", href: "/app/analytics/staff", icon: <UsersRound className="size-4" />, description: "Invite Analytics staff, assign their role, and manage access." },
  { label: "Analytics Settings", href: "/app/analytics/settings", icon: <AnimatedSettingsIcon size={16} />, description: "Nothing to configure here. Analytics only mirrors data controlled by each source module's own settings." },
];
