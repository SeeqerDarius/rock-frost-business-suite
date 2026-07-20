import Link from "next/link";
import { UsersRound } from "lucide-react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { requireCurrentTenant } from "@/lib/tenant";
import { getHrSummary } from "@/modules/hr/service";

export async function HrDashboardWidget() {
  const tenant = await requireCurrentTenant();
  const summary = await getHrSummary(tenant.organizationId);

  return (
    <Card>
      <CardHeader>
        <UsersRound className="size-6 text-muted-foreground" />
        <CardTitle className="mt-3">Human Resources</CardTitle>
        <CardDescription>
          {summary.activeEmployeeCount} active employee{summary.activeEmployeeCount === 1 ? "" : "s"} · {summary.onboardingCount} onboarding · {summary.pendingLeaveCount} pending leave request{summary.pendingLeaveCount === 1 ? "" : "s"}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Button size="sm" variant="outline" nativeButton={false} render={<Link href="/app/hr" />}>
          Open HR
        </Button>
      </CardContent>
    </Card>
  );
}
