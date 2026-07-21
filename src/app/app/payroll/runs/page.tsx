import { PlayCircle, Plus } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/feedback/empty-state";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { EntityDialog } from "@/components/forms/entity-dialog";
import { requireCurrentTenant } from "@/lib/tenant";
import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import { listRuns } from "@/modules/payroll/service";
import { createNewRun, processExistingRun, cancelExistingRun } from "./actions";

const ERROR_MESSAGES: Record<string, string> = {
  forbidden: "You don't have permission to manage payroll runs.",
  "missing-fields": "Period start, period end, and pay date are required.",
  "invalid-state": "That action isn't valid for this run's current status.",
  "no-compensation": "No active employees have compensation set up yet. Add compensation before processing.",
  "not-found": "That payroll run could not be found.",
};

const STATUS_BADGE: Record<string, "default" | "outline" | "destructive" | "secondary"> = {
  DRAFT: "outline",
  PROCESSING: "secondary",
  COMPLETED: "default",
  CANCELLED: "destructive",
};

export default async function PayrollRunsPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string; error?: string }>;
}) {
  const { saved, error } = await searchParams;
  const tenant = await requireCurrentTenant();
  const canManage = hasPermission(tenant, PERMISSIONS.PAYROLL_RUNS_MANAGE);
  const runs = await listRuns(tenant.organizationId);
  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <PageHeader title="Runs" description="Payroll runs: each processes every active employee with compensation on record." />
        {canManage ? (
          <EntityDialog trigger={<Button size="sm"><Plus />New run</Button>} title="New payroll run" action={createNewRun}>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="periodStart">Period start</Label>
                <Input id="periodStart" name="periodStart" type="date" required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="periodEnd">Period end</Label>
                <Input id="periodEnd" name="periodEnd" type="date" required />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="payDate">Pay date</Label>
              <Input id="payDate" name="payDate" type="date" defaultValue={today} required />
            </div>
          </EntityDialog>
        ) : null}
      </div>

      {saved ? (
        <div className="rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-600 dark:text-emerald-400">
          Saved.
        </div>
      ) : null}
      {error && ERROR_MESSAGES[error] ? (
        <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {ERROR_MESSAGES[error]}
        </div>
      ) : null}

      {runs.length === 0 ? (
        <EmptyState icon={PlayCircle} title="No payroll runs yet" description="Runs you create will appear here." />
      ) : (
        <div className="space-y-3">
          {runs.map((run) => {
            const totalNet = run.payslips.reduce((sum, p) => sum + Number(p.netPay), 0);
            return (
              <div key={run.id} className="flex items-center justify-between gap-4 rounded-lg border p-3">
                <div>
                  <p className="text-sm font-medium">
                    {run.periodStart.toLocaleDateString()} – {run.periodEnd.toLocaleDateString()}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Pay date {run.payDate.toLocaleDateString()}
                    {run.payslips.length > 0 ? ` · ${run.payslips.length} payslip${run.payslips.length === 1 ? "" : "s"} · ${totalNet.toFixed(2)} net` : ""}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant={STATUS_BADGE[run.status]}>{run.status}</Badge>
                  {canManage && run.status === "DRAFT" ? (
                    <>
                      <form action={processExistingRun}>
                        <input type="hidden" name="id" value={run.id} />
                        <Button type="submit" size="sm" variant="ghost">Process</Button>
                      </form>
                      <form action={cancelExistingRun}>
                        <input type="hidden" name="id" value={run.id} />
                        <Button type="submit" size="sm" variant="ghost">Cancel</Button>
                      </form>
                    </>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
