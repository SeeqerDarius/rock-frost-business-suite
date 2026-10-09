import Link from "next/link";
import { ClipboardList, Lock } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/feedback/empty-state";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { requireModuleAccess } from "@/lib/auth/module-access";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { createOrganizationFormatter } from "@/lib/org-format";
import { cn } from "@/lib/utils";
import { listObligations, type ObligationListFilter } from "@/modules/contracts/lifecycle";
import { actorFromTenant } from "@/modules/contracts/service";
import { ObligationActions } from "../_components/lifecycle-tabs";
import { ContractsFlash, humanize } from "../_components/shared";

export const metadata = { title: "Contract obligations" };

const VIEWS: { key: ObligationListFilter; label: string }[] = [
  { key: "open", label: "Open" },
  { key: "overdue", label: "Overdue" },
  { key: "upcoming", label: "Due in 30 days" },
  { key: "completed", label: "Completed" },
  { key: "all", label: "All" },
];

export default async function ContractObligationsPage({ searchParams }: { searchParams: Promise<{ view?: string; mine?: string; saved?: string; error?: string }> }) {
  const tenant = await requireModuleAccess("contracts");
  const actor = actorFromTenant(tenant);
  if (!actor.permissions.includes(PERMISSIONS.CONTRACTS_VIEW)) {
    return <EmptyState icon={Lock} title="You don't have access to contracts" description="Ask an administrator for a Contract Management role." />;
  }
  const search = await searchParams;
  const view = VIEWS.find((item) => item.key === search.view)?.key ?? "open";
  const mine = search.mine === "1";
  const obligations = await listObligations(actor, view, { mine });
  const format = createOrganizationFormatter(tenant.organization);
  const canUpdate = actor.permissions.includes(PERMISSIONS.CONTRACTS_UPDATE);
  const now = new Date();
  const back = `/app/contracts/obligations?view=${view}${mine ? "&mine=1" : ""}`;
  const href = (next: { view?: string; mine?: boolean }) => `?view=${next.view ?? view}${(next.mine ?? mine) ? "&mine=1" : ""}`;

  return (
    <div className="space-y-6">
      <PageHeader title="Obligations" description="Deliverables, payments, reports, and notices owed under your contracts, across every contract you can access." />
      <ContractsFlash saved={search.saved} error={search.error} />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <nav aria-label="Obligation views" className="flex flex-wrap gap-1">
          {VIEWS.map((item) => <Link key={item.key} href={href({ view: item.key })} aria-current={item.key === view ? "page" : undefined} className={cn("rounded-md px-3 py-1.5 text-sm", item.key === view ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground")}>{item.label}</Link>)}
        </nav>
        <Link href={href({ mine: !mine })} className="text-sm text-primary hover:underline">{mine ? "Show everyone's obligations" : "Show only mine"}</Link>
      </div>
      <Card>
        <CardContent className="pt-6">
          {obligations.length === 0 ? <EmptyState icon={ClipboardList} title="No obligations here" description="Add obligations from a contract's Obligations tab." /> : (
            <Table>
              <TableHeader><TableRow><TableHead>Obligation</TableHead><TableHead>Contract</TableHead><TableHead>Owner</TableHead><TableHead>Due</TableHead><TableHead>Status</TableHead><TableHead /></TableRow></TableHeader>
              <TableBody>{obligations.map((obligation) => {
                const overdue = (obligation.status === "OPEN" || obligation.status === "IN_PROGRESS") && obligation.dueDate < now;
                return (
                  <TableRow key={obligation.id}>
                    <TableCell><div className="font-medium">{obligation.title}</div><div className="text-xs text-muted-foreground">{humanize(obligation.obligationType)} · {obligation.responsibleParty === "INTERNAL" ? "our organization" : "counterparty"}{obligation.recurrence !== "NONE" ? ` · repeats ${humanize(obligation.recurrence).toLowerCase()}` : ""}</div></TableCell>
                    <TableCell className="text-sm"><Link href={`/app/contracts/${obligation.contract.id}?tab=obligations`} className="hover:underline">{obligation.contract.title}</Link><div className="text-xs text-muted-foreground">{obligation.contract.contractNumber}</div></TableCell>
                    <TableCell className="text-sm">{obligation.owner?.name ?? obligation.owner?.email ?? "Unassigned"}</TableCell>
                    <TableCell className={overdue ? "text-sm font-medium text-destructive" : "text-sm"}>{format.date(obligation.dueDate.toISOString().slice(0, 10) + "T12:00:00Z")}{overdue ? " (overdue)" : ""}</TableCell>
                    <TableCell><Badge variant={obligation.status === "COMPLETED" ? "default" : "outline"}>{humanize(obligation.status)}</Badge></TableCell>
                    <TableCell><ObligationActions obligation={obligation} back={back} canUpdate={canUpdate || obligation.ownerId === tenant.userId} /></TableCell>
                  </TableRow>
                );
              })}</TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
