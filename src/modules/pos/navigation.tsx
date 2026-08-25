import { LayoutGrid, Store, ShoppingBag, ReceiptText, History, Wallet, BarChart3, Settings } from "lucide-react";
import type { ModuleNavItem } from "@/types/module";

export const posNavigation: ModuleNavItem[] = [
  { label: "POS Overview", href: "/app/pos", icon: <LayoutGrid className="size-4" />, description: "See open register sessions, today's sales, all-time sales, and refunds at a glance." },
  { label: "Registers", href: "/app/pos/registers", icon: <Store className="size-4" />, description: "Add checkout registers, link them to a warehouse for stock deduction, and open or close till sessions." },
  { label: "Sell", href: "/app/pos/sell", icon: <ShoppingBag className="size-4" />, description: "Ring up a new sale against an open register session by adding products, scanning barcodes, and taking payment." },
  { label: "Orders", href: "/app/pos/sales", icon: <ReceiptText className="size-4" />, description: "Browse every recorded sale, resume a suspended sale to complete payment, or process a return on completed items." },
  { label: "Sessions", href: "/app/pos/sessions", icon: <History className="size-4" />, description: "Review every till session's opening float, closing cash, cash variance, and sales count across all registers." },
  { label: "Payments", href: "/app/pos/payments", icon: <Wallet className="size-4" />, description: "See every payment recorded against a sale, totaled by payment method, across every register." },
  { label: "Reports", href: "/app/pos/reports", icon: <BarChart3 className="size-4" />, description: "View summary counts and totals for registers, sessions, and sales, and export the report." },
  { label: "POS Settings", href: "/app/pos/settings", icon: <Settings className="size-4" />, description: "Set the sale number prefix and edit the footer text printed on every receipt." },
];
