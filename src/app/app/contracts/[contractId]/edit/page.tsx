import Link from "next/link";
import { notFound } from "next/navigation";
import { Lock, TriangleAlert } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/feedback/empty-state";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { requireModuleAccess } from "@/lib/auth/module-access";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { actorFromTenant, ContractNotFoundError, getContractDetail, getContractFormOptions } from "@/modules/contracts/service";
import { updateContractAction } from "../../actions";
import { ContractFormFields } from "../../_components/contract-form-fields";
import { ContractsFlash } from "../../_components/shared";

export const metadata = { title: "Edit contract" };

export default async function EditContractPage({ params, searchParams }: { params: Promise<{ contractId: string }>; searchParams: Promise<{ error?: string }> }) {
  const tenant = await requireModuleAccess("contracts");
  const actor = actorFromTenant(tenant);
  if (!actor.permissions.includes(PERMISSIONS.CONTRACTS_UPDATE)) {
    return <EmptyState icon={Lock} title="You can't edit contracts" description="Editing contracts requires the contracts.update permission." />;
  }
  const { contractId } = await params;
  const { error } = await searchParams;
  let detail;
  try {
    detail = await getContractDetail(actor, contractId);
  } catch (caught) {
    if (caught instanceof ContractNotFoundError) notFound();
    throw caught;
  }
  const { contract } = detail;
  const editable = ["DRAFT", "PENDING_APPROVAL", "APPROVED", "ACTIVE"].includes(contract.status);
  const options = await getContractFormOptions(tenant.organizationId);

  return (
    <form action={updateContractAction} className="mx-auto max-w-4xl space-y-6">
      <input type="hidden" name="contractId" value={contract.id} />
      <nav aria-label="Breadcrumb" className="text-sm text-muted-foreground"><Link href="/app/contracts/list" className="hover:text-foreground">Contracts</Link><span className="px-1.5">/</span><Link href={`/app/contracts/${contract.id}`} className="hover:text-foreground">{contract.contractNumber}</Link><span className="px-1.5">/</span><span className="text-foreground">Edit</span></nav>
      <PageHeader title={`Edit ${contract.contractNumber}`} description="Saving creates a new version with the changed fields, who changed them, and when. Earlier versions are kept." />
      <ContractsFlash error={error} />
      {!editable ? <Alert variant="destructive"><TriangleAlert /><AlertTitle>This contract is closed</AlertTitle><AlertDescription>Terminated, expired, cancelled, and archived contracts cannot be edited.</AlertDescription></Alert> : null}
      <ContractFormFields
        values={{ ...contract, value: contract.value?.toFixed(2) ?? null }}
        options={options}
        baseCurrency={tenant.organization.currency ?? "GHS"}
        canViewFinancials={detail.canViewFinancials}
        currentUserId={tenant.userId}
      />
      <div className="space-y-1.5">
        <Label htmlFor="reason" required={contract.status === "ACTIVE"}>Reason for change</Label>
        <Input id="reason" name="reason" required={contract.status === "ACTIVE"} placeholder={contract.status === "ACTIVE" ? "Required for an active contract" : "Optional"} />
      </div>
      <div className="flex justify-end gap-2">
        <Button variant="ghost" nativeButton={false} render={<Link href={`/app/contracts/${contract.id}`} />}>Cancel</Button>
        <Button type="submit" disabled={!editable}>Save new version</Button>
      </div>
    </form>
  );
}
