import { CalendarRange, Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { EntityDialog } from "@/components/forms/entity-dialog";
import { EmptyState } from "@/components/feedback/empty-state";
import { PageHeader } from "@/components/layout/page-header";
import { requireModuleAccess } from "@/lib/auth/module-access";
import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import { listAccountingPeriods } from "@/modules/accounting/service";
import { closePeriodAction, createPeriodAction, reopenPeriodAction } from "./actions";

const ERRORS: Record<string, string> = {
  forbidden: "You do not have permission to manage accounting periods.",
  invalid: "Enter a valid name and date range.",
  overlap: "Accounting periods cannot overlap.",
  state: "The accounting period changed before this request completed. Refresh and try again.",
};

export default async function AccountingPeriodsPage({ searchParams }: { searchParams: Promise<{ saved?: string; error?: string }> }) {
  const { saved, error } = await searchParams;
  const tenant = await requireModuleAccess("accounting");
  const canManage = hasPermission(tenant, PERMISSIONS.ACCOUNTING_PERIODS_MANAGE);
  const periods = await listAccountingPeriods(tenant.organizationId);

  return <div className="space-y-6">
    <div className="flex items-start justify-between gap-4">
      <PageHeader title="Accounting Periods" description="Control when transactions may be posted to the ledger." />
      {canManage ? <EntityDialog trigger={<Button size="sm"><Plus />New period</Button>} title="Create accounting period" action={createPeriodAction}>
        <div className="space-y-2"><Label htmlFor="name">Name</Label><Input id="name" name="name" placeholder="January 2027" required /></div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2"><Label htmlFor="startDate">Start date</Label><Input id="startDate" name="startDate" type="date" required /></div>
          <div className="space-y-2"><Label htmlFor="endDate">End date</Label><Input id="endDate" name="endDate" type="date" required /></div>
        </div>
      </EntityDialog> : null}
    </div>
    {saved ? <div className="rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-700">Saved.</div> : null}
    {error && ERRORS[error] ? <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">{ERRORS[error]}</div> : null}
    {periods.length === 0 ? <EmptyState icon={CalendarRange} title="No accounting periods" description="Create periods before introducing month-end and year-end controls." /> : <div className="space-y-3">
      {periods.map((period) => <div key={period.id} className="flex flex-wrap items-center justify-between gap-4 rounded-lg border p-4">
        <div><div className="flex items-center gap-2"><p className="font-medium">{period.name}</p><Badge variant="outline">{period.status}</Badge></div><p className="text-sm text-muted-foreground">{period.startDate.toLocaleDateString()} to {period.endDate.toLocaleDateString()}</p></div>
        {canManage ? <form action={period.status === "OPEN" ? closePeriodAction : reopenPeriodAction}><input type="hidden" name="id" value={period.id} /><Button type="submit" size="sm" variant={period.status === "OPEN" ? "destructive" : "outline"}>{period.status === "OPEN" ? "Close period" : "Reopen period"}</Button></form> : null}
      </div>)}
    </div>}
  </div>;
}
