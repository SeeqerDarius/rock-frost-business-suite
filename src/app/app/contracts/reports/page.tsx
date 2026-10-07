import Link from "next/link";
import { Download, FileBarChart, Lock } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/feedback/empty-state";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { requireModuleAccess } from "@/lib/auth/module-access";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { cn } from "@/lib/utils";
import { CONTRACT_REPORTS, isContractReportKey, reportFilters, runContractReport, type ContractReportKey } from "@/modules/contracts/reports";
import { actorFromTenant } from "@/modules/contracts/service";
import { SELECT_CLASS } from "../_components/shared";

export const metadata = { title: "Contract reports" };

function parseDay(value: string | undefined) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

export default async function ContractReportsPage({ searchParams }: { searchParams: Promise<{ report?: string; from?: string; to?: string; days?: string }> }) {
  const tenant = await requireModuleAccess("contracts");
  const actor = actorFromTenant(tenant);
  if (!actor.permissions.includes(PERMISSIONS.CONTRACTS_VIEW)) {
    return <EmptyState icon={Lock} title="You don't have access to contracts" description="Ask an administrator for a Contract Management role." />;
  }
  const search = await searchParams;
  const financial = actor.permissions.includes(PERMISSIONS.CONTRACTS_VIEW_FINANCIALS);
  const canExport = actor.permissions.includes(PERMISSIONS.CONTRACTS_EXPORT);
  const available = (Object.keys(CONTRACT_REPORTS) as ContractReportKey[]).filter((key) => financial || !CONTRACT_REPORTS[key].financialOnly);
  const key: ContractReportKey = search.report && isContractReportKey(search.report) && available.includes(search.report) ? search.report : "register";
  const definition = CONTRACT_REPORTS[key];
  const input = { from: parseDay(search.from), to: parseDay(search.to), days: Number(search.days) || null };
  const resolved = reportFilters(key, input);
  const result = await runContractReport(actor, key, input);
  const query = new URLSearchParams({ ...(definition.dateRange ? { from: resolved.from.toISOString().slice(0, 10), to: resolved.to.toISOString().slice(0, 10) } : {}), ...(key === "expiring" ? { days: String(resolved.days) } : {}) });

  return (
    <div className="space-y-6">
      <PageHeader title="Contract reports" description="Reports over the contracts you can access. Values are shown per currency and never added across currencies." />
      <div className="grid gap-6 lg:grid-cols-[16rem_1fr]">
        <nav aria-label="Reports" className="space-y-1">
          {available.map((item) => <Link key={item} href={`?report=${item}`} aria-current={item === key ? "page" : undefined} className={cn("block rounded-md px-3 py-2 text-sm", item === key ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground")}>{CONTRACT_REPORTS[item].title}</Link>)}
        </nav>
        <div className="min-w-0 space-y-4">
          <Card>
            <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3">
              <div><CardTitle>{definition.title}</CardTitle><CardDescription>{definition.description}{financial ? "" : " Financial columns are hidden for your role."}</CardDescription></div>
              {canExport ? (
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" nativeButton={false} render={<a href={`/api/contracts/reports/${key}?format=csv&${query}`} />}><Download />CSV</Button>
                  <Button size="sm" variant="outline" nativeButton={false} render={<a href={`/api/contracts/reports/${key}?format=xlsx&${query}`} />}><Download />Excel</Button>
                </div>
              ) : null}
            </CardHeader>
            <CardContent className="space-y-4">
              {definition.dateRange || key === "expiring" ? (
                <form method="get" className="flex flex-wrap items-end gap-3">
                  <input type="hidden" name="report" value={key} />
                  {key === "expiring" ? (
                    <div className="space-y-1.5"><Label htmlFor="days">Expiring within</Label><select id="days" name="days" defaultValue={String(resolved.days)} className={SELECT_CLASS}>{[30, 60, 90, 180, 365].map((days) => <option key={days} value={days}>{days} days</option>)}</select></div>
                  ) : (
                    <>
                      <div className="space-y-1.5"><Label htmlFor="from">From</Label><Input id="from" name="from" type="date" defaultValue={resolved.from.toISOString().slice(0, 10)} /></div>
                      <div className="space-y-1.5"><Label htmlFor="to">To</Label><Input id="to" name="to" type="date" defaultValue={resolved.to.toISOString().slice(0, 10)} /></div>
                    </>
                  )}
                  <Button type="submit" variant="outline">Apply</Button>
                </form>
              ) : null}
              {result.summary.length ? <dl className="flex flex-wrap gap-6 text-sm">{result.summary.map((item) => <div key={item.label}><dt className="text-muted-foreground">{item.label}</dt><dd className="text-lg font-semibold tabular-nums">{item.value}</dd></div>)}</dl> : null}
              {result.truncated ? <Alert><AlertDescription>Showing the first 500 rows. Export to get up to 10,000 rows.</AlertDescription></Alert> : null}
              {result.rows.length === 0 ? <EmptyState icon={FileBarChart} title="Nothing to report" description="No records match this report and period." /> : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader><TableRow>{result.columns.map((column) => <TableHead key={column.key} className={column.align === "right" ? "text-right" : undefined}>{column.header}</TableHead>)}</TableRow></TableHeader>
                    <TableBody>{result.rows.map((row, index) => (
                      <TableRow key={index}>{result.columns.map((column) => <TableCell key={column.key} className={cn("text-sm", column.align === "right" && "text-right tabular-nums")}>{row[column.key] ?? "-"}</TableCell>)}</TableRow>
                    ))}</TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
