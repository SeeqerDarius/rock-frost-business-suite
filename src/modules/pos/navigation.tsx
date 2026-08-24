import { LayoutGrid, Store, ShoppingBag, ReceiptText, History, Wallet, BarChart3, Settings } from "lucide-react";
import type { ModuleNavItem } from "@/types/module";

export const posNavigation: ModuleNavItem[] = [
  { label: "POS Overview", href: "/app/pos", icon: <LayoutGrid className="size-4" /> },
  { label: "Registers", href: "/app/pos/registers", icon: <Store className="size-4" /> },
  { label: "Sell", href: "/app/pos/sell", icon: <ShoppingBag className="size-4" /> },
  { label: "Orders", href: "/app/pos/sales", icon: <ReceiptText className="size-4" /> },
  { label: "Sessions", href: "/app/pos/sessions", icon: <History className="size-4" /> },
  { label: "Payments", href: "/app/pos/payments", icon: <Wallet className="size-4" /> },
  { label: "Reports", href: "/app/pos/reports", icon: <BarChart3 className="size-4" /> },
  { label: "POS Settings", href: "/app/pos/settings", icon: <Settings className="size-4" /> },
];
