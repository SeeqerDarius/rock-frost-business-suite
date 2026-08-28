import { notFound } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PageHeader } from "@/components/layout/page-header";
import { db } from "@/lib/db";
import { requireModuleAccess } from "@/lib/auth/module-access";
import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import { getAccountingPlan, getAccountingPlanVariance } from "@/modules/accounting/planning-service";
import {
  approvePlanAction, archivePlanAction, deletePlanLineAction, lockPlanAction, rejectPlanAction, revisePlanAction, submitPlanAction, upsertPlanLineAction,
} from "../actions";

const ERRORS: Record<string, string> = { invalid: "Check the account, month, dimension, and amount.", state: "The plan changed or the action is not allowed. Refresh and try again.", forbidden: "You do not have permission for this action." };

function money(value: { toNumber(): number }, currency: string) {
  return new Intl.NumberFormat("en", { style: "currency", currency, maximumFractionDigits: 2 }).format(value.toNumber());
}

export default async function AccountingPlanPage({ params, searchParams }: { params: Promise<{ planId: string }>; searchParams: Promise<{ saved?: string; error?: string }> }) {
  const [{ planId }, { saved, error }] = await Promise.all([params, searchParams]);
  const tenant = await requireModuleAccess("accounting");
  const canView = hasPermission(tenant, PERMISSIONS.ACCOUNTING_PLANS_VIEW);
  const canManage = hasPermission(tenant, PERMISSIONS.ACCOUNTING_PLANS_MANAGE);
  const canApprove = hasPermission(tenant, PERMISSIONS.ACCOUNTING_PLANS_APPROVE);
  if (!canView && !canManage) notFound();
  const [plan, variance, accounts, branches, rawActiveModules] = await Promise.all([
    getAccountingPlan(tenant.organizationId, planId),
    getAccountingPlanVariance(tenant.organizationId, planId),
    db.accountingAccount.findMany({ where: { organizationId: tenant.organizationId, active: true }, orderBy: { code: "asc" } }),
    db.branch.findMany({ where: { organizationId: tenant.organizationId, status: "ACTIVE" }, orderBy: { name: "asc" } }),
    db.organizationModule.findMany({ where: { organizationId: tenant.organizationId, enabled: true }, include: { module: true }, orderBy: { module: { name: "asc" } } }),
  ]);
  const activeModules = rawActiveModules.map(({ module }) => ({ module: { ...module, key: module.code } }));
  if (!plan) notFound();
  const totalPlan = plan.lines.reduce((sum, line) => sum + line.amount.toNumber(), 0);
  const totalActual = variance.reduce((sum, row) => sum + row.actual.toNumber(), 0);
  return <div className="space-y-6">
    <div className="flex flex-wrap items-start justify-between gap-4"><PageHeader title={`${plan.name} · Revision ${plan.revision}`} description={`${plan.kind} in ${plan.currencyCode}. ${plan.startDate.toLocaleDateString()} to ${plan.endDate.toLocaleDateString()}.`} /><div className="flex gap-2"><Badge variant="outline">{plan.kind}</Badge><Badge variant="outline">{plan.status}</Badge></div></div>
    {saved ? <div className="rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-700">Saved.</div> : null}
    {error && ERRORS[error] ? <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">{ERRORS[error]}</div> : null}
    <div className="grid gap-4 sm:grid-cols-3"><div className="rounded-xl border p-4"><p className="text-sm text-muted-foreground">Planned</p><p className="text-2xl font-semibold">{new Intl.NumberFormat("en", { style: "currency", currency: plan.currencyCode }).format(totalPlan)}</p></div><div className="rounded-xl border p-4"><p className="text-sm text-muted-foreground">Posted actual</p><p className="text-2xl font-semibold">{new Intl.NumberFormat("en", { style: "currency", currency: plan.currencyCode }).format(totalActual)}</p></div><div className="rounded-xl border p-4"><p className="text-sm text-muted-foreground">Plan lines</p><p className="text-2xl font-semibold">{plan.lines.length}</p></div></div>
    <div className="flex flex-wrap gap-2">
      {canManage && (plan.status === "DRAFT" || plan.status === "REJECTED") ? <form action={submitPlanAction}><input type="hidden" name="planId" value={plan.id} /><Button size="sm">Submit for approval</Button></form> : null}
      {canApprove && plan.status === "SUBMITTED" ? <form action={approvePlanAction}><input type="hidden" name="planId" value={plan.id} /><Button size="sm">Approve</Button></form> : null}
      {canApprove && plan.status === "SUBMITTED" ? <form action={rejectPlanAction} className="flex gap-2"><input type="hidden" name="planId" value={plan.id} /><Input name="reason" placeholder="Rejection reason" required className="h-9" /><Button size="sm" variant="destructive">Reject</Button></form> : null}
      {canApprove && plan.status === "APPROVED" ? <form action={lockPlanAction}><input type="hidden" name="planId" value={plan.id} /><Button size="sm" variant="outline">Lock plan</Button></form> : null}
      {canManage && ["APPROVED", "LOCKED", "REJECTED"].includes(plan.status) ? <form action={revisePlanAction}><input type="hidden" name="planId" value={plan.id} /><Button size="sm" variant="outline">Create revision</Button></form> : null}
      {canManage && ["APPROVED", "LOCKED", "REJECTED"].includes(plan.status) ? <form action={archivePlanAction}><input type="hidden" name="planId" value={plan.id} /><Button size="sm" variant="ghost">Archive</Button></form> : null}
    </div>
    {canManage && plan.status === "DRAFT" ? <section className="rounded-xl border p-5"><h2 className="font-semibold">Add or update a monthly plan line</h2><p className="mt-1 text-sm text-muted-foreground">The same account, month, branch and module combination updates one line instead of creating a duplicate.</p><form action={upsertPlanLineAction} className="mt-4 grid gap-4 md:grid-cols-3"><input type="hidden" name="planId" value={plan.id} /><div className="space-y-2"><Label htmlFor="accountId">Account</Label><select id="accountId" name="accountId" className="h-10 w-full rounded-md border bg-background px-3" required>{accounts.map((account) => <option key={account.id} value={account.id}>{account.code} · {account.name}</option>)}</select></div><div className="space-y-2"><Label htmlFor="periodStart">Month</Label><Input id="periodStart" name="periodStart" type="month" required /></div><div className="space-y-2"><Label htmlFor="amount">Amount</Label><Input id="amount" name="amount" inputMode="decimal" placeholder="0.00" required /></div><div className="space-y-2"><Label htmlFor="branchId">Branch (optional)</Label><select id="branchId" name="branchId" className="h-10 w-full rounded-md border bg-background px-3"><option value="">All branches</option>{branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}</select></div><div className="space-y-2"><Label htmlFor="sourceModule">Source module (optional)</Label><select id="sourceModule" name="sourceModule" className="h-10 w-full rounded-md border bg-background px-3"><option value="">All modules</option>{activeModules.map(({ module }) => <option key={module.key} value={module.key}>{module.name}</option>)}</select></div><div className="space-y-2"><Label htmlFor="notes">Notes</Label><Input id="notes" name="notes" /></div><Button type="submit" className="md:col-span-3">Save plan line</Button></form></section> : null}
    <section className="overflow-hidden rounded-xl border"><div className="border-b p-5"><h2 className="font-semibold">Actual versus plan</h2><p className="text-sm text-muted-foreground">Actuals come from posted ledger entries, including transactions posted by activated modules.</p></div>{variance.length === 0 ? <p className="p-5 text-sm text-muted-foreground">No plan lines yet.</p> : <div className="overflow-x-auto"><table className="w-full text-sm"><thead className="bg-muted/40 text-left"><tr><th className="p-3">Month</th><th className="p-3">Account</th><th className="p-3">Scope</th><th className="p-3 text-right">Plan</th><th className="p-3 text-right">Actual</th><th className="p-3 text-right">Variance</th><th className="p-3">Result</th>{canManage && plan.status === "DRAFT" ? <th className="p-3" /> : null}</tr></thead><tbody>{variance.map(({ line, actual, variance: difference, favorable }) => <tr key={line.id} className="border-t"><td className="p-3">{line.periodStart.toLocaleDateString(undefined, { month: "short", year: "numeric" })}</td><td className="p-3">{line.account.code} · {line.account.name}</td><td className="p-3 text-muted-foreground">{line.branchId ? "Selected branch" : "All branches"} · {line.sourceModule ?? "All modules"}</td><td className="p-3 text-right">{money(line.amount, plan.currencyCode)}</td><td className="p-3 text-right">{money(actual, plan.currencyCode)}</td><td className="p-3 text-right">{money(difference, plan.currencyCode)}</td><td className="p-3">{favorable === null ? "Neutral" : favorable ? "Favorable" : "Unfavorable"}</td>{canManage && plan.status === "DRAFT" ? <td className="p-3"><form action={deletePlanLineAction}><input type="hidden" name="planId" value={plan.id} /><input type="hidden" name="lineId" value={line.id} /><Button size="sm" variant="ghost">Remove</Button></form></td> : null}</tr>)}</tbody></table></div>}</section>
    <section className="rounded-xl border p-5"><h2 className="font-semibold">Workflow history</h2><div className="mt-3 space-y-2">{plan.decisions.map((decision) => <div key={decision.id} className="flex flex-wrap justify-between gap-2 border-t py-2 text-sm"><span>{decision.action.replaceAll("_", " ")} · {decision.fromStatus ? `${decision.fromStatus} to ` : ""}{decision.toStatus}</span><span className="text-muted-foreground">{decision.actor?.name || decision.actor?.email || "System"} · {decision.createdAt.toLocaleString()}</span>{decision.reason ? <p className="w-full text-muted-foreground">{decision.reason}</p> : null}</div>)}</div></section>
  </div>;
}
