import Link from "next/link";
import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requirePlatformOperator } from "@/lib/auth/module-access";
import { getTrialAndChurnReport } from "@/platform/trials/reporting";

const STATUS_LABELS = { TRIAL: "Trial", ACTIVE: "Active", SUSPENDED: "Suspended", CANCELLED: "Cancelled" } as const;

export default async function PlatformTrialsPage() {
  await requirePlatformOperator();
  const report = await getTrialAndChurnReport();
  const conversionTotal = report.convertedCount + report.expiredCount;
  const conversionRate = conversionTotal > 0 ? Math.round((report.convertedCount / conversionTotal) * 100) : null;

  return (
    <div className="space-y-6">
      <PageHeader title="Trials" description="Trial conversion and churn, reconstructed from organization status history - no separate tracking, no guessed figures." />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {(Object.keys(STATUS_LABELS) as (keyof typeof STATUS_LABELS)[]).map((status) => (
          <Card key={status}>
            <CardContent className="pt-6 text-center">
              <p className="text-2xl font-semibold">{report.organizationsByStatus[status] ?? 0}</p>
              <p className="text-xs text-muted-foreground">{STATUS_LABELS[status]}</p>
            </CardContent>
          </Card>
        ))}
        <Card>
          <CardContent className="pt-6 text-center">
            <p className="text-2xl font-semibold">{conversionRate === null ? "-" : `${conversionRate}%`}</p>
            <p className="text-xs text-muted-foreground">Converted to Active{conversionTotal > 0 ? ` (${report.convertedCount} of ${conversionTotal} decided trials)` : ""}</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle>Trials at risk</CardTitle><CardDescription>Every organization currently on trial, soonest expiry first.</CardDescription></CardHeader>
        <CardContent className="space-y-2">
          {report.atRiskTrials.length === 0 ? <p className="text-sm text-muted-foreground">No organizations are currently on trial.</p> : report.atRiskTrials.map((trial) => (
            <div key={trial.organizationId} className="flex flex-wrap items-center justify-between gap-3 rounded-md border p-3">
              <div>
                <Link href={`/app/platform/organizations/${trial.organizationId}`} className="text-sm font-medium hover:underline">{trial.name}</Link>
                <p className="text-xs text-muted-foreground">{trial.tenantCode} · started {trial.createdAt.toLocaleDateString()} · ends {trial.trialEndsAt.toLocaleDateString()}</p>
              </div>
              <Badge variant={trial.daysRemaining <= 3 ? "destructive" : "outline"}>{trial.daysRemaining} day{trial.daysRemaining === 1 ? "" : "s"} left</Badge>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Recent status changes</CardTitle><CardDescription>The last {report.recentEvents.length} organization status transitions, manual or automatic.</CardDescription></CardHeader>
        <CardContent className="space-y-2">
          {report.recentEvents.length === 0 ? <p className="text-sm text-muted-foreground">No status changes recorded yet.</p> : report.recentEvents.map((event) => (
            <div key={event.id} className="flex flex-wrap items-center justify-between gap-3 rounded-md border p-3">
              <div>
                <Link href={`/app/platform/organizations/${event.organizationId}`} className="text-sm font-medium hover:underline">{event.organizationName}</Link>
                <p className="text-xs text-muted-foreground">{event.createdAt.toLocaleString()}</p>
              </div>
              <p className="text-sm">{event.from ?? "?"} <span className="text-muted-foreground">to</span> {event.to}</p>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
