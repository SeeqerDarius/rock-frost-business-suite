import { AnimatedSettingsIcon } from "@/components/icons/animated-settings-icon";
import { Archive, BookOpenText, CalendarClock, CalendarDays, CircleCheck, CircleX, ClipboardCheck, ClipboardList, FilePen, FileStack, FileText, LayoutGrid, TimerOff, UsersRound } from "lucide-react";
import type { ModuleNavItem } from "@/types/module";

export const CONTRACT_LIST_VIEWS = {
  all: { label: "All contracts", description: "Every contract you can access, with search and filters." },
  drafts: { label: "Drafts", description: "Contracts still being drafted." },
  active: { label: "Active", description: "Contracts currently in force." },
  expiring: { label: "Expiring soon", description: "Active contracts reaching their expiration date in the next 90 days." },
  expired: { label: "Expired", description: "Contracts past their expiration date." },
  terminated: { label: "Terminated", description: "Contracts ended before their natural expiry." },
  archived: { label: "Archived", description: "Archived contracts. History is kept and they can be restored." },
} as const;
export type ContractListView = keyof typeof CONTRACT_LIST_VIEWS;

export const contractsNavigation: ModuleNavItem[] = [
  { label: "Dashboard", href: "/app/contracts", icon: <LayoutGrid className="size-4" />, description: "Contract totals, expiring contracts, renewals coming up, value by currency, and risk at a glance." },
  { label: "All Contracts", href: "/app/contracts/list", icon: <FileText className="size-4" />, group: "Contracts", description: "Search and filter every contract you can access by number, title, counterparty, status, tag, clause, or value." },
  { label: "Drafts", href: "/app/contracts/list/drafts", icon: <FilePen className="size-4" />, group: "Contracts", description: "Contracts still being drafted before activation." },
  { label: "Active", href: "/app/contracts/list/active", icon: <CircleCheck className="size-4" />, group: "Contracts", description: "Contracts currently in force." },
  { label: "Expiring Soon", href: "/app/contracts/list/expiring", icon: <CalendarClock className="size-4" />, group: "Contracts", description: "Active contracts that expire within the next 90 days." },
  { label: "Expired", href: "/app/contracts/list/expired", icon: <TimerOff className="size-4" />, group: "Contracts", description: "Contracts past their expiration date that need a decision." },
  { label: "Terminated", href: "/app/contracts/list/terminated", icon: <CircleX className="size-4" />, group: "Contracts", description: "Contracts ended before their natural expiry, with their full history." },
  { label: "Archived", href: "/app/contracts/list/archived", icon: <Archive className="size-4" />, group: "Contracts", description: "Archived contracts; nothing is deleted and they can be restored." },
  { label: "My Approvals", href: "/app/contracts/approvals", icon: <ClipboardCheck className="size-4" />, group: "Work", description: "Contracts waiting for your approval and acknowledgements requested from you." },
  { label: "Obligations", href: "/app/contracts/obligations", icon: <ClipboardList className="size-4" />, group: "Work", description: "Deliverables, payments, reports, and notices owed under your contracts, with overdue and upcoming views." },
  { label: "Calendar", href: "/app/contracts/calendar", icon: <CalendarDays className="size-4" />, group: "Work", description: "Expirations, renewal dates, notice deadlines, obligations, and milestones by month." },
  { label: "Templates", href: "/app/contracts/templates", icon: <FileStack className="size-4" />, group: "Library", description: "Reusable, versioned contract templates with variables such as the counterparty and contract dates." },
  { label: "Clauses", href: "/app/contracts/clauses", icon: <BookOpenText className="size-4" />, group: "Library", description: "The clause library: approved, versioned clauses marked recommended, required, optional, or restricted." },
  { label: "Team", href: "/app/contracts/staff", icon: <UsersRound className="size-4" />, group: "Library", description: "Invite Contract Management staff and assign the Contract Manager, Reviewer, or Viewer role." },
  { label: "Settings", href: "/app/contracts/settings", icon: <AnimatedSettingsIcon size={16} />, group: "Library", description: "Contract numbering, categories, types, alerts, approval rules, and the confidential access policy." },
];
