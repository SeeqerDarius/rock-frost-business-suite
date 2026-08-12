import Link from "next/link";
import { Building2 } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { IconBadge } from "@/components/ui/icon-badge";
import { requireModuleAccess } from "@/lib/auth/module-access";
import { getHotelSummary } from "@/modules/hotel/service";

export async function HotelDashboardWidget() {
  const tenant = await requireModuleAccess("hotel");
  const summary = await getHotelSummary(tenant.organizationId);
  return <Card><CardHeader><IconBadge size="lg"><Building2 className="size-5" /></IconBadge><CardTitle className="mt-3">Hotel Management</CardTitle><CardDescription>{summary.occupiedRooms} occupied of {summary.totalRooms} rooms · {summary.inHouse} in house · {summary.housekeeping} housekeeping tasks</CardDescription></CardHeader><CardContent><Button size="sm" variant="outline" nativeButton={false} render={<Link href="/app/hotel" />}>Open Hotel</Button></CardContent></Card>;
}
