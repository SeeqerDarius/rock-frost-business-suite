import Link from "next/link";
import { Lock } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/feedback/empty-state";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { requireModuleAccess } from "@/lib/auth/module-access";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { actorFromTenant, getContractFormOptions } from "@/modules/contracts/service";
import { createContractAction } from "../actions";
import { ContractFormFields } from "../_components/contract-form-fields";
import { ContractsFlash, humanize, SELECT_CLASS } from "../_components/shared";

export const metadata = { title: "New contract" };

const PARTY_ROLES = ["CLIENT", "VENDOR", "BUYER", "SELLER", "CONTRACTOR", "EMPLOYEE", "EMPLOYER", "PARTNER", "SERVICE_PROVIDER", "LANDLORD", "TENANT", "OWNER", "GUARANTOR", "WITNESS", "OTHER"];

export default async function NewContractPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const tenant = await requireModuleAccess("contracts");
  const actor = actorFromTenant(tenant);
  if (!actor.permissions.includes(PERMISSIONS.CONTRACTS_CREATE)) {
    return <EmptyState icon={Lock} title="You can't create contracts" description="Creating contracts requires the contracts.create permission." />;
  }
  const { error } = await searchParams;
  const options = await getContractFormOptions(tenant.organizationId);

  return (
    <form action={createContractAction} className="mx-auto max-w-4xl space-y-6">
      <nav aria-label="Breadcrumb" className="text-sm text-muted-foreground"><Link href="/app/contracts/list" className="hover:text-foreground">Contracts</Link><span className="px-1.5">/</span><span className="text-foreground">New</span></nav>
      <PageHeader title="New contract" description="The contract number is assigned automatically from your numbering settings. New contracts start as drafts; every later change is versioned." />
      <ContractsFlash error={error} />

      {options.templates.length ? (
        <Card>
          <CardHeader><CardTitle>Start from a template</CardTitle><CardDescription>The active template version is filled in with the details below and stored as the contract text. Later template changes never alter this contract.</CardDescription></CardHeader>
          <CardContent>
            <select name="templateId" defaultValue="" className={SELECT_CLASS} aria-label="Template">
              <option value="">No template</option>
              {options.templates.map((template) => <option key={template.id} value={template.id}>{template.name} ({template.code} v{template.version})</option>)}
            </select>
          </CardContent>
        </Card>
      ) : null}

      <ContractFormFields values={{}} options={options} baseCurrency={tenant.organization.currency ?? "GHS"} canViewFinancials={actor.permissions.includes(PERMISSIONS.CONTRACTS_VIEW_FINANCIALS)} currentUserId={tenant.userId} />

      <Card>
        <CardHeader><CardTitle>Counterparty details (optional)</CardTitle><CardDescription>Adds the counterparty as the first contract party. More parties can be added later.</CardDescription></CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5"><Label htmlFor="party_name">Party name</Label><Input id="party_name" name="party_name" /></div>
          <div className="space-y-1.5"><Label htmlFor="party_role">Role</Label><select id="party_role" name="party_role" defaultValue="CLIENT" className={SELECT_CLASS}>{PARTY_ROLES.map((role) => <option key={role} value={role}>{humanize(role)}</option>)}</select></div>
          <div className="space-y-1.5"><Label htmlFor="party_legalName">Legal name</Label><Input id="party_legalName" name="party_legalName" /></div>
          <div className="space-y-1.5"><Label htmlFor="party_email">Email</Label><Input id="party_email" name="party_email" type="email" /></div>
          <div className="space-y-1.5"><Label htmlFor="party_taxId">Tax ID</Label><Input id="party_taxId" name="party_taxId" /></div>
          <div className="space-y-1.5"><Label htmlFor="party_registrationNumber">Registration number</Label><Input id="party_registrationNumber" name="party_registrationNumber" /></div>
          <input type="hidden" name="party_isPrimary" value="on" />
        </CardContent>
      </Card>

      <div className="flex justify-end gap-2">
        <Button variant="ghost" nativeButton={false} render={<Link href="/app/contracts/list" />}>Cancel</Button>
        <Button type="submit">Create draft contract</Button>
      </div>
    </form>
  );
}
