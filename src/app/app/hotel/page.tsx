import { BedDouble, CalendarDays, Receipt, Sparkles, UtensilsCrossed } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { OverviewMetricCard } from "@/components/dashboard/overview-metric-card";
import { WorkflowLinks } from "@/components/dashboard/workflow-links";
import { requireModuleAccess } from "@/lib/auth/module-access";
import { getHotelSummary } from "@/modules/hotel/service";

export default async function HotelOverviewPage() {
  const tenant = await requireModuleAccess("hotel");
  const summary = await getHotelSummary(tenant.organizationId);
  const stats = [
    { label: "Occupied rooms", value: `${summary.occupiedRooms}/${summary.totalRooms}`, description: "Current room utilization", icon: <BedDouble className="size-4" />, href: "/app/hotel/rooms" },
    { label: "In-house guests", value: summary.inHouse, description: "Active checked-in stays", icon: <CalendarDays className="size-4" />, href: "/app/hotel/reservations" },
    { label: "Open folios", value: summary.openFolios, description: "Guest accounts awaiting settlement", icon: <Receipt className="size-4" />, href: "/app/hotel/folios" },
    { label: "Housekeeping queue", value: summary.housekeeping, description: "Rooms requiring attention", icon: <Sparkles className="size-4" />, href: "/app/hotel/housekeeping" },
  ];
  const workflows = [
    { title: "Manage reservations", description: "Review bookings, arrivals, departures, and stay status.", href: "/app/hotel/reservations", icon: <CalendarDays /> },
    { title: "Run housekeeping", description: "Coordinate room readiness and operational assignments.", href: "/app/hotel/housekeeping", icon: <Sparkles /> },
    { title: "Restaurant & channels", description: "Post restaurant orders and maintain distribution mappings.", href: "/app/hotel/restaurant", icon: <UtensilsCrossed /> },
  ];
  return (
    <div className="mx-auto max-w-screen-2xl space-y-6">
      <PageHeader title="Hotel Overview" description="Occupancy, guest stays, settlement, and room readiness at a glance." />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{stats.map((stat) => <OverviewMetricCard key={stat.label} {...stat} />)}</div>
      <WorkflowLinks title="Daily operations" description="Move directly into the workflows your front desk and operations teams use most." items={workflows} />
    </div>
  );
}
