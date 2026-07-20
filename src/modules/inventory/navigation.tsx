import { LayoutGrid, Package, Warehouse, Layers, ArrowLeftRight, BarChart3, Settings } from "lucide-react";
import type { ModuleNavItem } from "@/types/module";

export const inventoryNavigation: ModuleNavItem[] = [
  { label: "Inventory Overview", href: "/app/inventory", icon: <LayoutGrid className="size-4" /> },
  { label: "Items", href: "/app/inventory/items", icon: <Package className="size-4" /> },
  { label: "Warehouses", href: "/app/inventory/warehouses", icon: <Warehouse className="size-4" /> },
  { label: "Stock", href: "/app/inventory/stock", icon: <Layers className="size-4" /> },
  { label: "Movements", href: "/app/inventory/movements", icon: <ArrowLeftRight className="size-4" /> },
  { label: "Reports", href: "/app/inventory/reports", icon: <BarChart3 className="size-4" /> },
  { label: "Inventory Settings", href: "/app/inventory/settings", icon: <Settings className="size-4" /> },
];
