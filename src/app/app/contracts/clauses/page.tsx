import { BookOpenText, Lock, Plus, Search } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/feedback/empty-state";
import { EntityDialog } from "@/components/forms/entity-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { requireModuleAccess } from "@/lib/auth/module-access";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { db } from "@/lib/db";
import { createOrganizationFormatter } from "@/lib/org-format";
import { actorFromTenant } from "@/modules/contracts/service";
import { createClauseAction, createClauseVersionAction, setClauseStatusAction } from "../actions";
import { ContractsFlash, humanize, SELECT_CLASS } from "../_components/shared";

export const metadata = { title: "Clause library" };

const USAGE = ["RECOMMENDED", "REQUIRED", "OPTIONAL", "RESTRICTED"];
const SUGGESTED_CATEGORIES = ["Confidentiality", "Termination", "Renewal", "Liability", "Indemnity", "Payment", "Dispute resolution", "Intellectual property", "Data protection", "Force majeure", "Governing law", "Non-compete", "Service levels"];

export default async function ContractClausesPage({ searchParams }: { searchParams: Promise<{ saved?: string; error?: string; q?: string; category?: string }> }) {
  const tenant = await requireModuleAccess("contracts");
  const actor = actorFromTenant(tenant);
  if (!actor.permissions.includes(PERMISSIONS.CONTRACTS_VIEW)) {
    return <EmptyState icon={Lock} title="You don't have access to contracts" description="Ask an administrator for a Contract Management role." />;
  }
  const params = await searchParams;
  const canManage = actor.permissions.includes(PERMISSIONS.CONTRACTS_MANAGE_CLAUSES);
  const q = params.q?.trim();
  const clauses = await db.contractClause.findMany({
    where: { organizationId: tenant.organizationId, ...(params.category ? { category: params.category } : {}), ...(q ? { OR: [{ name: { contains: q, mode: "insensitive" } }, { code: { contains: q, mode: "insensitive" } }, { body: { contains: q, mode: "insensitive" } }] } : {}) },
    include: { owner: { select: { name: true, email: true } } },
    orderBy: [{ category: "asc" }, { code: "asc" }, { version: "desc" }],
    take: 500,
  });
  const categories = [...new Set([...SUGGESTED_CATEGORIES, ...clauses.map((clause) => clause.category)])].sort();
  const format = createOrganizationFormatter(tenant.organization);
  const groups = new Map<string, typeof clauses>();
  for (const clause of clauses) groups.set(clause.code, [...(groups.get(clause.code) ?? []), clause]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <PageHeader title="Clause library" description="Approved, versioned clauses for consistent contracts. Only approved clauses can be attached; restricted clauses need clause-management permission. A new version never changes contracts using an earlier one." />
        {canManage ? (
          <EntityDialog trigger={<Button><Plus />New clause</Button>} title="New clause" action={createClauseAction} contentClassName="sm:max-w-2xl">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5"><Label htmlFor="c-code" required>Code</Label><Input id="c-code" name="code" required placeholder="CONF-STD" /></div>
              <div className="space-y-1.5"><Label htmlFor="c-name" required>Name</Label><Input id="c-name" name="name" required /></div>
              <div className="space-y-1.5"><Label htmlFor="c-category" required>Category</Label><Input id="c-category" name="category" required list="clause-categories" /><datalist id="clause-categories">{categories.map((category) => <option key={category} value={category} />)}</datalist></div>
              <div className="space-y-1.5"><Label htmlFor="c-usage" required>Usage</Label><select id="c-usage" name="usage" defaultValue="OPTIONAL" className={SELECT_CLASS}>{USAGE.map((usage) => <option key={usage} value={usage}>{humanize(usage)}</option>)}</select></div>
              <div className="space-y-1.5"><Label htmlFor="c-jurisdiction">Jurisdiction</Label><Input id="c-jurisdiction" name="jurisdiction" placeholder="e.g. GH, US-NY, EU-DE" /></div>
              <div className="space-y-1.5"><Label htmlFor="c-language">Language</Label><Input id="c-language" name="language" defaultValue="en" /></div>
              <div className="space-y-1.5"><Label htmlFor="c-effective">Effective from</Label><Input id="c-effective" name="effectiveFrom" type="date" /></div>
            </div>
            <div className="space-y-1.5"><Label htmlFor="c-body" required>Clause text</Label><Textarea id="c-body" name="body" required rows={8} /></div>
            <p className="text-xs text-muted-foreground">New clauses start as drafts. Approve a clause before it can be used.</p>
          </EntityDialog>
        ) : null}
      </div>
      <ContractsFlash saved={params.saved} error={params.error} savedMessage="Clause saved and recorded in the audit log." />

      <Card>
        <CardContent className="pt-6">
          <form method="get" className="flex flex-wrap items-end gap-2">
            <div className="space-y-1.5"><Label htmlFor="q">Search</Label><Input id="q" name="q" defaultValue={q ?? ""} placeholder="Name, code, or text" /></div>
            <div className="space-y-1.5"><Label htmlFor="category">Category</Label><select id="category" name="category" defaultValue={params.category ?? ""} className={SELECT_CLASS}><option value="">All</option>{categories.map((category) => <option key={category} value={category}>{category}</option>)}</select></div>
            <Button type="submit" variant="outline"><Search />Search</Button>
          </form>
        </CardContent>
      </Card>

      {groups.size === 0 ? <EmptyState icon={BookOpenText} title="No clauses found" description={canManage ? "Add standard clauses such as confidentiality, termination, and liability." : "Your organization has not added clauses yet."} /> : (
        <div className="grid gap-4 lg:grid-cols-2">
          {[...groups.entries()].map(([code, versions]) => {
            const latest = versions[0];
            return (
              <Card key={code}>
                <CardHeader>
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div><CardTitle className="text-base">{latest.name}</CardTitle><CardDescription>{code} · {latest.category}{latest.jurisdiction ? ` · ${latest.jurisdiction}` : ""} · {latest.language}</CardDescription></div>
                    <div className="flex gap-1"><Badge variant="outline">{humanize(latest.usage)}</Badge><Badge variant={latest.status === "APPROVED" ? "default" : "secondary"}>{latest.status.toLowerCase()}</Badge></div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <p className="line-clamp-4 whitespace-pre-wrap text-sm">{latest.body}</p>
                  <p className="text-xs text-muted-foreground">v{latest.version} · owner {latest.owner?.name ?? latest.owner?.email ?? "unassigned"} · {format.date(latest.createdAt)}{versions.length > 1 ? ` · ${versions.length - 1} earlier version${versions.length > 2 ? "s" : ""}` : ""}</p>
                  {canManage ? (
                    <div className="flex flex-wrap gap-2">
                      {latest.status !== "APPROVED" ? <form action={setClauseStatusAction}><input type="hidden" name="clauseId" value={latest.id} /><input type="hidden" name="status" value="APPROVED" /><Button size="sm">Approve</Button></form> : null}
                      {latest.status !== "RETIRED" ? <form action={setClauseStatusAction}><input type="hidden" name="clauseId" value={latest.id} /><input type="hidden" name="status" value="RETIRED" /><Button size="sm" variant="ghost">Retire</Button></form> : null}
                      <EntityDialog trigger={<Button size="sm" variant="outline">New version</Button>} title={`New version of ${code}`} description="The new version starts as a draft and needs approval." action={createClauseVersionAction} contentClassName="sm:max-w-2xl">
                        <input type="hidden" name="clauseId" value={latest.id} />
                        <div className="space-y-1.5"><Label htmlFor={`cv-usage-${code}`}>Usage</Label><select id={`cv-usage-${code}`} name="usage" defaultValue={latest.usage} className={SELECT_CLASS}>{USAGE.map((usage) => <option key={usage} value={usage}>{humanize(usage)}</option>)}</select></div>
                        <div className="space-y-1.5"><Label htmlFor={`cv-body-${code}`} required>Clause text</Label><Textarea id={`cv-body-${code}`} name="body" required rows={8} defaultValue={latest.body} /></div>
                      </EntityDialog>
                    </div>
                  ) : null}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
