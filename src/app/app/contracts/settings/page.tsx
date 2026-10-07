import { Lock, Plus } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/feedback/empty-state";
import { EntityDialog } from "@/components/forms/entity-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { requireModuleAccess } from "@/lib/auth/module-access";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { db } from "@/lib/db";
import { zonedDateParts } from "@/lib/org-format";
import { formatContractNumber } from "@/modules/contracts/rules";
import { actorFromTenant, getContractSettings } from "@/modules/contracts/service";
import { createCategoryAction, createTypeAction, updateContractSettingsAction } from "../actions";
import { ContractsFlash, SELECT_CLASS } from "../_components/shared";

export const metadata = { title: "Contract settings" };

export default async function ContractSettingsPage({ searchParams }: { searchParams: Promise<{ saved?: string; error?: string }> }) {
  const tenant = await requireModuleAccess("contracts");
  const actor = actorFromTenant(tenant);
  if (!actor.permissions.includes(PERMISSIONS.CONTRACTS_MANAGE_SETTINGS)) {
    return <EmptyState icon={Lock} title="You can't manage Contract settings" description="Contract settings require the contracts.manage_settings permission." />;
  }
  const params = await searchParams;
  const [settings, categories, types] = await Promise.all([
    getContractSettings(tenant.organizationId),
    db.contractCategory.findMany({ where: { organizationId: tenant.organizationId }, orderBy: { name: "asc" } }),
    db.contractType.findMany({ where: { organizationId: tenant.organizationId }, include: { category: { select: { name: true } } }, orderBy: { name: "asc" } }),
  ]);
  const today = zonedDateParts(new Date(), tenant.organization.timezone ?? "UTC");
  const example = formatContractNumber(settings.numberFormat, settings.numberPrefix, { year: Number(today.year), month: Number(today.month) }, settings.nextSequence);

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <PageHeader title="Contract settings" description="Numbering, categories and types, expiry alerts, and who may open confidential contracts." />
      <ContractsFlash saved={params.saved} error={params.error} savedMessage="Settings saved and recorded in the audit log." />

      <Card>
        <CardHeader><CardTitle>Numbering, alerts, and confidentiality</CardTitle><CardDescription>Contract numbers are unique within your organization. Next number: <span className="font-mono">{example}</span></CardDescription></CardHeader>
        <CardContent>
          <form action={updateContractSettingsAction} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-1.5"><Label htmlFor="numberPrefix" required>Prefix</Label><Input id="numberPrefix" name="numberPrefix" defaultValue={settings.numberPrefix} required maxLength={12} /></div>
              <div className="space-y-1.5 sm:col-span-2"><Label htmlFor="numberFormat" required>Number format</Label><Input id="numberFormat" name="numberFormat" defaultValue={settings.numberFormat} required className="font-mono" /><p className="text-xs text-muted-foreground">Tokens: {"{PREFIX}"}, {"{YYYY}"}, {"{YY}"}, {"{MM}"}, {"{SEQ:6}"} (sequence padded to 6 digits).</p></div>
            </div>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="resetSequenceYearly" defaultChecked={settings.resetSequenceYearly} className="size-4" />Restart the sequence each year when the format includes the year</label>
            <div className="space-y-1.5"><Label htmlFor="expiryAlertDays" required>Expiry alerts (days before expiration)</Label><Input id="expiryAlertDays" name="expiryAlertDays" defaultValue={settings.expiryAlertDays.join(", ")} required /><p className="text-xs text-muted-foreground">Comma-separated, for example 180, 90, 60, 30, 14, 7.</p></div>
            <label className="flex items-start gap-2 rounded-md border p-3 text-sm">
              <input type="checkbox" name="confidentialAdminAccess" defaultChecked={settings.confidentialAdminAccess} className="mt-0.5 size-4" />
              <span><span className="font-medium">Users with confidential-contract permission may open all confidential contracts</span><span className="block text-xs text-muted-foreground">Off by default: confidential contracts are then visible only to their creator, owner, and explicit grants. Restricted contracts always require an explicit grant.</span></span>
            </label>
            <Button type="submit">Save settings</Button>
          </form>
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader className="flex flex-row items-start justify-between gap-3">
            <div><CardTitle>Categories</CardTitle><CardDescription>For example Customer, Supplier, Employment, Lease.</CardDescription></div>
            <EntityDialog trigger={<Button size="sm" variant="outline"><Plus />Add</Button>} title="New category" action={createCategoryAction}>
              <div className="space-y-1.5"><Label htmlFor="cat-code" required>Code</Label><Input id="cat-code" name="code" required /></div>
              <div className="space-y-1.5"><Label htmlFor="cat-name" required>Name</Label><Input id="cat-name" name="name" required /></div>
            </EntityDialog>
          </CardHeader>
          <CardContent>{categories.length ? <ul className="space-y-1 text-sm">{categories.map((category) => <li key={category.id} className="flex justify-between border-b py-1"><span>{category.name}</span><span className="font-mono text-xs text-muted-foreground">{category.code}</span></li>)}</ul> : <p className="text-sm text-muted-foreground">No categories yet.</p>}</CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-start justify-between gap-3">
            <div><CardTitle>Contract types</CardTitle><CardDescription>For example NDA, Master Services Agreement, Vehicle Lease.</CardDescription></div>
            <EntityDialog trigger={<Button size="sm" variant="outline"><Plus />Add</Button>} title="New contract type" action={createTypeAction}>
              <div className="space-y-1.5"><Label htmlFor="type-code" required>Code</Label><Input id="type-code" name="code" required /></div>
              <div className="space-y-1.5"><Label htmlFor="type-name" required>Name</Label><Input id="type-name" name="name" required /></div>
              <div className="space-y-1.5"><Label htmlFor="type-category">Category</Label><select id="type-category" name="categoryId" className={SELECT_CLASS}><option value="">None</option>{categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></div>
            </EntityDialog>
          </CardHeader>
          <CardContent>{types.length ? <ul className="space-y-1 text-sm">{types.map((type) => <li key={type.id} className="flex justify-between gap-2 border-b py-1"><span>{type.name}</span><span className="flex items-center gap-2 text-xs text-muted-foreground">{type.category ? <Badge variant="outline">{type.category.name}</Badge> : null}<span className="font-mono">{type.code}</span></span></li>)}</ul> : <p className="text-sm text-muted-foreground">No types yet.</p>}</CardContent>
        </Card>
      </div>
    </div>
  );
}
