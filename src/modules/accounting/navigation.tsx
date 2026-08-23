import { LayoutGrid, BookOpen, FileText, Receipt, ScrollText, BarChart3, Settings, Landmark, Wallet, CalendarRange, Sparkles, UsersRound } from "lucide-react";
import type { ModuleNavItem } from "@/types/module";

export const accountingNavigation: ModuleNavItem[] = [
  { label: "Accounting Overview", href: "/app/accounting", icon: <LayoutGrid className="size-4" /> },
  { label: "Insights", href: "/app/accounting/insights", icon: <Sparkles className="size-4" /> },
  { label: "Chart of Accounts", href: "/app/accounting/accounts", icon: <BookOpen className="size-4" /> },
  { label: "Invoices", href: "/app/accounting/invoices", icon: <FileText className="size-4" /> },
  { label: "Receivables", href: "/app/accounting/receivables", icon: <UsersRound className="size-4" /> },
  { label: "Expenses", href: "/app/accounting/expenses", icon: <Receipt className="size-4" /> },
  { label: "Petty Cash", href: "/app/accounting/petty-cash", icon: <Wallet className="size-4" /> },
  { label: "Journal", href: "/app/accounting/journal", icon: <ScrollText className="size-4" /> },
  { label: "Cash and Bank", href: "/app/accounting/cashbook", icon: <Landmark className="size-4" /> },
  { label: "Accounting Periods", href: "/app/accounting/periods", icon: <CalendarRange className="size-4" /> },
  { label: "Reports", href: "/app/accounting/reports", icon: <BarChart3 className="size-4" /> },
  { label: "Accounting Settings", href: "/app/accounting/settings", icon: <Settings className="size-4" /> },
];
