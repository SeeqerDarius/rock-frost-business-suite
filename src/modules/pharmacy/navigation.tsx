import { LayoutGrid, Pill, PackagePlus, Users, ClipboardList, ShoppingBag, ShieldAlert, BarChart3, Settings } from "lucide-react";
import type { ModuleNavItem } from "@/types/module";

export const pharmacyNavigation: ModuleNavItem[] = [
  { label: "Pharmacy Overview", href: "/app/pharmacy", icon: <LayoutGrid className="size-4" />, description: "See medicine, expiring-batch, open-prescription, and monthly dispensing totals and jump into stock or dispensing." },
  { label: "Medicines", href: "/app/pharmacy/medicines", icon: <Pill className="size-4" />, description: "Register medicines with SKU, class, and pricing, and look up items by barcode." },
  { label: "Stock & Batches", href: "/app/pharmacy/stock", icon: <PackagePlus className="size-4" />, description: "Receive supplier batches, register suppliers, and quarantine, recall, adjust, write off, or return stock." },
  { label: "Patients", href: "/app/pharmacy/patients", icon: <Users className="size-4" />, description: "Register patients with contact details and allergy information used during dispensing." },
  { label: "Prescriptions", href: "/app/pharmacy/prescriptions", icon: <ClipboardList className="size-4" />, description: "Register prescribers and record prescriptions with dosage, frequency, and quantities per medicine." },
  { label: "Dispensing", href: "/app/pharmacy/dispensing", icon: <ShoppingBag className="size-4" />, description: "Dispense medicine against a prescription or over the counter using FEFO stock, and approve or reject pending controlled-drug requests." },
  { label: "Restricted Register", href: "/app/pharmacy/restricted", icon: <ShieldAlert className="size-4" />, description: "View the append-only log of every controlled-medicine dispensing entry with patient and prescriber details." },
  { label: "Reports", href: "/app/pharmacy/reports", icon: <BarChart3 className="size-4" />, description: "Review expiring and expired stock, low-stock medicines, and other priority alerts." },
  { label: "Pharmacy Settings", href: "/app/pharmacy/settings", icon: <Settings className="size-4" />, description: "Configure licence details, receipt numbering, prescription validity, and controlled-drug safety controls." },
];
