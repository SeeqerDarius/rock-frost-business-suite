import {
  Truck,
  Wallet,
  Contact,
  Boxes,
  Calculator,
  UsersRound,
  Banknote,
  ShoppingCart,
  KanbanSquare,
  LineChart,
  Store,
  Building2,
  GraduationCap,
  Pill,
  Hospital,
  BedDouble,
} from "lucide-react";
import type { ModuleDefinition } from "@/types/module";
import { fleetNavigation } from "@/modules/fleet/navigation";
import { installmentNavigation } from "@/modules/installment/navigation";
import { crmNavigation } from "@/modules/crm/navigation";
import { inventoryNavigation } from "@/modules/inventory/navigation";
import { accountingNavigation } from "@/modules/accounting/navigation";
import { hrNavigation } from "@/modules/hr/navigation";
import { procurementNavigation } from "@/modules/procurement/navigation";
import { payrollNavigation } from "@/modules/payroll/navigation";
import { analyticsNavigation } from "@/modules/analytics/navigation";
import { posNavigation } from "@/modules/pos/navigation";
import { projectsNavigation } from "@/modules/projects/navigation";
import { hotelNavigation } from "@/modules/hotel/navigation";
import { schoolNavigation } from "@/modules/school/navigation";
import { hostelNavigation } from "@/modules/hostel/navigation";
import { pharmacyNavigation } from "@/modules/pharmacy/navigation";
import { hospitalNavigation } from "@/modules/hospital/navigation";

/**
 * The module registry. Every business module the platform can offer is declared
 * here — this is the single source of truth the module launcher, workspace
 * navigation, and (eventually) organization module-activation records read from.
 *
 * All available modules are declared here. Hotel, School, and Pharmacy follow the vertical
 * architecture contract in docs/HOTEL_AND_SCHOOL_MODULES.md. Billing/Subscriptions is a platform
 * capability rather than a tenant business module, so it does not belong here.
 */
