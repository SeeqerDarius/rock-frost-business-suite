import { FileStack, Lock, Plus } from "lucide-react";
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
import { listTemplateVariables, TEMPLATE_VARIABLES } from "@/modules/contracts/rules";
import { actorFromTenant } from "@/modules/contracts/service";
import { createTemplateAction, createTemplateVersionAction, duplicateTemplateAction, setTemplateStatusAction } from "../actions";
import { ContractsFlash, SELECT_CLASS } from "../_components/shared";

export const metadata = { title: "Contract templates" };

export default async function ContractTemplatesPage({ searchParams }: { searchParams: Promise<{ saved?: string; error?: string }> }) {
  const tenant = await requireModuleAccess("contracts");
  const actor = actorFromTenant(tenant);
  if (!actor.permissions.includes(PERMISSIONS.CONTRACTS_VIEW)) {
    return <EmptyState icon={Lock} title="You don't have access to contracts" description="Ask an administrator for a Contract Management role." />;
  }
  const params = await searchParams;
  const canManage = actor.permissions.includes(PERMISSIONS.CONTRACTS_MANAGE_TEMPLATES);
  const [templates, categories] = await Promise.all([
    db.contractTemplate.findMany({ where: { organizationId: tenant.organizationId }, include: { category: { select: { name: true } } }, orderBy: [{ code: "asc" }, { version: "desc" }] }),
    db.contractCategory.findMany({ where: { organizationId: tenant.organizationId, active: true }, orderBy: { name: "asc" } }),
  ]);
  const format = createOrganizationFormatter(tenant.organization);
  const groups = new Map<string, typeof templates>();
  for (const template of templates) groups.set(template.code, [...(groups.get(template.code) ?? []), template]);
  const variableHint = TEMPLATE_VARIABLES.map((variable) => `{{${variable}}}`).join("  ");

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <PageHeader title="Templates" description="Reusable contract templates. Editing creates a new version; contracts keep the version they were drafted from. Only one version of a template is active at a time." />
        {canManage ? (
          <EntityDialog trigger={<Button><Plus />New template</Button>} title="New template" action={createTemplateAction} contentClassName="sm:max-w-3xl">
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="space-y-1.5"><Label htmlFor="t-code" required>Code</Label><Input id="t-code" name="code" required placeholder="NDA" /></div>
              <div className="space-y-1.5 sm:col-span-2"><Label htmlFor="t-name" required>Name</Label><Input id="t-name" name="name" required placeholder="Mutual non-disclosure agreement" /></div>
              <div className="space-y-1.5"><Label htmlFor="t-category">Category</Label><select id="t-category" name="categoryId" className={SELECT_CLASS}><option value="">None</option>{categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></div>
              <div className="space-y-1.5 sm:col-span-2"><Label htmlFor="t-description">Description</Label><Input id="t-description" name="description" /></div>
            </div>
            <div className="space-y-1.5"><Label htmlFor="t-body" required>Template text</Label><Textarea id="t-body" name="body" required rows={12} className="font-mono text-sm" placeholder={"This Agreement is made between {{organization.legalName}} and {{counterparty.name}}..."} /></div>
            <p className="text-xs text-muted-foreground">Variables: {variableHint}</p>
          </EntityDialog>
        ) : null}
      </div>
      <ContractsFlash saved={params.saved} error={params.error} savedMessage="Template saved and recorded in the audit log." />

      {groups.size === 0 ? <EmptyState icon={FileStack} title="No templates yet" description="Create a template to draft contracts consistently." /> : (
        <div className="space-y-4">
          {[...groups.entries()].map(([code, versions]) => {
            const latest = versions[0];
            const active = versions.find((version) => version.status === "ACTIVE");
            return (
              <Card key={code}>
                <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3">
                  <div>
                    <CardTitle>{latest.name}</CardTitle>
                    <CardDescription>{code}{latest.category ? ` · ${latest.category.name}` : ""} · {versions.length} version{versions.length === 1 ? "" : "s"}{active ? ` · v${active.version} active` : " · no active version"}</CardDescription>
                  </div>
                  {canManage ? (
                    <div className="flex flex-wrap gap-2">
                      <EntityDialog trigger={<Button size="sm" variant="outline">New version</Button>} title={`New version of ${code}`} description="Contracts drafted from earlier versions are not changed." action={createTemplateVersionAction} contentClassName="sm:max-w-3xl">
                        <input type="hidden" name="templateId" value={latest.id} />
                        <div className="space-y-1.5"><Label htmlFor={`v-name-${code}`}>Name</Label><Input id={`v-name-${code}`} name="name" defaultValue={latest.name} /></div>
                        <div className="space-y-1.5"><Label htmlFor={`v-body-${code}`} required>Template text</Label><Textarea id={`v-body-${code}`} name="body" required rows={12} defaultValue={latest.body} className="font-mono text-sm" /></div>
                      </EntityDialog>
                      <EntityDialog trigger={<Button size="sm" variant="ghost">Duplicate</Button>} title={`Duplicate ${code}`} action={duplicateTemplateAction}>
                        <input type="hidden" name="templateId" value={latest.id} />
                        <div className="space-y-1.5"><Label htmlFor={`dup-${code}`} required>New code</Label><Input id={`dup-${code}`} name="code" required /></div>
                      </EntityDialog>
                    </div>
                  ) : null}
                </CardHeader>
                <CardContent className="space-y-2">
                  {versions.map((version) => (
                    <details key={version.id} className="rounded-lg border p-3">
                      <summary className="flex cursor-pointer flex-wrap items-center justify-between gap-2">
                        <span className="font-medium">Version {version.version}</span>
                        <span className="flex items-center gap-2 text-xs text-muted-foreground">{format.dateTime(version.createdAt)}<Badge variant={version.status === "ACTIVE" ? "default" : "outline"}>{version.status.toLowerCase()}</Badge></span>
                      </summary>
                      <pre className="mt-3 max-h-80 overflow-auto whitespace-pre-wrap rounded bg-muted/40 p-3 text-sm">{version.body}</pre>
                      {listTemplateVariables(version.body).length ? <p className="mt-2 text-xs text-muted-foreground">Uses: {listTemplateVariables(version.body).join(", ")}</p> : null}
                      {canManage ? (
                        <div className="mt-2 flex gap-2">
                          {version.status !== "ACTIVE" ? <form action={setTemplateStatusAction}><input type="hidden" name="templateId" value={version.id} /><input type="hidden" name="status" value="ACTIVE" /><Button type="submit" size="sm" variant="outline">Activate this version</Button></form> : null}
                          {version.status === "ACTIVE" ? <form action={setTemplateStatusAction}><input type="hidden" name="templateId" value={version.id} /><input type="hidden" name="status" value="RETIRED" /><Button type="submit" size="sm" variant="ghost">Retire</Button></form> : null}
                        </div>
                      ) : null}
                    </details>
                  ))}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
