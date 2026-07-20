import { LayoutGrid, Store, ShoppingBag, ReceiptText, BarChart3, Settings } from "lucide-react";
import type { ModuleNavItem } from "@/types/module";

export const posNavigation: ModuleNavItem[] = [
  { label: "POS Overview", href: "/app/pos", icon: <LayoutGrid className="size-4" /> },
  { label: "Registers", href: "/app/pos/registers", icon: <Store className="size-4" /> },
  { label: "Sell", href: "/app/pos/sell", icon: <ShoppingBag className="size-4" /> },
  { label: "Sales", href: "/app/pos/sales", icon: <ReceiptText className="size-4" /> },
  { label: "Reports", href: "/app/pos/reports", icon: <BarChart3 className="size-4" /> },
  { label: "POS Settings", href: "/app/pos/settings", icon: <Settings className="size-4" /> },
];
