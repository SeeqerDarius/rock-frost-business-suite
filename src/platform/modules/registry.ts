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

/**
 * The module registry. Every business module the platform can offer is declared
 * here — this is the single source of truth the module launcher, workspace
 * navigation, and (eventually) organization module-activation records read from.
 *
 * All modules except Projects are "available" as of Phase 15 (POS). Projects
 * remains a "coming-soon" placeholder so the launcher communicates the
 * platform's intended breadth honestly, without pretending it's built yet.
 */
export const moduleRegistry: ModuleDefinition[] = [
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
    name: "Inventory Management",
    description: "Stock levels, warehouses, transfers, and stock adjustments.",
    icon: Boxes,
    routePrefix: "/app/inventory",
    navigation: inventoryNavigation,
    status: "available",
    permissionPrefix: "inventory.",
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
    name: "Human Resources",
    description: "Employee records, onboarding, leave, and performance management.",
    icon: UsersRound,
    routePrefix: "/app/hr",
    navigation: hrNavigation,
    status: "available",
    permissionPrefix: "hr.",
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
  },
  {
    key: "projects",
    name: "Project Management",
    description: "Projects, tasks, milestones, and team workload.",
    icon: KanbanSquare,
    routePrefix: "/app/projects",
    navigation: [],
    status: "coming-soon",
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
];

export function getModule(key: string): ModuleDefinition | undefined {
  return moduleRegistry.find((mod) => mod.key === key);
}
