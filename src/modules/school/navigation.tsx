import { LayoutDashboard, School, Users, CalendarRange, Shapes, ClipboardCheck, Receipt, GraduationCap, CalendarClock, Bus, Library, Banknote, BarChart3, Settings } from "lucide-react";
import type { ModuleNavItem } from "@/types/module";

export const schoolNavigation: ModuleNavItem[] = [
  { label: "School Overview", href: "/app/school", icon: <LayoutDashboard className="size-4" /> },
  { label: "Campuses", href: "/app/school/campuses", icon: <School className="size-4" /> },
  { label: "Students & Guardians", href: "/app/school/students", icon: <Users className="size-4" /> },
  { label: "Academic Periods", href: "/app/school/academic-periods", icon: <CalendarRange className="size-4" /> },
  { label: "Classes & Enrollment", href: "/app/school/classes", icon: <Shapes className="size-4" /> },
  { label: "Attendance", href: "/app/school/attendance", icon: <ClipboardCheck className="size-4" /> },
  { label: "Fees & Payments", href: "/app/school/fees", icon: <Receipt className="size-4" /> },
  { label: "Exams & Grading", href: "/app/school/exams", icon: <GraduationCap className="size-4" /> },
  { label: "Timetables", href: "/app/school/timetables", icon: <CalendarClock className="size-4" /> },
  { label: "Transport", href: "/app/school/transport", icon: <Bus className="size-4" /> },
  { label: "Library", href: "/app/school/library", icon: <Library className="size-4" /> },
  { label: "School Payroll", href: "/app/school/payroll", icon: <Banknote className="size-4" /> },
  { label: "Reports", href: "/app/school/reports", icon: <BarChart3 className="size-4" /> },
  { label: "School Settings", href: "/app/school/settings", icon: <Settings className="size-4" /> },
];
