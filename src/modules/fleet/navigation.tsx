import { AnimatedSettingsIcon } from "@/components/icons/animated-settings-icon";
import { Truck, Users, UserRound, ShieldCheck, Wrench, Handshake, Receipt, BarChart3, Landmark, Gauge, Hammer, Fuel } from "lucide-react";
import type { ModuleNavItem } from "@/types/module";

export const fleetNavigation: ModuleNavItem[] = [
  { label: "Fleet Overview", href: "/app/fleet", icon: <Truck className="size-4" />, description: "See at-a-glance counts of vehicles, drivers, owners, maintenance, remittances, and revenue for your whole fleet." },
  { label: "Vehicles", href: "/app/fleet/vehicles", icon: <Truck className="size-4" />, description: "Register vehicles with make, model, plate, and status, and assign an owner, driver, and remittance schedule." },
  { label: "Drivers", href: "/app/fleet/drivers", icon: <UserRound className="size-4" />, description: "Add and manage driver profiles, their licence details, employment status, and linked login." },
  { label: "Driver Workspace", href: "/app/fleet/driver-portal", icon: <Gauge className="size-4" />, description: "As a driver, view your assigned vehicles and contracts and submit remittance or instalment payments for review." },
  { label: "Mechanic Workspace", href: "/app/fleet/mechanic-portal", icon: <Hammer className="size-4" />, description: "As a mechanic, view maintenance requests assigned to you and record scheduled and completed repairs." },
  { label: "Owners", href: "/app/fleet/owners", icon: <Users className="size-4" />, description: "Manage vehicle owners, link their portal login, and see their assigned vehicles and revenue." },
  { label: "Mechanics", href: "/app/fleet/mechanics", icon: <Hammer className="size-4" />, description: "Maintain the roster of mechanics and workshops available for maintenance assignment." },
  { label: "Maintenance", href: "/app/fleet/maintenance", icon: <Wrench className="size-4" />, description: "Report vehicle faults and move repairs through review, approval, assignment, and completion." },
  { label: "Insurance & Roadworthy", href: "/app/fleet/insurance-roadworthy", icon: <ShieldCheck className="size-4" />, description: "Track each vehicle's insurance policy and roadworthy certificate expiry dates and renewal alerts." },
  { label: "Vehicle Expenses", href: "/app/fleet/vehicle-expenses", icon: <Fuel className="size-4" />, description: "Record fuel, fines, insurance premiums, licensing and other vehicle running costs, posted straight to Accounting." },
  { label: "Payments", href: "/app/fleet/payments", icon: <Receipt className="size-4" />, description: "Record and verify fleet payments such as remittances, owner payouts, and Work and Pay instalments." },
  { label: "Work & Pay", href: "/app/fleet/work-and-pay", icon: <Handshake className="size-4" />, description: "Set up and manage Work and Pay contracts that let a driver buy their assigned vehicle through instalments." },
  { label: "Reports", href: "/app/fleet/reports", icon: <BarChart3 className="size-4" />, description: "View fleet-wide financial and operational summaries covering vehicles, maintenance, payments, and documents." },
  { label: "Owner Workspace", href: "/app/fleet/investor", icon: <Landmark className="size-4" />, description: "As a vehicle owner or investor, review linked vehicles, remittances, maintenance, documents, and operating position." },
  { label: "Fleet Settings", href: "/app/fleet/settings", icon: <AnimatedSettingsIcon size={16} />, description: "Configure how many days before expiry insurance and roadworthy documents trigger renewal reminders." },
];
