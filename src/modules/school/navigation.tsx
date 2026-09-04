import { AnimatedSettingsIcon } from "@/components/icons/animated-settings-icon";
import { LayoutDashboard, School, Users, CalendarRange, Shapes, ClipboardCheck, Receipt, GraduationCap, CalendarClock, Bus, Library, Banknote, BarChart3, UserRoundCog } from "lucide-react";
import type { ModuleNavItem } from "@/types/module";

export const schoolNavigation: ModuleNavItem[] = [
  { label: "School Overview", shortLabel: "Overview", group: "Overview", href: "/app/school", icon: <LayoutDashboard className="size-4" />, description: "See enrollment, attendance, fee, and library snapshots and jump into attendance, exams, or timetable workflows." },
  { label: "Students & Guardians", shortLabel: "Students", group: "People", href: "/app/school/students", icon: <Users className="size-4" />, description: "Admit students, link guardians, upload photos, and move students between applicant, active, suspended, withdrawn, and graduated status." },
  { label: "Classes & Enrollment", shortLabel: "Classes", group: "People", href: "/app/school/classes", icon: <Shapes className="size-4" />, description: "Create classes and subjects, enroll students into classes, and assign teachers to a class." },
  { label: "Academic Periods", group: "Academics", href: "/app/school/academic-periods", icon: <CalendarRange className="size-4" />, description: "Create academic years and terms and mark which one is current for the whole school." },
  { label: "Attendance", group: "Academics", href: "/app/school/attendance", icon: <ClipboardCheck className="size-4" />, description: "Pick a term, class, and date to mark each student present, absent, late, or excused, and review recorded attendance." },
  { label: "Exams & Grading", shortLabel: "Exams", group: "Academics", href: "/app/school/exams", icon: <GraduationCap className="size-4" />, description: "Create exams, enter student results, and move them through moderation to publishing." },
  { label: "Timetables", group: "Academics", href: "/app/school/timetables", icon: <CalendarClock className="size-4" />, description: "Add weekly class periods with teacher and room, with automatic clash checking, and view the schedule by day." },
  { label: "Fees & Payments", shortLabel: "Fees", group: "Finance", href: "/app/school/fees", icon: <Receipt className="size-4" />, description: "Set up fee structures, issue invoices to students, and record payments against outstanding balances." },
  { label: "School Payroll", shortLabel: "Payroll", group: "Finance", href: "/app/school/payroll", icon: <Banknote className="size-4" />, description: "Record teaching allowances, overtime, and other payroll inputs by pay period for the Payroll module to process." },
  { label: "Transport", group: "Services", href: "/app/school/transport", icon: <Bus className="size-4" />, description: "Create bus routes with stops and drivers, and assign students to a route and boarding stop." },
  { label: "Library", group: "Services", href: "/app/school/library", icon: <Library className="size-4" />, description: "Add books to the catalogue and issue or return loans to students, tracking overdue items." },
  { label: "Campuses", group: "Administration", href: "/app/school/campuses", icon: <School className="size-4" />, description: "Create and manage the physical school sites that students, classes, and fees are tied to." },
  { label: "Staff", group: "Administration", href: "/app/school/staff", icon: <UserRoundCog className="size-4" />, description: "Invite teachers and other school staff, assign their school role, review class assignments, and manage access status." },
  { label: "Reports", group: "Administration", href: "/app/school/reports", icon: <BarChart3 className="size-4" />, description: "View live enrollment, attendance, and fee-collection indicators and export school reports." },
  { label: "School Settings", shortLabel: "Settings", group: "Administration", href: "/app/school/settings", icon: <AnimatedSettingsIcon size={16} />, description: "Configure per-campus attendance correction windows, receipt numbering, and grading scales." },
];
