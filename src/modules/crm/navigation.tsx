import { LayoutGrid, Users, Target, Handshake, History, BarChart3, Settings } from "lucide-react";
import type { ModuleNavItem } from "@/types/module";

export const crmNavigation: ModuleNavItem[] = [
  { label: "CRM Overview", href: "/app/crm", icon: <LayoutGrid className="size-4" /> },
  { label: "Contacts", href: "/app/crm/contacts", icon: <Users className="size-4" /> },
  { label: "Leads", href: "/app/crm/leads", icon: <Target className="size-4" /> },
  { label: "Deals", href: "/app/crm/deals", icon: <Handshake className="size-4" /> },
  { label: "Activities", href: "/app/crm/activities", icon: <History className="size-4" /> },
  { label: "Reports", href: "/app/crm/reports", icon: <BarChart3 className="size-4" /> },
  { label: "CRM Settings", href: "/app/crm/settings", icon: <Settings className="size-4" /> },
];
