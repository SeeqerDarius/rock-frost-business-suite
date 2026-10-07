import Link from "next/link";
import { CheckCircle2, Lock } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/feedback/empty-state";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { requireModuleAccess } from "@/lib/auth/module-access";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { createOrganizationFormatter } from "@/lib/org-format";
import { listMyPendingAcknowledgements, listMyPendingApprovals } from "@/modules/contracts/lifecycle";
import { actorFromTenant } from "@/modules/contracts/service";
import { AcknowledgementButtons, ApprovalDecisionButtons } from "../_components/lifecycle-tabs";
import { ContractsFlash, RiskBadge } from "../_components/shared";

export const metadata = { title: "Contract approvals" };

export default async function ContractApprovalsPage({ searchParams }: { searchParams: Promise<{ saved?: string; error?: string }> }) {
  const tenant = await requireModuleAccess("contracts");
  const actor = actorFromTenant(tenant);
  if (!actor.permissions.includes(PERMISSIONS.CONTRACTS_VIEW)) {
    return <EmptyState icon={Lock} title="You don't have access to contracts" description="Ask an administrator for a Contract Management role." />;
  }
  const search = await searchParams;
  const [steps, acknowledgements] = await Promise.all([listMyPendingApprovals(actor), listMyPendingAcknowledgements(actor)]);
  const format = createOrganizationFormatter(tenant.organization);
  const canApprove = actor.permissions.includes(PERMISSIONS.CONTRACTS_APPROVE);
  const back = "/app/contracts/approvals";

  return (
    <div className="space-y-6">
      <PageHeader title="My approvals" description="Contracts waiting for your decision, directly or through your role, and acknowledgements requested from you." />
      <ContractsFlash saved={search.saved} error={search.error} savedMessage="Recorded. The decision is in the contract history and audit log." />

      <Card>
        <CardHeader><CardTitle>Waiting for my approval</CardTitle><CardDescription>{canApprove ? "Open a contract to review it before deciding." : "Your role can view these requests but not decide them. Contract approval permission is required."}</CardDescription></CardHeader>
        <CardContent>
          {steps.length === 0 ? <EmptyState icon={CheckCircle2} title="Nothing waiting" description="Approval requests assigned to you will appear here." /> : (
            <Table>
              <TableHeader><TableRow><TableHead>Contract</TableHead><TableHead>Step</TableHead><TableHead>Submitted</TableHead><TableHead>Waiting since</TableHead>{canApprove ? <TableHead /> : null}</TableRow></TableHeader>
              <TableBody>{steps.map((step) => (
                <TableRow key={step.id}>
                  <TableCell><Link href={`/app/contracts/${step.request.contract.id}?tab=approvals`} className="font-medium hover:underline">{step.request.contract.title}</Link><div className="flex items-center gap-2 text-xs text-muted-foreground">{step.request.contract.contractNumber} · {step.request.contract.counterpartyName}<RiskBadge level={step.request.contract.riskLevel} /></div></TableCell>
                  <TableCell className="text-sm">{step.stepOrder}. {step.name}<div className="text-xs text-muted-foreground">{step.request.ruleName}{step.escalated ? " · escalated" : ""}</div></TableCell>
                  <TableCell className="text-sm">{step.request.requestedBy?.name ?? step.request.requestedBy?.email ?? "Unknown"}{step.request.note ? <div className="text-xs text-muted-foreground">{step.request.note}</div> : null}</TableCell>
                  <TableCell className="text-sm">{step.activatedAt ? format.dateTime(step.activatedAt) : "-"}</TableCell>
                  {canApprove ? <TableCell><div className="flex flex-wrap justify-end gap-1"><ApprovalDecisionButtons requestId={step.requestId} back={back} contractNumber={step.request.contract.contractNumber} /></div></TableCell> : null}
                </TableRow>
              ))}</TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Acknowledgements requested from me</CardTitle><CardDescription>Confirm that you have reviewed a contract. This is an internal acknowledgement, not an electronic signature.</CardDescription></CardHeader>
        <CardContent>
          {acknowledgements.length === 0 ? <p className="text-sm text-muted-foreground">No acknowledgements requested.</p> : (
            <Table>
              <TableHeader><TableRow><TableHead>Contract</TableHead><TableHead>Requested</TableHead><TableHead /></TableRow></TableHeader>
              <TableBody>{acknowledgements.map((signature) => (
                <TableRow key={signature.id}>
                  <TableCell><Link href={`/app/contracts/${signature.contract.id}?tab=signatures`} className="font-medium hover:underline">{signature.contract.title}</Link><div className="text-xs text-muted-foreground">{signature.contract.contractNumber}</div></TableCell>
                  <TableCell className="text-sm">{format.dateTime(signature.requestedAt)}</TableCell>
                  <TableCell><div className="flex justify-end gap-1"><AcknowledgementButtons signatureId={signature.id} back={back} /></div></TableCell>
                </TableRow>
              ))}</TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
