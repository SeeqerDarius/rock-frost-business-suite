import type { ReactNode } from "react";
import {
  LayoutDashboard,
  ShoppingCart,
  Landmark,
  Receipt,
  BarChart3,
  Settings,
  Users,
  Shapes,
  CalendarRange,
  ClipboardCheck,
  GraduationCap,
  CalendarClock,
  Bus,
  Library,
  Banknote,
} from "lucide-react";

export interface ShellNavItem {
  key: string;
  label: string;
  group: string;
  icon: ReactNode;
}

/** Mirrors src/modules/pos/navigation.tsx's web sidebar groups, adapted to the desktop's screen keys. */
export const POS_NAVIGATION: ShellNavItem[] = [
  { key: "overview", label: "Overview", group: "Overview", icon: <LayoutDashboard className="size-4" /> },
  { key: "sell", label: "Sell", group: "Sales", icon: <ShoppingCart className="size-4" /> },
  { key: "registers", label: "Registers", group: "Sales", icon: <Landmark className="size-4" /> },
  { key: "sales", label: "Sales History", group: "Sales", icon: <Receipt className="size-4" /> },
  { key: "reports", label: "Reports", group: "Reports", icon: <BarChart3 className="size-4" /> },
  { key: "settings", label: "Settings", group: "Administration", icon: <Settings className="size-4" /> },
];

/** Mirrors src/modules/school/navigation.tsx's web sidebar groups, adapted to the desktop's screen keys. */
export const SCHOOL_NAVIGATION: ShellNavItem[] = [
  { key: "overview", label: "School Overview", group: "Overview", icon: <LayoutDashboard className="size-4" /> },
  { key: "students", label: "Students & Guardians", group: "People", icon: <Users className="size-4" /> },
  { key: "enrollment", label: "Classes & Enrollment", group: "People", icon: <Shapes className="size-4" /> },
  { key: "setup", label: "Academic Setup", group: "Academics", icon: <CalendarRange className="size-4" /> },
  { key: "attendance", label: "Attendance", group: "Academics", icon: <ClipboardCheck className="size-4" /> },
  { key: "exams", label: "Exams & Grading", group: "Academics", icon: <GraduationCap className="size-4" /> },
  { key: "timetable", label: "Timetables", group: "Academics", icon: <CalendarClock className="size-4" /> },
  { key: "fees", label: "Fees & Payments", group: "Finance", icon: <Receipt className="size-4" /> },
  { key: "payroll", label: "School Payroll", group: "Finance", icon: <Banknote className="size-4" /> },
  { key: "transport", label: "Transport", group: "Services", icon: <Bus className="size-4" /> },
  { key: "library", label: "Library", group: "Services", icon: <Library className="size-4" /> },
  { key: "settings", label: "School Settings", group: "Administration", icon: <Settings className="size-4" /> },
];

/** Fleet, Installment, and Inventory are still the single-screen demo view (ModuleDetailView) - one nav item is all they need. */
export const DEMO_NAVIGATION: ShellNavItem[] = [
  { key: "overview", label: "Overview", group: "Overview", icon: <LayoutDashboard className="size-4" /> },
];
