import {
  LayoutDashboard,
  Users,
  CalendarDays,
  Stethoscope,
  BedDouble,
  FlaskConical,
  ScanLine,
  Pill,
  Receipt,
  ClipboardList,
  BarChart3,
  Building2,
} from "lucide-react";
import { AnimatedSettingsIcon } from "@/components/icons/animated-settings-icon";
import type { ModuleNavItem } from "@/types/module";

export const hospitalNavigation: ModuleNavItem[] = [
  { label: "Hospital Overview", shortLabel: "Overview", group: "Overview", href: "/app/hospital", icon: <LayoutDashboard className="size-4" />, description: "See patient, appointment, encounter, bed, lab, billing, and clinical-alert counts at a glance." },
  { label: "Patients", group: "Clinical", href: "/app/hospital/patients", icon: <Users className="size-4" />, description: "Register patients, record clinical alerts and allergies, and manage patient consent records." },
  { label: "Appointments", group: "Clinical", href: "/app/hospital/appointments", icon: <CalendarDays className="size-4" />, description: "Schedule provider or department appointments with conflict checking, then check patients in, cancel, or mark no-show." },
  { label: "Encounters", group: "Clinical", href: "/app/hospital/encounters", icon: <Stethoscope className="size-4" />, description: "Open a patient visit to record triage, vitals, notes, diagnoses, and care plans." },
  { label: "Admissions & Beds", shortLabel: "Beds", group: "Clinical", href: "/app/hospital/admissions", icon: <BedDouble className="size-4" />, description: "Admit a patient to an available bed, transfer them between beds, and discharge them, tracking bed occupancy." },
  { label: "Laboratory", group: "Clinical", href: "/app/hospital/laboratory", icon: <FlaskConical className="size-4" />, description: "Maintain the lab test catalogue, order tests, collect specimens, and enter and verify results." },
  { label: "Imaging", group: "Clinical", href: "/app/hospital/imaging", icon: <ScanLine className="size-4" />, description: "Maintain the imaging test catalogue, order and schedule studies, and enter and verify findings." },
  { label: "Medication Orders", shortLabel: "Medications", group: "Clinical", href: "/app/hospital/medication-orders", icon: <Pill className="size-4" />, description: "Prescribe medication for a patient encounter and send the order to Pharmacy for dispensing." },
  { label: "Nursing", group: "Clinical", href: "/app/hospital/nursing", icon: <ClipboardList className="size-4" />, description: "Create nursing tasks for a patient and track them through to completion." },
  { label: "Billing & Claims", shortLabel: "Billing", group: "Finance & insights", href: "/app/hospital/billing", icon: <Receipt className="size-4" />, description: "Create itemized patient invoices, record payments, void invoices, and file insurance claims." },
  { label: "Reports", group: "Finance & insights", href: "/app/hospital/reports", icon: <BarChart3 className="size-4" />, description: "Review patient census, appointment outcomes, lab verification rates, and discharge summaries." },
  { label: "Facility", group: "Configuration", href: "/app/hospital/facility", icon: <Building2 className="size-4" />, description: "Set up facilities, departments, service pricing, providers, wards, and beds." },
  { label: "Hospital Settings", shortLabel: "Settings", group: "Configuration", href: "/app/hospital/settings", icon: <AnimatedSettingsIcon size={16} />, description: "Configure per-facility numbering, timezone, currency, and record-retention policy." },
];
