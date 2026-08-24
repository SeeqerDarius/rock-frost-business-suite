import Link from "next/link";
import { BedDouble } from "lucide-react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { IconBadge } from "@/components/ui/icon-badge";
import { requireModuleAccess } from "@/lib/auth/module-access";
import { getHostelSummary } from "@/modules/hostel/service";

export async function HostelDashboardWidget({ linkable = true }: { linkable?: boolean } = {}) {
  const tenant = await requireModuleAccess("hostel");
  const summary = await getHostelSummary(tenant.organizationId);

  return (
    <Card>
      <CardHeader>
        <IconBadge size="lg"><BedDouble className="size-5" /></IconBadge>
        <CardTitle className="mt-3">Hostel Management</CardTitle>
        <CardDescription>
          {summary.occupiedBeds}/{summary.totalBeds} beds occupied across {summary.buildingCount} building{summary.buildingCount === 1 ? "" : "s"} ·{" "}
          {summary.activeAllocationCount} active allocation{summary.activeAllocationCount === 1 ? "" : "s"}
        </CardDescription>
      </CardHeader>
      {linkable ? (
        <CardContent>
          <Button size="sm" variant="outline" nativeButton={false} render={<Link href="/app/hostel" />}>
            Open Hostel Management
          </Button>
        </CardContent>
      ) : null}
    </Card>
  );
}
