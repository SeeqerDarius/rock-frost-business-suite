import { LayoutGrid, Building2, UsersRound, Users, CalendarClock, ClipboardCheck, BarChart3, Settings, UserMinus } from "lucide-react";
import type { ModuleNavItem } from "@/types/module";

/** Configuration lives as a tab on HR Settings (src/app/app/hr/settings/page.tsx),
 * not a separate nav item - it's master-data lookups, the same kind of
 * module-wide setup HR Settings already covers. */
export const hrNavigation: ModuleNavItem[] = [
  { label: "HR Overview", href: "/app/hr", icon: <LayoutGrid className="size-4" />, description: "See active headcount, employees in onboarding, pending leave requests, and draft reviews at a glance." },
  { label: "Departments", href: "/app/hr/departments", icon: <Building2 className="size-4" />, description: "Browse employee counts by department and jump into each department's employee list." },
  { label: "Employees", href: "/app/hr/employees", icon: <UsersRound className="size-4" />, description: "Add and manage every employee record, viewed as a table or kanban board by status." },
  { label: "Directory", href: "/app/hr/directory", icon: <Users className="size-4" />, description: "Look up any employee's contact details, job title, and department, filterable by department." },
  { label: "Termination and Offboarding", href: "/app/hr/terminations", icon: <UserMinus className="size-4" />, description: "Start, approve, cancel, or reinstate employee terminations and track offboarding checklist tasks." },
  { label: "Leave", href: "/app/hr/leave", icon: <CalendarClock className="size-4" />, description: "Submit, approve, or reject employee time-off requests." },
  { label: "Reviews", href: "/app/hr/reviews", icon: <ClipboardCheck className="size-4" />, description: "Create performance reviews with a rating and summary, then mark them complete." },
  { label: "Reports", href: "/app/hr/reports", icon: <BarChart3 className="size-4" />, description: "View headcount by department, pending leave and review activity, and the organization's skills inventory." },
  { label: "HR Settings", href: "/app/hr/settings", icon: <Settings className="size-4" />, description: "Configure leave types, onboarding and offboarding plan templates, job positions, and other HR lookup lists." },
];
