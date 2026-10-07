import Link from "next/link";
import { CalendarClock, FilePen, FileSignature, Lock, Plus, RefreshCcw, ShieldAlert } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/feedback/empty-state";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireModuleAccess } from "@/lib/auth/module-access";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { createOrganizationFormatter } from "@/lib/org-format";
import { actorFromTenant, getContractDashboard } from "@/modules/contracts/service";
import { humanize } from "./_components/shared";

export const metadata = { title: "Contracts" };

function Stat({ label, value, href, icon, tone }: { label: string; value: number | string; href?: string; icon: React.ReactNode; tone?: string }) {
  const inner = (
    <Card className="h-full transition-colors hover:border-primary/40">
      <CardContent className="flex items-start justify-between gap-3 pt-6">
        <div><p className="text-sm text-muted-foreground">{label}</p><p className={`mt-1 text-3xl font-semibold tabular-nums ${tone ?? ""}`}>{value}</p></div>
        <span className="text-muted-foreground">{icon}</span>
      </CardContent>
    </Card>
  );
  return href ? <Link href={href} className="block">{inner}</Link> : inner;
}

function BarList({ rows, format }: { rows: { label: string; value: number }[]; format?: (value: number) => string }) {
  const max = Math.max(...rows.map((row) => row.value), 1);
  if (!rows.length) return <p className="text-sm text-muted-foreground">No data yet.</p>;
  return (
    <ul className="space-y-2">
      {rows.map((row) => (
        <li key={row.label} className="space-y-1">
          <div className="flex justify-between gap-3 text-sm"><span className="truncate">{row.label}</span><span className="tabular-nums text-muted-foreground">{format ? format(row.value) : row.value}</span></div>
          <div className="h-2 rounded-full bg-muted"><div className="h-2 rounded-full bg-primary" style={{ width: `${Math.max((row.value / max) * 100, 2)}%` }} /></div>
        </li>
      ))}
    </ul>
  );
}

