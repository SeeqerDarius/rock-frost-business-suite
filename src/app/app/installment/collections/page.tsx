import { CalendarClock } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { requireCurrentTenant } from "@/lib/tenant";
import { getActivityReport } from "@/modules/installment/service";

const WEEKDAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export default async function InstallmentCollectionsPage() {
  const tenant = await requireCurrentTenant();
  const days = await getActivityReport(tenant.organizationId);

  const weekExpected = days.reduce((sum, d) => sum + d.expectedAmount, 0);
  const weekActual = days.reduce((sum, d) => sum + d.actualAmount, 0);

  return (
    <div className="space-y-6">
      <PageHeader title="Collections" description="Expected vs. actual collections for the current week." />

      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader>
            <CardDescription>Expected this week</CardDescription>
            <CardTitle className="text-3xl">{weekExpected.toFixed(2)}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>Collected this week</CardDescription>
            <CardTitle className="text-3xl">{weekActual.toFixed(2)}</CardTitle>
          </CardHeader>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <CalendarClock className="size-5 text-muted-foreground" />
            <CardTitle>Daily breakdown</CardTitle>
          </div>
          <CardDescription>Monday through Sunday, expected daily amounts for active accounts vs. what was actually collected.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {days.map((day, index) => {
            const met = day.actualAmount >= day.expectedAmount && day.expectedAmount > 0;
            return (
              <div key={day.date.toISOString()} className="flex items-center justify-between rounded-lg border p-3">
                <div>
                  <p className="text-sm font-medium">
                    {WEEKDAY_LABELS[index]} · {day.date.toLocaleDateString()}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Expected {day.expectedAmount.toFixed(2)} · Collected {day.actualAmount.toFixed(2)}
                  </p>
                </div>
                {day.expectedAmount > 0 ? <Badge variant={met ? "default" : "outline"}>{met ? "Met" : "Behind"}</Badge> : null}
              </div>
            );
          })}
        </CardContent>
      </Card>
    </div>
  );
}
