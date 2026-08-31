import { AnimatedSettingsIcon } from "@/components/icons/animated-settings-icon";
import { LayoutGrid, BookOpen, FileText, Receipt, ScrollText, BarChart3, Landmark, Wallet, CalendarRange, Sparkles, UsersRound, BadgePercent, ChartNoAxesCombined, Contact, FileMinus2, FileSpreadsheet, Scale, BookOpenText, CalendarClock, Waves } from "lucide-react";
import type { ModuleNavItem } from "@/types/module";

export const accountingNavigation: ModuleNavItem[] = [
  { label: "Accounting Overview", href: "/app/accounting", icon: <LayoutGrid className="size-4" />, description: "See your cash balance, outstanding invoices, pending expenses, and net income in one glance." },
  { label: "Insights", href: "/app/accounting/insights", icon: <Sparkles className="size-4" />, description: "Review revenue and expense trends, revenue by source, and items needing attention, plus ask the AI assistant about your finances." },
  { label: "Chart of Accounts", href: "/app/accounting/accounts", icon: <BookOpen className="size-4" />, description: "Create and manage every ledger account, including its type, active status, and cash or bank classification." },
  { label: "Contacts", href: "/app/accounting/contacts", icon: <Contact className="size-4" />, description: "Manage the customers and suppliers you invoice and bill, shared across invoices, bills, and credit notes." },
  { label: "Invoices", href: "/app/accounting/invoices", icon: <FileText className="size-4" />, description: "Create, send, pay, and void customer invoices with tax treatment applied automatically." },
  { label: "Receivables", href: "/app/accounting/receivables", icon: <UsersRound className="size-4" />, description: "View each customer's outstanding balance, overdue exposure, and full statement of charges and receipts." },
  { label: "Bills", href: "/app/accounting/bills", icon: <FileSpreadsheet className="size-4" />, description: "Record a simple supplier bill and track it through approval, payment, or void without a purchase order." },
  { label: "Credit Notes", href: "/app/accounting/credit-notes", icon: <FileMinus2 className="size-4" />, description: "Issue a customer credit note and apply it to an invoice's balance or settle it as a cash refund." },
  { label: "Expenses", href: "/app/accounting/expenses", icon: <Receipt className="size-4" />, description: "Record vendor expenses and approve, reject, or pay them through their workflow." },
  { label: "Petty Cash", href: "/app/accounting/petty-cash", icon: <Wallet className="size-4" />, description: "Set up cash floats for custodians, record expenses against them, and replenish or close funds." },
  { label: "Journal", href: "/app/accounting/journal", icon: <ScrollText className="size-4" />, description: "Post manual double entry journal entries and reverse existing ones." },
  { label: "Cash and Bank", href: "/app/accounting/cashbook", icon: <Landmark className="size-4" />, description: "Post opening balances, view cashbook movements, and reconcile cash and bank accounts to statements." },
  { label: "Accounting Periods", href: "/app/accounting/periods", icon: <CalendarRange className="size-4" />, description: "Create accounting periods and close or reopen them to control when transactions can post." },
  { label: "Tax and VAT", href: "/app/accounting/tax", icon: <BadgePercent className="size-4" />, description: "Configure tax codes and periods, then generate a working VAT return backed by transaction evidence." },
  { label: "Budgets and Forecasts", href: "/app/accounting/planning", icon: <ChartNoAxesCombined className="size-4" />, description: "Create budgets and forecasts, manage approvals and revisions, and compare plans with posted actuals." },
  { label: "Reports", href: "/app/accounting/reports", icon: <BarChart3 className="size-4" />, description: "View profit and loss, revenue by source, and balance sheet figures, and export them." },
  { label: "Trial Balance", href: "/app/accounting/trial-balance", icon: <Scale className="size-4" />, description: "Every account's debit or credit balance as of today, with a running check that debits equal credits." },
  { label: "General Ledger", href: "/app/accounting/general-ledger", icon: <BookOpenText className="size-4" />, description: "Open any account to see its full chronological transaction history and running balance." },
  { label: "AR/AP Ageing", href: "/app/accounting/ageing", icon: <CalendarClock className="size-4" />, description: "Receivables and payables broken down into current, 1-30, 31-60, 61-90, and 90+ day buckets." },
  { label: "Cash Flow", href: "/app/accounting/cash-flow", icon: <Waves className="size-4" />, description: "Direct-method cash movement by operating, investing, and financing activity over a date range." },
  { label: "Accounting Settings", href: "/app/accounting/settings", icon: <AnimatedSettingsIcon size={16} />, description: "Set your invoice numbering prefix and manage expense categories." },
];
