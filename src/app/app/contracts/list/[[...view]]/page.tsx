import Link from "next/link";
import { notFound } from "next/navigation";
import { FileText, Lock, Plus, Search, ShieldCheck } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/feedback/empty-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { requireModuleAccess } from "@/lib/auth/module-access";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { SUPPORTED_CURRENCIES } from "@/lib/localization";
import { createOrganizationFormatter } from "@/lib/org-format";
import { CONTRACT_LIST_VIEWS, type ContractListView } from "@/modules/contracts/navigation";
import { daysUntil } from "@/modules/contracts/rules";
import { actorFromTenant, getContractFormOptions, listContracts } from "@/modules/contracts/service";
import { ContractStatusBadge, RiskBadge, SELECT_CLASS } from "../../_components/shared";

export const metadata = { title: "Contracts" };

type Search = { q?: string; categoryId?: string; ownerId?: string; currency?: string; tag?: string; clause?: string; minValue?: string; maxValue?: string; page?: string };

export default async function ContractListPage({ params, searchParams }: { params: Promise<{ view?: string[] }>; searchParams: Promise<Search> }) {
  const tenant = await requireModuleAccess("contracts");
  const actor = actorFromTenant(tenant);
  if (!actor.permissions.includes(PERMISSIONS.CONTRACTS_VIEW)) {
    return <EmptyState icon={Lock} title="You don't have access to contracts" description="Ask an administrator for a Contract Management role." />;
  }
  const { view: segments } = await params;
  if (segments && segments.length > 1) notFound();
  const view = (segments?.[0] ?? "all") as ContractListView;
  if (!(view in CONTRACT_LIST_VIEWS)) notFound();
  const search = await searchParams;
  const page = Math.max(Number.parseInt(search.page ?? "1", 10) || 1, 1);
  const canViewFinancials = actor.permissions.includes(PERMISSIONS.CONTRACTS_VIEW_FINANCIALS);
  const [result, options] = await Promise.all([
    listContracts(actor, { view, q: search.q, categoryId: search.categoryId, ownerId: search.ownerId, currency: search.currency, tag: search.tag, clauseCode: search.clause, minValue: search.minValue, maxValue: search.maxValue, page }),
    getContractFormOptions(tenant.organizationId),
  ]);
  const format = createOrganizationFormatter(tenant.organization);
  const pages = Math.max(Math.ceil(result.total / result.pageSize), 1);
  const base = view === "all" ? "/app/contracts/list" : `/app/contracts/list/${view}`;
  const pageLink = (target: number) => `${base}?${new URLSearchParams({ ...Object.fromEntries(Object.entries(search).filter(([, value]) => value)), page: String(target) }).toString()}`;
  const filtered = Object.entries(search).some(([key, value]) => key !== "page" && value);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <PageHeader title={CONTRACT_LIST_VIEWS[view].label} description={CONTRACT_LIST_VIEWS[view].description} />
        {actor.permissions.includes(PERMISSIONS.CONTRACTS_CREATE) ? <Button nativeButton={false} render={<Link href="/app/contracts/new" />}><Plus />New contract</Button> : null}
      </div>

      <Card>
        <CardContent className="pt-6">
          <form method="get" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6 lg:items-end">
            <div className="space-y-1.5 lg:col-span-2"><Label htmlFor="q">Search</Label><Input id="q" name="q" defaultValue={search.q ?? ""} placeholder="Number, title, counterparty, party, owner, tag" /></div>
            <div className="space-y-1.5"><Label htmlFor="categoryId">Category</Label><select id="categoryId" name="categoryId" defaultValue={search.categoryId ?? ""} className={SELECT_CLASS}><option value="">All</option>{options.categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></div>
            <div className="space-y-1.5"><Label htmlFor="ownerId">Owner</Label><select id="ownerId" name="ownerId" defaultValue={search.ownerId ?? ""} className={SELECT_CLASS}><option value="">Anyone</option>{options.members.map((member) => <option key={member.id} value={member.id}>{member.name ?? member.email}</option>)}</select></div>
            <div className="space-y-1.5"><Label htmlFor="currency">Currency</Label><select id="currency" name="currency" defaultValue={search.currency ?? ""} className={SELECT_CLASS}><option value="">Any</option>{SUPPORTED_CURRENCIES.map((code) => <option key={code} value={code}>{code}</option>)}</select></div>
            <div className="space-y-1.5"><Label htmlFor="tag">Tag</Label><Input id="tag" name="tag" defaultValue={search.tag ?? ""} /></div>
            <div className="space-y-1.5"><Label htmlFor="clause">Clause code</Label><Input id="clause" name="clause" defaultValue={search.clause ?? ""} /></div>
            {canViewFinancials ? (
              <>
                <div className="space-y-1.5"><Label htmlFor="minValue">Min value</Label><Input id="minValue" name="minValue" inputMode="decimal" defaultValue={search.minValue ?? ""} /></div>
                <div className="space-y-1.5"><Label htmlFor="maxValue">Max value</Label><Input id="maxValue" name="maxValue" inputMode="decimal" defaultValue={search.maxValue ?? ""} /></div>
              </>
            ) : null}
            <div className="flex gap-2"><Button type="submit"><Search />Search</Button>{filtered ? <Button variant="ghost" nativeButton={false} render={<Link href={base} />}>Clear</Button> : null}</div>
          </form>
        </CardContent>
      </Card>

      {result.rows.length === 0 ? (
        <EmptyState icon={FileText} title={filtered ? "No contracts match these filters" : "No contracts here yet"} description={filtered ? "Try a broader search or clear the filters." : "Contracts appear here as they are created and move through their lifecycle."} />
      ) : (
        <Card>
          <CardContent className="overflow-x-auto pt-6">
            <Table>
              <TableHeader>
                <TableRow><TableHead>Contract</TableHead><TableHead>Counterparty</TableHead><TableHead>Status</TableHead><TableHead>Risk</TableHead><TableHead>Owner</TableHead><TableHead>Expires</TableHead>{canViewFinancials ? <TableHead className="text-right">Value</TableHead> : null}</TableRow>
              </TableHeader>
              <TableBody>
                {result.rows.map((row) => {
                  const days = daysUntil(row.expirationDate);
                  return (
                    <TableRow key={row.id}>
                      <TableCell>
                        <Link href={`/app/contracts/${row.id}`} className="font-medium hover:underline">{row.title}</Link>
                        <div className="flex flex-wrap items-center gap-1 text-xs text-muted-foreground"><span className="font-mono">{row.contractNumber}</span>{row.category ? <span>· {row.category.name}</span> : null}{row.confidentiality !== "STANDARD" ? <Badge variant="outline" className="gap-1"><ShieldCheck className="size-3" />{row.confidentiality.toLowerCase()}</Badge> : null}{row.tags.slice(0, 3).map((tag) => <Badge key={tag} variant="secondary">{tag}</Badge>)}</div>
                      </TableCell>
                      <TableCell>{row.counterpartyName}</TableCell>
                      <TableCell><ContractStatusBadge status={row.status} /></TableCell>
                      <TableCell><RiskBadge level={row.riskLevel} /></TableCell>
                      <TableCell className="text-sm">{row.owner?.name ?? row.owner?.email ?? "-"}</TableCell>
                      <TableCell className="text-sm">{row.expirationDate ? <><div>{format.date(row.expirationDate)}</div>{row.status === "ACTIVE" && days !== null ? <div className={`text-xs ${days < 0 ? "text-destructive" : days <= 30 ? "text-amber-600 dark:text-amber-400" : "text-muted-foreground"}`}>{days < 0 ? `${-days} days ago` : `in ${days} days`}</div> : null}</> : <span className="text-muted-foreground">Open-ended</span>}</TableCell>
                      {canViewFinancials ? <TableCell className="text-right tabular-nums">{row.value ? format.money(row.value.toString(), row.currency) : "-"}</TableCell> : null}
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
            <div className="mt-4 flex items-center justify-between text-sm">
              <span className="text-muted-foreground">{result.total} contract{result.total === 1 ? "" : "s"} · page {result.page} of {pages}</span>
              <div className="flex gap-2">
                {result.page > 1 ? <Button size="sm" variant="outline" nativeButton={false} render={<Link href={pageLink(result.page - 1)} />}>Previous</Button> : null}
                {result.page < pages ? <Button size="sm" variant="outline" nativeButton={false} render={<Link href={pageLink(result.page + 1)} />}>Next</Button> : null}
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
