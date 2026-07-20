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
} from "lucide-react";
import type { ModuleDefinition } from "@/types/module";
import { fleetNavigation } from "@/modules/fleet/navigation";
import { installmentNavigation } from "@/modules/installment/navigation";
import { crmNavigation } from "@/modules/crm/navigation";

/**
 * The module registry. Every business module the platform can offer is declared
 * here — this is the single source of truth the module launcher, workspace
 * navigation, and (eventually) organization module-activation records read from.
 *
 * Only Fleet and Installment are "available" in this phase. The rest are
 * declared as "coming-soon" placeholders so the launcher communicates the
 * platform's intended breadth honestly, without pretending they're built yet.
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
    navigation: [],
    status: "coming-soon",
  },
  {
    key: "accounting",
    name: "Accounting",
    description: "Ledgers, invoices, expenses, and financial statements.",
    icon: Calculator,
    routePrefix: "/app/accounting",
    navigation: [],
    status: "coming-soon",
  },
  {
    key: "hr",
    name: "Human Resources",
    description: "Employee records, onboarding, leave, and performance management.",
    icon: UsersRound,
    routePrefix: "/app/hr",
    navigation: [],
    status: "coming-soon",
  },
  {
    key: "payroll",
    name: "Payroll",
    description: "Salary runs, statutory deductions, and payslips.",
    icon: Banknote,
    routePrefix: "/app/payroll",
    navigation: [],
    status: "coming-soon",
  },
  {
    key: "procurement",
    name: "Procurement",
    description: "Purchase requests, vendor management, and purchase orders.",
    icon: ShoppingCart,
    routePrefix: "/app/procurement",
    navigation: [],
    status: "coming-soon",
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
    navigation: [],
    status: "coming-soon",
  },
];

export function getModule(key: string): ModuleDefinition | undefined {
  return moduleRegistry.find((mod) => mod.key === key);
}
