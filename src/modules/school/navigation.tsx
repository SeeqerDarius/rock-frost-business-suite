import { LayoutDashboard, School, Users, CalendarRange, Shapes, ClipboardCheck, Receipt, GraduationCap, CalendarClock, Bus, Library, Banknote, BarChart3, Settings } from "lucide-react";
import type { ModuleNavItem } from "@/types/module";

export const schoolNavigation: ModuleNavItem[] = [
  { label: "School Overview", shortLabel: "Overview", group: "Overview", href: "/app/school", icon: <LayoutDashboard className="size-4" /> },
  { label: "Students & Guardians", shortLabel: "Students", group: "People", href: "/app/school/students", icon: <Users className="size-4" /> },
  { label: "Classes & Enrollment", shortLabel: "Classes", group: "People", href: "/app/school/classes", icon: <Shapes className="size-4" /> },
  { label: "Academic Periods", group: "Academics", href: "/app/school/academic-periods", icon: <CalendarRange className="size-4" /> },
  { label: "Attendance", group: "Academics", href: "/app/school/attendance", icon: <ClipboardCheck className="size-4" /> },
  { label: "Exams & Grading", shortLabel: "Exams", group: "Academics", href: "/app/school/exams", icon: <GraduationCap className="size-4" /> },
  { label: "Timetables", group: "Academics", href: "/app/school/timetables", icon: <CalendarClock className="size-4" /> },
  { label: "Fees & Payments", shortLabel: "Fees", group: "Finance", href: "/app/school/fees", icon: <Receipt className="size-4" /> },
  { label: "School Payroll", shortLabel: "Payroll", group: "Finance", href: "/app/school/payroll", icon: <Banknote className="size-4" /> },
  { label: "Transport", group: "Services", href: "/app/school/transport", icon: <Bus className="size-4" /> },
  { label: "Library", group: "Services", href: "/app/school/library", icon: <Library className="size-4" /> },
  { label: "Campuses", group: "Administration", href: "/app/school/campuses", icon: <School className="size-4" /> },
  { label: "Reports", group: "Administration", href: "/app/school/reports", icon: <BarChart3 className="size-4" /> },
  { label: "School Settings", shortLabel: "Settings", group: "Administration", href: "/app/school/settings", icon: <Settings className="size-4" /> },
];
