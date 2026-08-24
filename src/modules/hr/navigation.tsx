import { LayoutGrid, Building2, UsersRound, Users, CalendarClock, ClipboardCheck, BarChart3, Settings, UserMinus } from "lucide-react";
import type { ModuleNavItem } from "@/types/module";

/** Configuration lives as a tab on HR Settings (src/app/app/hr/settings/page.tsx),
 * not a separate nav item - it's master-data lookups, the same kind of
 * module-wide setup HR Settings already covers. */
export const hrNavigation: ModuleNavItem[] = [
  { label: "HR Overview", href: "/app/hr", icon: <LayoutGrid className="size-4" /> },
  { label: "Departments", href: "/app/hr/departments", icon: <Building2 className="size-4" /> },
  { label: "Employees", href: "/app/hr/employees", icon: <UsersRound className="size-4" /> },
  { label: "Directory", href: "/app/hr/directory", icon: <Users className="size-4" /> },
  { label: "Termination and Offboarding", href: "/app/hr/terminations", icon: <UserMinus className="size-4" /> },
  { label: "Leave", href: "/app/hr/leave", icon: <CalendarClock className="size-4" /> },
  { label: "Reviews", href: "/app/hr/reviews", icon: <ClipboardCheck className="size-4" /> },
  { label: "Reports", href: "/app/hr/reports", icon: <BarChart3 className="size-4" /> },
  { label: "HR Settings", href: "/app/hr/settings", icon: <Settings className="size-4" /> },
];
