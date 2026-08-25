import { LayoutDashboard, Building2, BedDouble, Users, CalendarDays, Receipt, Sparkles, UtensilsCrossed, RadioTower, BarChart3, Settings } from "lucide-react";
import type { ModuleNavItem } from "@/types/module";

export const hotelNavigation: ModuleNavItem[] = [
  { label: "Hotel Overview", shortLabel: "Overview", group: "Overview", href: "/app/hotel", icon: <LayoutDashboard className="size-4" />, description: "See occupancy, in-house guests, open folios, and the housekeeping queue at a glance, with shortcuts into daily workflows." },
  { label: "Reservations", group: "Front desk", href: "/app/hotel/reservations", icon: <CalendarDays className="size-4" />, description: "Book a reservation for a guest against a room type or room, then check guests in and out as dates arrive." },
  { label: "Guests", group: "Front desk", href: "/app/hotel/guests", icon: <Users className="size-4" />, description: "Create guest profiles with contact and identity details and browse the full guest list." },
  { label: "Rooms", group: "Front desk", href: "/app/hotel/rooms", icon: <BedDouble className="size-4" />, description: "Define room types with rates and capacity, add individual rooms to them, and see each room's current status." },
  { label: "Housekeeping", group: "Operations", href: "/app/hotel/housekeeping", icon: <Sparkles className="size-4" />, description: "Create cleaning tasks for rooms, assign them to staff, set priority, and update their status through to completion." },
  { label: "Restaurant", group: "Operations", href: "/app/hotel/restaurant", icon: <UtensilsCrossed className="size-4" />, description: "Set up restaurant outlets and menu items, then open food and beverage orders and charge them to a guest's room folio." },
  { label: "Channels", group: "Operations", href: "/app/hotel/channels", icon: <RadioTower className="size-4" />, description: "Map distribution channels like OTAs to a property and track whether each mapping is active and when it last synced." },
  { label: "Folios & Payments", shortLabel: "Folios", group: "Finance & insights", href: "/app/hotel/folios", icon: <Receipt className="size-4" />, description: "Post charges to a guest's open folio, record payments against it, and see the running balance." },
  { label: "Reports", group: "Finance & insights", href: "/app/hotel/reports", icon: <BarChart3 className="size-4" />, description: "View current occupancy, arrivals, in-house, folio, housekeeping, and restaurant order counts, and export the report." },
  { label: "Properties", group: "Configuration", href: "/app/hotel/properties", icon: <Building2 className="size-4" />, description: "Add hotel properties with code, contact info, timezone, and currency, and see room counts per property." },
  { label: "Hotel Settings", shortLabel: "Settings", group: "Configuration", href: "/app/hotel/settings", icon: <Settings className="size-4" />, description: "Configure per-property check-in and check-out times, tax and service charge rates, document number prefixes, and housekeeping rules." },
];
