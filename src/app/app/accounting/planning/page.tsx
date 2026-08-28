import Link from "next/link";
import { ChartNoAxesCombined, Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { EntityDialog } from "@/components/forms/entity-dialog";
import { EmptyState } from "@/components/feedback/empty-state";
import { PageHeader } from "@/components/layout/page-header";
import { requireModuleAccess } from "@/lib/auth/module-access";
import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import { listAccountingPlans } from "@/modules/accounting/planning-service";
import { createPlanAction } from "./actions";

const ERRORS: Record<string, string> = { forbidden: "You do not have permission to manage plans.", invalid: "Check the plan name, dates, and forecast cutoff." };

export default async function AccountingPlanningPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  const tenant = await requireModuleAccess("accounting");
  const canView = hasPermission(tenant, PERMISSIONS.ACCOUNTING_PLANS_VIEW);
  const canManage = hasPermission(tenant, PERMISSIONS.ACCOUNTING_PLANS_MANAGE);
  if (!canView && !canManage) return <EmptyState icon={ChartNoAxesCombined} title="Planning access required" description="Ask an administrator for Accounting planning access." />;
  const plans = await listAccountingPlans(tenant.organizationId);
  return <div className="space-y-6">
    <div className="flex flex-wrap items-start justify-between gap-4">
      <PageHeader title="Budgets and Forecasts" description="Create controlled financial plans and compare them with posted results from activated modules." />
      {canManage ? <EntityDialog trigger={<Button size="sm"><Plus />New plan</Button>} title="Create financial plan" action={createPlanAction}>
        <div className="space-y-2"><Label htmlFor="name">Plan name</Label><Input id="name" name="name" placeholder="2027 Operating Plan" required /></div>
        <div className="space-y-2"><Label htmlFor="kind">Plan type</Label><select id="kind" name="kind" className="h-10 w-full rounded-md border bg-background px-3"><option value="BUDGET">Budget</option><option value="FORECAST">Forecast</option></select></div>
        <div className="grid gap-4 sm:grid-cols-2"><div className="space-y-2"><Label htmlFor="startDate">Start date</Label><Input id="startDate" name="startDate" type="date" required /></div><div className="space-y-2"><Label htmlFor="endDate">End date</Label><Input id="endDate" name="endDate" type="date" required /></div></div>
        <div className="space-y-2"><Label htmlFor="actualThroughDate">Actuals through (forecasts only)</Label><Input id="actualThroughDate" name="actualThroughDate" type="date" /></div>
        <div className="space-y-2"><Label htmlFor="notes">Assumptions and notes</Label><textarea id="notes" name="notes" className="min-h-24 w-full rounded-md border bg-background px-3 py-2 text-sm" /></div>
      </EntityDialog> : null}
    </div>
    {error && ERRORS[error] ? <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">{ERRORS[error]}</div> : null}
    {plans.length === 0 ? <EmptyState icon={ChartNoAxesCombined} title="No financial plans" description="Create a budget or rolling forecast to begin measuring performance against the ledger." /> : <div className="grid gap-4 lg:grid-cols-2">
      {plans.map((plan) => <Link key={plan.id} href={`/app/accounting/planning/${plan.id}`} className="rounded-xl border bg-card p-5 transition-colors hover:bg-muted/30">
        <div className="flex items-start justify-between gap-4"><div><p className="font-semibold">{plan.name}</p><p className="text-sm text-muted-foreground">Revision {plan.revision} · {plan.startDate.toLocaleDateString()} to {plan.endDate.toLocaleDateString()}</p></div><div className="flex gap-2"><Badge variant="outline">{plan.kind}</Badge><Badge variant="outline">{plan.status}</Badge></div></div>
        <p className="mt-4 text-sm text-muted-foreground">{plan._count.lines} plan lines · {plan.currencyCode}</p>
      </Link>)}
    </div>}
  </div>;
}
