import { AnimatedSettingsIcon } from "@/components/icons/animated-settings-icon";
import { LayoutGrid, Users, Target, Handshake, History, BarChart3 } from "lucide-react";
import type { ModuleNavItem } from "@/types/module";

export const crmNavigation: ModuleNavItem[] = [
  { label: "CRM Overview", href: "/app/crm", icon: <LayoutGrid className="size-4" />, description: "See at-a-glance counts of contacts, open leads, open deals, and this month's activity." },
  { label: "Contacts", href: "/app/crm/contacts", icon: <Users className="size-4" />, description: "Add and manage people and companies, their contact details, notes, and assigned owner." },
  { label: "Leads", href: "/app/crm/leads", icon: <Target className="size-4" />, description: "Track prospective customers by source and status, and convert qualified leads into deals." },
  { label: "Deals", href: "/app/crm/deals", icon: <Handshake className="size-4" />, description: "Manage deals through pipeline stages from new to won or lost, with value and expected close date." },
  { label: "Activities", href: "/app/crm/activities", icon: <History className="size-4" />, description: "Log calls, emails, meetings, notes, and tasks against contacts, leads, and deals." },
  { label: "Reports", href: "/app/crm/reports", icon: <BarChart3 className="size-4" />, description: "Review pipeline value, win rate, and contact, lead, and deal activity summaries." },
  { label: "Team", href: "/app/crm/staff", icon: <Users className="size-4" />, description: "Invite CRM staff, assign their role, and manage access." },
  { label: "CRM Settings", href: "/app/crm/settings", icon: <AnimatedSettingsIcon size={16} />, description: "Set the default owner automatically assigned to new leads and deals, and manage lead sources." },
];