export default async function ContractsDashboardPage() {
  const tenant = await requireModuleAccess("contracts");
  const actor = actorFromTenant(tenant);
  if (!actor.permissions.includes(PERMISSIONS.CONTRACTS_VIEW)) {
    return <EmptyState icon={Lock} title="You don't have access to contracts" description="Ask an administrator for a Contract Management role." />;
  }
  const summary = await getContractDashboard(actor);
  const format = createOrganizationFormatter(tenant.organization);
  const canCreate = actor.permissions.includes(PERMISSIONS.CONTRACTS_CREATE);
  const count = (status: string) => summary.byStatus[status] ?? 0;
  const entries = (record: Record<string, number>) => Object.entries(record).map(([label, value]) => ({ label: humanize(label), value })).sort((a, b) => b.value - a.value);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <PageHeader title="Contracts" description="Every contract you can access, what is expiring, and what needs a decision. Figures come from your contract records." />
        {canCreate ? <Button nativeButton={false} render={<Link href="/app/contracts/new" />}><Plus />New contract</Button> : null}
      </div>

      {summary.total === 0 ? (
        <EmptyState icon={FileSignature} title="No contracts yet" description="Create your first contract, or set up numbering, categories, templates, and clauses in Settings first." />
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Total contracts" value={summary.total} href="/app/contracts/list" icon={<FileSignature className="size-5" />} />
        <Stat label="Active" value={count("ACTIVE")} href="/app/contracts/list/active" icon={<FileSignature className="size-5" />} />
        <Stat label="Drafts" value={count("DRAFT")} href="/app/contracts/list/drafts" icon={<FilePen className="size-5" />} />
        <Stat label="Pending approval" value={count("PENDING_APPROVAL")} icon={<ShieldAlert className="size-5" />} />
        <Stat label="Expiring in 30 days" value={summary.expiring30} href="/app/contracts/list/expiring" icon={<CalendarClock className="size-5" />} tone={summary.expiring30 ? "text-amber-600 dark:text-amber-400" : ""} />
        <Stat label="Expiring in 60 days" value={summary.expiring60} href="/app/contracts/list/expiring" icon={<CalendarClock className="size-5" />} />
        <Stat label="Expiring in 90 days" value={summary.expiring90} href="/app/contracts/list/expiring" icon={<CalendarClock className="size-5" />} />
        <Stat label="Past expiry, still active" value={summary.expiredStillActive} href="/app/contracts/list/expired" icon={<CalendarClock className="size-5" />} tone={summary.expiredStillActive ? "text-destructive" : ""} />
        <Stat label="Auto-renewals in 90 days" value={summary.autoRenewalsUpcoming} icon={<RefreshCcw className="size-5" />} />
        <Stat label="Renewal decisions due" value={summary.renewalsRequiringDecision} icon={<RefreshCcw className="size-5" />} tone={summary.renewalsRequiringDecision ? "text-amber-600 dark:text-amber-400" : ""} />
        <Stat label="Expired" value={count("EXPIRED")} href="/app/contracts/list/expired" icon={<CalendarClock className="size-5" />} />
        <Stat label="Terminated" value={count("TERMINATED")} href="/app/contracts/list/terminated" icon={<FileSignature className="size-5" />} />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader><CardTitle>Expiry trend</CardTitle><CardDescription>Active contracts expiring in each of the next 12 months.</CardDescription></CardHeader>
          <CardContent>
            <div className="flex h-40 items-end gap-2" role="img" aria-label="Active contracts expiring per month for the next 12 months">
              {summary.expiryTrend.map((point) => {
                const max = Math.max(...summary.expiryTrend.map((p) => p.count), 1);
                return (
                  <div key={point.month} className="flex flex-1 flex-col items-center gap-1">
                    <span className="text-xs tabular-nums text-muted-foreground">{point.count || ""}</span>
                    <div className="w-full rounded-t bg-primary/80" style={{ height: `${(point.count / max) * 100}%`, minHeight: point.count ? 4 : 1 }} />
                    <span className="text-[10px] text-muted-foreground">{point.month.slice(5)}</span>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Contracts by risk</CardTitle><CardDescription>Your organization&apos;s own risk classification.</CardDescription></CardHeader>
          <CardContent><BarList rows={entries(summary.byRisk)} /></CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader><CardTitle>Active value by currency</CardTitle><CardDescription>{summary.activeValueByCurrency ? "Totals per contract currency; currencies are never added together." : "Hidden for your role."}</CardDescription></CardHeader>
          <CardContent>
            {summary.activeValueByCurrency ? (
              summary.activeValueByCurrency.length ? <ul className="space-y-2">{summary.activeValueByCurrency.map((row) => <li key={row.label} className="flex justify-between text-sm"><span>{row.label}</span><span className="font-medium tabular-nums">{format.money(row.total, row.label)}</span></li>)}</ul> : <p className="text-sm text-muted-foreground">No active contract values.</p>
            ) : <p className="text-sm text-muted-foreground">Requires contract financial access.</p>}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Top counterparties by value</CardTitle><CardDescription>Active contracts.</CardDescription></CardHeader>
          <CardContent>{summary.valueByCounterparty ? <BarList rows={summary.valueByCounterparty.map((row) => ({ label: row.label, value: Number(row.total) }))} format={(value) => format.number(value, { maximumFractionDigits: 0 })} /> : <p className="text-sm text-muted-foreground">Requires contract financial access.</p>}</CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Contracts by department</CardTitle></CardHeader>
          <CardContent><BarList rows={Object.entries(summary.byDepartment).map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value).slice(0, 8)} /></CardContent>
        </Card>
      </div>

      {summary.valueByCategory ? (
        <Card>
          <CardHeader><CardTitle>Active value by category</CardTitle><CardDescription>Grouped by category and currency.</CardDescription></CardHeader>
          <CardContent><BarList rows={summary.valueByCategory.map((row) => ({ label: row.label, value: Number(row.total) }))} format={(value) => format.number(value, { maximumFractionDigits: 0 })} /></CardContent>
        </Card>
      ) : null}
    </div>
  );
}
