import { AnimatedSettingsIcon } from "@/components/icons/animated-settings-icon";
import { LayoutGrid, BookOpen, FileText, Receipt, ScrollText, BarChart3, Landmark, Wallet, CalendarRange, Sparkles, UsersRound, BadgePercent, ChartNoAxesCombined } from "lucide-react";
import type { ModuleNavItem } from "@/types/module";

export const accountingNavigation: ModuleNavItem[] = [
  { label: "Accounting Overview", href: "/app/accounting", icon: <LayoutGrid className="size-4" />, description: "See your cash balance, outstanding invoices, pending expenses, and net income in one glance." },
  { label: "Insights", href: "/app/accounting/insights", icon: <Sparkles className="size-4" />, description: "Review revenue and expense trends, revenue by source, and items needing attention, plus ask the AI assistant about your finances." },
  { label: "Chart of Accounts", href: "/app/accounting/accounts", icon: <BookOpen className="size-4" />, description: "Create and manage every ledger account, including its type, active status, and cash or bank classification." },
  { label: "Invoices", href: "/app/accounting/invoices", icon: <FileText className="size-4" />, description: "Create, send, pay, and void customer invoices with tax treatment applied automatically." },
  { label: "Receivables", href: "/app/accounting/receivables", icon: <UsersRound className="size-4" />, description: "View each customer's outstanding balance, overdue exposure, and full statement of charges and receipts." },
  { label: "Expenses", href: "/app/accounting/expenses", icon: <Receipt className="size-4" />, description: "Record vendor expenses and approve, reject, or pay them through their workflow." },
  { label: "Petty Cash", href: "/app/accounting/petty-cash", icon: <Wallet className="size-4" />, description: "Set up cash floats for custodians, record expenses against them, and replenish or close funds." },
  { label: "Journal", href: "/app/accounting/journal", icon: <ScrollText className="size-4" />, description: "Post manual double entry journal entries and reverse existing ones." },
  { label: "Cash and Bank", href: "/app/accounting/cashbook", icon: <Landmark className="size-4" />, description: "Post opening balances, view cashbook movements, and reconcile cash and bank accounts to statements." },
  { label: "Accounting Periods", href: "/app/accounting/periods", icon: <CalendarRange className="size-4" />, description: "Create accounting periods and close or reopen them to control when transactions can post." },
  { label: "Tax and VAT", href: "/app/accounting/tax", icon: <BadgePercent className="size-4" />, description: "Configure tax codes and periods, then generate a working VAT return backed by transaction evidence." },
  { label: "Budgets and Forecasts", href: "/app/accounting/planning", icon: <ChartNoAxesCombined className="size-4" />, description: "Create budgets and forecasts, manage approvals and revisions, and compare plans with posted actuals." },
  { label: "Reports", href: "/app/accounting/reports", icon: <BarChart3 className="size-4" />, description: "View profit and loss, revenue by source, and balance sheet figures, and export them." },
  { label: "Accounting Settings", href: "/app/accounting/settings", icon: <AnimatedSettingsIcon size={16} />, description: "Set your invoice numbering prefix and manage expense categories." },
];
