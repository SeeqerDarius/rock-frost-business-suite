import { LayoutDashboard, Building2, BedDouble, Users, CalendarDays, Receipt, Sparkles, UtensilsCrossed, RadioTower, BarChart3, Settings } from "lucide-react";
import type { ModuleNavItem } from "@/types/module";

export const hotelNavigation: ModuleNavItem[] = [
  { label: "Hotel Overview", shortLabel: "Overview", group: "Overview", href: "/app/hotel", icon: <LayoutDashboard className="size-4" /> },
  { label: "Reservations", group: "Front desk", href: "/app/hotel/reservations", icon: <CalendarDays className="size-4" /> },
  { label: "Guests", group: "Front desk", href: "/app/hotel/guests", icon: <Users className="size-4" /> },
  { label: "Rooms", group: "Front desk", href: "/app/hotel/rooms", icon: <BedDouble className="size-4" /> },
  { label: "Housekeeping", group: "Operations", href: "/app/hotel/housekeeping", icon: <Sparkles className="size-4" /> },
  { label: "Restaurant", group: "Operations", href: "/app/hotel/restaurant", icon: <UtensilsCrossed className="size-4" /> },
  { label: "Channels", group: "Operations", href: "/app/hotel/channels", icon: <RadioTower className="size-4" /> },
  { label: "Folios & Payments", shortLabel: "Folios", group: "Finance & insights", href: "/app/hotel/folios", icon: <Receipt className="size-4" /> },
  { label: "Reports", group: "Finance & insights", href: "/app/hotel/reports", icon: <BarChart3 className="size-4" /> },
  { label: "Properties", group: "Configuration", href: "/app/hotel/properties", icon: <Building2 className="size-4" /> },
  { label: "Hotel Settings", shortLabel: "Settings", group: "Configuration", href: "/app/hotel/settings", icon: <Settings className="size-4" /> },
];