const moduleDefinitions = [
  {
    key: "fleet",
    name: "Fleet Management",
    description: "Vehicles, drivers, owners, maintenance, insurance, and work-and-pay contracts.",
    icon: Truck,
    routePrefix: "/app/fleet",
    navigation: fleetNavigation,
    status: "available",
    permissionPrefix: "fleet.",
  },
  {
    key: "installment",
    name: "Installment Management",
    description: "Customer accounts, products, collections, and staff performance for installment sales.",
    icon: Wallet,
    routePrefix: "/app/installment",
    navigation: installmentNavigation,
    status: "available",
    permissionPrefix: "hirepurchase.",
  },
  {
    key: "crm",
    name: "Customer Relationship Management",
    description: "Leads, contacts, deals, and customer communication history.",
    icon: Contact,
    routePrefix: "/app/crm",
    navigation: crmNavigation,
    status: "available",
    permissionPrefix: "crm.",
  },
  {
    key: "inventory",
    name: "Inventory & Procurement",
    description: "Stock, warehouses, suppliers, purchase approvals, orders, receiving, and replenishment.",
    icon: Boxes,
    routePrefix: "/app/inventory",
    navigation: inventoryNavigation,
    status: "available",
    permissionPrefix: "inventory.",
    productKey: "inventory",
  },
  {
    key: "accounting",
    name: "Accounting",
    description: "Ledgers, invoices, expenses, and financial statements.",
    icon: Calculator,
    routePrefix: "/app/accounting",
    navigation: accountingNavigation,
    status: "available",
    permissionPrefix: "accounting.",
  },
  {
    key: "hr",
    name: "Human Resources & Payroll",
    description: "Employees, onboarding, leave, performance, compensation, payroll runs, and payslips.",
    icon: UsersRound,
    routePrefix: "/app/hr",
    navigation: hrNavigation,
    status: "available",
    permissionPrefix: "hr.",
    productKey: "hr",
  },
  {
    key: "payroll",
    name: "Payroll",
    description: "Salary runs, statutory deductions, and payslips.",
    icon: Banknote,
    routePrefix: "/app/payroll",
    navigation: payrollNavigation,
    status: "available",
    permissionPrefix: "payroll.",
    catalogueVisible: false,
    productKey: "hr",
  },
  {
    key: "procurement",
    name: "Procurement",
    description: "Purchase requests, vendor management, and purchase orders.",
    icon: ShoppingCart,
    routePrefix: "/app/procurement",
    navigation: procurementNavigation,
    status: "available",
    permissionPrefix: "procurement.",
    catalogueVisible: false,
    productKey: "inventory",
  },
  {
    key: "projects",
    name: "Project Management",
    description: "Projects, tasks, milestones, and team workload.",
    icon: KanbanSquare,
    routePrefix: "/app/projects",
    navigation: projectsNavigation,
    status: "available",
    permissionPrefix: "projects.",
  },
  {
    key: "analytics",
    name: "Analytics",
    description: "Cross-module reporting and organization-wide business intelligence.",
    icon: LineChart,
    routePrefix: "/app/analytics",
    navigation: analyticsNavigation,
    status: "available",
    permissionPrefix: "analytics.",
  },
  {
    key: "pos",
    name: "Point of Sale",
    description: "Registers, checkout, and same-day retail sales.",
    icon: Store,
    routePrefix: "/app/pos",
    navigation: posNavigation,
    status: "available",
    permissionPrefix: "pos.",
  },
  {
    key: "hotel",
    name: "Hotel Management",
    description: "Property operations, reservations, stays, folios, housekeeping, food and beverage, and distribution.",
    icon: Building2,
    routePrefix: "/app/hotel",
    navigation: hotelNavigation,
    status: "available",
    permissionPrefix: "hotel.",
  },
  {
    key: "school",
    name: "School Management",
    description: "Admissions, academics, attendance, fees, assessments, campus services, and family engagement.",
    icon: GraduationCap,
    routePrefix: "/app/school",
    navigation: schoolNavigation,
    status: "available",
    permissionPrefix: "school.",
  },
  {
    key: "hostel",
    name: "Hostel Management",
    description: "Boarding hostel buildings, rooms and beds, student allocations, wardens, and hostel fee billing: a companion to School Management for schools with residential facilities.",
    icon: BedDouble,
    routePrefix: "/app/hostel",
    navigation: hostelNavigation,
    status: "available",
    permissionPrefix: "hostel.",
  },
  {
    key: "pharmacy",
    name: "Pharmacy Management",
    description: "Medicines, batch and expiry stock, prescriptions, dispensing, restricted registers, and pharmacy reporting.",
    icon: Pill,
    routePrefix: "/app/pharmacy",
    navigation: pharmacyNavigation,
    status: "available",
    permissionPrefix: "pharmacy.",
  },
  {
    key: "hospital",
    name: "Hospital Management",
    description: "Patient records, appointments, encounters, admissions and beds, laboratory, imaging, medication orders, and billing.",
    icon: Hospital,
    routePrefix: "/app/hospital",
    navigation: hospitalNavigation,
    status: "available",
    permissionPrefix: "hospital.",
  },
] as const satisfies readonly ModuleDefinition[];

export type BusinessModuleKey = (typeof moduleDefinitions)[number]["key"];

// Expose the registry through the full definition type so consumers can
// handle future statuses while the guard retains the exact module-key union.
export const moduleRegistry: readonly ModuleDefinition[] = moduleDefinitions;
export const catalogueModuleRegistry: readonly ModuleDefinition[] = moduleRegistry.filter((module_) => module_.catalogueVisible !== false);
export const catalogueModuleKeys = catalogueModuleRegistry.map((module_) => module_.key);

export function getModule(key: string): ModuleDefinition | undefined {
  return moduleRegistry.find((mod) => mod.key === key);
}
