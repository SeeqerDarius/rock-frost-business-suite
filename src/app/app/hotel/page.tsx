import Link from "next/link";
import { BedDouble, CalendarDays, Receipt, Sparkles } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { requireModuleAccess } from "@/lib/auth/module-access";
import { getHotelSummary } from "@/modules/hotel/service";

export default async function HotelOverviewPage() {
  const tenant = await requireModuleAccess("hotel");
  const summary = await getHotelSummary(tenant.organizationId);
  const stats = [
    { label: "Occupied rooms", value: `${summary.occupiedRooms}/${summary.totalRooms}`, icon: BedDouble, href: "/app/hotel/rooms" },
    { label: "In-house guests", value: summary.inHouse, icon: CalendarDays, href: "/app/hotel/reservations" },
    { label: "Open folios", value: summary.openFolios, icon: Receipt, href: "/app/hotel/folios" },
    { label: "Housekeeping queue", value: summary.housekeeping, icon: Sparkles, href: "/app/hotel/housekeeping" },
  ];
  return <div className="space-y-6"><PageHeader title="Hotel Overview" description="Occupancy, guest stays, settlement, and room readiness at a glance." /><div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{stats.map((stat) => <Card key={stat.label}><CardHeader><div className="flex items-center justify-between"><CardDescription>{stat.label}</CardDescription><stat.icon className="size-4 text-muted-foreground" /></div><CardTitle className="text-3xl">{stat.value}</CardTitle></CardHeader><CardContent><Button size="sm" variant="outline" nativeButton={false} render={<Link href={stat.href as never} />}>View</Button></CardContent></Card>)}</div></div>;
}
