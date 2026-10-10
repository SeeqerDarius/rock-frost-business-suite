import { CalendarClock, CheckCircle2, ClipboardList, FileSignature, MessageSquare, Milestone, Plus, RefreshCcw } from "lucide-react";
import { EmptyState } from "@/components/feedback/empty-state";
import { EntityDialog } from "@/components/forms/entity-dialog";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { isStepApprover, noticeDeadline, noticeShortfallDays } from "@/modules/contracts/rules";
import type { getContractLifecycle } from "@/modules/contracts/lifecycle";
import type { getContractDetail, getContractFormOptions } from "@/modules/contracts/service";
import {
  addCommentAction,
  applyAmendmentAction,
  cancelAmendmentAction,
  cancelSignatureAction,
  createAmendmentAction,
  createMilestoneAction,
  createObligationAction,
  decideApprovalAction,
  reassignApprovalAction,
  recordNonRenewalAction,
  recordSignatureAction,
  renewContractAction,
  requestAcknowledgementAction,
  respondAcknowledgementAction,
  setMilestoneStatusAction,
  submitForApprovalAction,
  terminateContractAction,
  updateObligationAction,
  withdrawApprovalAction,
} from "../actions";
import { dayInput, humanize, SELECT_CLASS } from "./shared";

type Lifecycle = Awaited<ReturnType<typeof getContractLifecycle>>;
type Contract = Awaited<ReturnType<typeof getContractDetail>>["contract"];
type Options = Awaited<ReturnType<typeof getContractFormOptions>>;

export type LifecycleTabProps = {
  contract: Contract;
  lifecycle: Lifecycle;
  options: Options;
  permissions: string[];
  userId: string;
  roleId: string | null;
  canViewFinancials: boolean;
  formatDate: (value: Date | null) => string;
  formatDateTime: (value: Date) => string;
  formatMoney: (value: string, currency: string) => string;
};

const STEP_VARIANT: Record<string, "default" | "secondary" | "outline" | "destructive"> = { WAITING: "outline", PENDING: "secondary", APPROVED: "default", REJECTED: "destructive", CHANGES_REQUESTED: "destructive", SKIPPED: "outline" };
const person = (user: { name: string | null; email: string } | null | undefined) => user?.name ?? user?.email ?? "Unknown";
const field = (id: string, label: string, props: React.ComponentProps<typeof Input> & { hint?: string; requiredLabel?: boolean } = {}) => {
  const { hint, requiredLabel, ...input } = props;
  return <div className="space-y-1.5"><Label htmlFor={id} required={requiredLabel ?? input.required}>{label}</Label><Input id={id} name={input.name ?? id} {...input} />{hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}</div>;
};

function memberLabel(options: Options, id: string | null) {
  const member = options.members.find((candidate) => candidate.id === id);
  return member ? member.name ?? member.email : null;
}

function approverLabel(options: Options, step: { approverUserId: string | null; approverRoleId: string | null; approverUser?: { name: string | null; email: string } | null }) {
  if (step.approverUserId) return step.approverUser ? person(step.approverUser) : memberLabel(options, step.approverUserId) ?? "A member";
  return `Role: ${options.roles.find((role) => role.id === step.approverRoleId)?.name ?? "Unknown role"}`;
}

// --- Approvals ------------------------------------------------------------------

export function ApprovalsTab({ contract, lifecycle, options, permissions, userId, roleId, formatDateTime }: LifecycleTabProps) {
  const can = (key: string) => permissions.includes(key);
  const pending = lifecycle.approvalRequests.find((request) => request.status === "PENDING");
  const back = `/app/contracts/${contract.id}?tab=approvals`;
  return (
    <div className="space-y-4">
      {contract.status === "DRAFT" ? (
        lifecycle.applicableRule ? (
          <Alert>
            <ClipboardList />
            <AlertTitle>Approval required: {lifecycle.applicableRule.name}</AlertTitle>
            <AlertDescription className="space-y-3">
              <p>Steps: {lifecycle.applicableRule.steps.join(", then ")}. The contract can be activated once every step approves.</p>
              {can(PERMISSIONS.CONTRACTS_UPDATE) ? (
                <EntityDialog trigger={<Button size="sm">Submit for approval</Button>} title={`Submit ${contract.contractNumber} for approval?`} description="The contract is locked while it is under approval. Withdraw the request to make changes." action={submitForApprovalAction} submitLabel="Submit">
                  <input type="hidden" name="contractId" value={contract.id} />
                  <div className="space-y-1.5"><Label htmlFor="approval-note">Note for approvers</Label><Textarea id="approval-note" name="note" rows={3} /></div>
                </EntityDialog>
              ) : null}
            </AlertDescription>
          </Alert>
        ) : <Alert><CheckCircle2 /><AlertTitle>No approval needed</AlertTitle><AlertDescription>No approval rule applies to this contract, so it can be activated directly. Approval rules are set in Contract Settings.</AlertDescription></Alert>
      ) : null}

      {pending ? (
        <Card>
          <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3">
            <div><CardTitle>Approval in progress</CardTitle><CardDescription>{pending.ruleName} · submitted {formatDateTime(pending.requestedAt)} by {person(pending.requestedBy)}{pending.note ? ` · "${pending.note}"` : ""}</CardDescription></div>
            {pending.requestedById === userId || can(PERMISSIONS.CONTRACTS_MANAGE_SETTINGS) ? (
              <EntityDialog trigger={<Button size="sm" variant="outline">Withdraw</Button>} title="Withdraw the approval request?" description="The contract returns to draft so it can be changed and submitted again." action={withdrawApprovalAction} submitLabel="Withdraw">
                <input type="hidden" name="contractId" value={contract.id} />
                <input type="hidden" name="requestId" value={pending.id} />
                {field("withdraw-reason", "Reason", { name: "reason" })}
              </EntityDialog>
            ) : null}
          </CardHeader>
          <CardContent>
            <ol className="space-y-3">
              {pending.steps.map((step) => {
                const mine = step.status === "PENDING" && isStepApprover(step, { userId, roleId }) && can(PERMISSIONS.CONTRACTS_APPROVE);
                const canReassign = step.status === "PENDING" && (isStepApprover(step, { userId, roleId }) || can(PERMISSIONS.CONTRACTS_MANAGE_SETTINGS));
                return (
                  <li key={step.id} className="rounded-lg border p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="text-sm"><span className="font-medium">{step.stepOrder}. {step.name}</span> <span className="text-muted-foreground">· {approverLabel(options, step)}</span>{step.escalated ? <Badge variant="outline" className="ml-2">Escalated</Badge> : null}</div>
                      <Badge variant={STEP_VARIANT[step.status]}>{humanize(step.status)}</Badge>
                    </div>
                    {step.decidedAt ? <p className="mt-1 text-xs text-muted-foreground">{person(step.decidedBy)} · {formatDateTime(step.decidedAt)}{step.comment ? ` · ${step.comment}` : ""}</p> : null}
                    {mine || canReassign ? (
                      <div className="mt-3 flex flex-wrap gap-2">
                        {mine ? <ApprovalDecisionButtons requestId={pending.id} back={back} contractNumber={contract.contractNumber} /> : null}
                        {canReassign ? (
                          <EntityDialog trigger={<Button size="sm" variant="ghost">Reassign</Button>} title="Reassign this step" action={reassignApprovalAction} submitLabel="Reassign">
                            <input type="hidden" name="stepId" value={step.id} />
                            <input type="hidden" name="back" value={back} />
                            <div className="space-y-1.5"><Label htmlFor={`reassign-${step.id}`} required>New approver</Label><select id={`reassign-${step.id}`} name="approverUserId" className={SELECT_CLASS} required>{options.members.map((member) => <option key={member.id} value={member.id}>{member.name ?? member.email}</option>)}</select></div>
                            {field(`reassign-reason-${step.id}`, "Reason", { name: "reason" })}
                            <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="escalate" className="size-4" />Mark as an escalation</label>
                          </EntityDialog>
                        ) : null}
                      </div>
                    ) : null}
                  </li>
                );
              })}
            </ol>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader><CardTitle>Discussion</CardTitle><CardDescription>Comments are kept with the contract and linked to the approval in progress.</CardDescription></CardHeader>
        <CardContent className="space-y-4">
          <form action={addCommentAction} className="space-y-2">
            <input type="hidden" name="contractId" value={contract.id} />
            <Label htmlFor="comment-body" className="sr-only">Comment</Label>
            <Textarea id="comment-body" name="body" rows={3} placeholder="Add a comment" required />
            <Button size="sm" type="submit"><MessageSquare />Comment</Button>
          </form>
          {lifecycle.comments.length ? (
            <ul className="space-y-3">{lifecycle.comments.map((comment) => (
              <li key={comment.id} className="rounded-lg border p-3 text-sm"><div className="text-xs text-muted-foreground">{person(comment.author)} · {formatDateTime(comment.createdAt)}</div><p className="mt-1 whitespace-pre-wrap">{comment.body}</p></li>
            ))}</ul>
          ) : <p className="text-sm text-muted-foreground">No comments yet.</p>}
        </CardContent>
      </Card>

      {lifecycle.approvalRequests.filter((request) => request.status !== "PENDING").length ? (
        <Card>
          <CardHeader><CardTitle>Approval history</CardTitle></CardHeader>
          <CardContent>
            <Table>
              <TableHeader><TableRow><TableHead>Rule</TableHead><TableHead>Submitted</TableHead><TableHead>Outcome</TableHead><TableHead>Steps</TableHead></TableRow></TableHeader>
              <TableBody>{lifecycle.approvalRequests.filter((request) => request.status !== "PENDING").map((request) => (
                <TableRow key={request.id}>
                  <TableCell>{request.ruleName}<div className="text-xs text-muted-foreground">Version {request.contractVersion}</div></TableCell>
                  <TableCell className="text-sm">{formatDateTime(request.requestedAt)}<div className="text-xs text-muted-foreground">{person(request.requestedBy)}</div></TableCell>
                  <TableCell><Badge variant={request.status === "APPROVED" ? "default" : "outline"}>{humanize(request.status)}</Badge></TableCell>
                  <TableCell className="text-xs">{request.steps.map((step) => `${step.name}: ${humanize(step.status)}${step.decidedBy ? ` (${person(step.decidedBy)})` : ""}`).join(" · ")}</TableCell>
                </TableRow>
              ))}</TableBody>
            </Table>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}

export function ApprovalDecisionButtons({ requestId, back, contractNumber }: { requestId: string; back: string; contractNumber: string }) {
  const decision = (value: string, label: string, variant: "default" | "outline" | "destructive", requireComment: boolean) => (
    <EntityDialog trigger={<Button size="sm" variant={variant}>{label}</Button>} title={`${label}: ${contractNumber}`} action={decideApprovalAction} submitLabel={label}>
      <input type="hidden" name="requestId" value={requestId} />
      <input type="hidden" name="decision" value={value} />
      <input type="hidden" name="back" value={back} />
      <div className="space-y-1.5"><Label htmlFor={`decision-${value}-${requestId}`} required={requireComment}>{requireComment ? "Reason" : "Comment"}</Label><Textarea id={`decision-${value}-${requestId}`} name="comment" rows={3} required={requireComment} /></div>
    </EntityDialog>
  );
  return <>{decision("APPROVE", "Approve", "default", false)}{decision("REQUEST_CHANGES", "Request changes", "outline", true)}{decision("REJECT", "Reject", "destructive", true)}</>;
}

// --- Obligations and milestones ---------------------------------------------------

const OBLIGATION_TYPES = ["DELIVERABLE", "PAYMENT", "REPORTING", "COMPLIANCE", "INSURANCE", "NOTICE", "OTHER"];
const RECURRENCES = ["NONE", "MONTHLY", "QUARTERLY", "SEMI_ANNUAL", "ANNUAL"];
const CLOSED = ["TERMINATED", "CANCELLED", "ARCHIVED"];

export function ObligationActions({ obligation, back, canUpdate }: { obligation: { id: string; status: string; ownerId: string | null; title: string }; back: string; canUpdate: boolean }) {
  if (!canUpdate) return null;
  const simple = (action: string, label: string) => (
    <form action={updateObligationAction}><input type="hidden" name="obligationId" value={obligation.id} /><input type="hidden" name="action" value={action} /><input type="hidden" name="back" value={back} /><Button type="submit" size="sm" variant="ghost">{label}</Button></form>
  );
  const withNote = (action: string, label: string, required: boolean) => (
    <EntityDialog trigger={<Button size="sm" variant="ghost">{label}</Button>} title={`${label}: ${obligation.title}`} action={updateObligationAction} submitLabel={label}>
      <input type="hidden" name="obligationId" value={obligation.id} />
      <input type="hidden" name="action" value={action} />
      <input type="hidden" name="back" value={back} />
      <div className="space-y-1.5"><Label htmlFor={`ob-${action}-${obligation.id}`} required={required}>{required ? "Reason" : "Note"}</Label><Input id={`ob-${action}-${obligation.id}`} name="note" required={required} /></div>
    </EntityDialog>
  );
  return (
    <div className="flex flex-wrap justify-end gap-1">
      {obligation.status === "OPEN" ? simple("START", "Start") : null}
      {obligation.status === "OPEN" || obligation.status === "IN_PROGRESS" ? <>{withNote("COMPLETE", "Complete", false)}{withNote("WAIVE", "Waive", true)}</> : simple("REOPEN", "Reopen")}
    </div>
  );
}

export function ObligationsTab({ contract, lifecycle, options, permissions, userId, canViewFinancials, formatDate, formatMoney }: LifecycleTabProps) {
  const canUpdate = permissions.includes(PERMISSIONS.CONTRACTS_UPDATE);
  const open = !CLOSED.includes(contract.status);
  const back = `/app/contracts/${contract.id}?tab=obligations`;
  const now = new Date();
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3">
          <div><CardTitle>Obligations</CardTitle><CardDescription>What each side must do and by when. Owners receive reminders before the due date. Completing a recurring obligation schedules the next one.</CardDescription></div>
          {canUpdate && open ? (
            <EntityDialog trigger={<Button size="sm"><Plus />Add obligation</Button>} title="Add obligation" action={createObligationAction} contentClassName="sm:max-w-xl">
              <input type="hidden" name="contractId" value={contract.id} />
              {field("ob-title", "Obligation", { name: "title", required: true, placeholder: "For example: deliver the quarterly service report" })}
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5"><Label htmlFor="ob-type">Type</Label><select id="ob-type" name="obligationType" className={SELECT_CLASS}>{OBLIGATION_TYPES.map((type) => <option key={type} value={type}>{humanize(type)}</option>)}</select></div>
                <div className="space-y-1.5"><Label htmlFor="ob-party">Responsible</Label><select id="ob-party" name="responsibleParty" className={SELECT_CLASS}><option value="INTERNAL">Our organization</option><option value="COUNTERPARTY">The counterparty</option></select></div>
                {field("ob-due", "Due date", { name: "dueDate", type: "date", required: true })}
                <div className="space-y-1.5"><Label htmlFor="ob-recurrence">Repeats</Label><select id="ob-recurrence" name="recurrence" className={SELECT_CLASS}>{RECURRENCES.map((value) => <option key={value} value={value}>{value === "NONE" ? "Does not repeat" : humanize(value)}</option>)}</select></div>
                <div className="space-y-1.5 sm:col-span-2"><Label htmlFor="ob-owner">Owner</Label><select id="ob-owner" name="ownerId" defaultValue={contract.ownerId ?? userId} className={SELECT_CLASS}>{options.members.map((member) => <option key={member.id} value={member.id}>{member.name ?? member.email}</option>)}</select></div>
              </div>
              <div className="space-y-1.5"><Label htmlFor="ob-description">Details</Label><Textarea id="ob-description" name="description" rows={3} /></div>
            </EntityDialog>
          ) : null}
        </CardHeader>
        <CardContent>
          {lifecycle.obligations.length === 0 ? <EmptyState icon={ClipboardList} title="No obligations recorded" description="Track deliverables, payments, reports, and notices owed under this contract." /> : (
            <Table>
              <TableHeader><TableRow><TableHead>Obligation</TableHead><TableHead>Responsible</TableHead><TableHead>Owner</TableHead><TableHead>Due</TableHead><TableHead>Status</TableHead><TableHead /></TableRow></TableHeader>
              <TableBody>{lifecycle.obligations.map((obligation) => {
                const overdue = (obligation.status === "OPEN" || obligation.status === "IN_PROGRESS") && obligation.dueDate < now;
                return (
                  <TableRow key={obligation.id}>
                    <TableCell><div className="font-medium">{obligation.title}</div><div className="text-xs text-muted-foreground">{humanize(obligation.obligationType)}{obligation.recurrence !== "NONE" ? ` · repeats ${humanize(obligation.recurrence).toLowerCase()}` : ""}</div>{obligation.resolutionNote ? <div className="text-xs text-muted-foreground">Note: {obligation.resolutionNote}</div> : null}</TableCell>
                    <TableCell className="text-sm">{obligation.responsibleParty === "INTERNAL" ? "Our organization" : "Counterparty"}</TableCell>
                    <TableCell className="text-sm">{person(obligation.owner)}</TableCell>
                    <TableCell className={overdue ? "text-sm font-medium text-destructive" : "text-sm"}>{formatDate(obligation.dueDate)}{overdue ? " (overdue)" : ""}</TableCell>
                    <TableCell><Badge variant={obligation.status === "COMPLETED" ? "default" : "outline"}>{humanize(obligation.status)}</Badge></TableCell>
                    <TableCell><ObligationActions obligation={obligation} back={back} canUpdate={canUpdate || obligation.ownerId === userId} /></TableCell>
                  </TableRow>
                );
              })}</TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3">
          <div><CardTitle>Milestones</CardTitle><CardDescription>Key dates such as delivery, acceptance, or go-live. Record whether each was achieved or missed.</CardDescription></div>
          {canUpdate && open ? (
            <EntityDialog trigger={<Button size="sm"><Plus />Add milestone</Button>} title="Add milestone" action={createMilestoneAction}>
              <input type="hidden" name="contractId" value={contract.id} />
              {field("ms-title", "Milestone", { name: "title", required: true })}
              {field("ms-due", "Planned date", { name: "dueDate", type: "date", required: true })}
              {canViewFinancials ? field("ms-amount", `Amount (${contract.currency})`, { name: "amount", inputMode: "decimal", hint: "Optional. For example, a payment due on achievement." }) : null}
              <div className="space-y-1.5"><Label htmlFor="ms-description">Details</Label><Textarea id="ms-description" name="description" rows={2} /></div>
            </EntityDialog>
          ) : null}
        </CardHeader>
        <CardContent>
          {lifecycle.milestones.length === 0 ? <EmptyState icon={Milestone} title="No milestones" description="Add the key dates this contract depends on." /> : (
            <Table>
              <TableHeader><TableRow><TableHead>Milestone</TableHead><TableHead>Planned</TableHead>{canViewFinancials ? <TableHead className="text-right">Amount</TableHead> : null}<TableHead>Status</TableHead><TableHead /></TableRow></TableHeader>
              <TableBody>{lifecycle.milestones.map((milestone) => (
                <TableRow key={milestone.id}>
                  <TableCell><div className="font-medium">{milestone.title}</div>{milestone.note ? <div className="text-xs text-muted-foreground">{milestone.note}</div> : null}</TableCell>
                  <TableCell className="text-sm">{formatDate(milestone.dueDate)}{milestone.achievedAt ? <div className="text-xs text-muted-foreground">Achieved {formatDate(milestone.achievedAt)}</div> : null}</TableCell>
                  {canViewFinancials ? <TableCell className="text-right tabular-nums">{milestone.amount ? formatMoney(milestone.amount.toString(), contract.currency) : "-"}</TableCell> : null}
                  <TableCell><Badge variant={milestone.status === "ACHIEVED" ? "default" : "outline"}>{humanize(milestone.status)}</Badge></TableCell>
                  <TableCell>
                    {canUpdate && milestone.status === "PLANNED" ? (
                      <div className="flex justify-end gap-1">
                        <form action={setMilestoneStatusAction}><input type="hidden" name="contractId" value={contract.id} /><input type="hidden" name="milestoneId" value={milestone.id} /><input type="hidden" name="status" value="ACHIEVED" /><Button type="submit" size="sm" variant="ghost">Achieved</Button></form>
                        {(["MISSED", "CANCELLED"] as const).map((status) => (
                          <EntityDialog key={status} trigger={<Button size="sm" variant="ghost">{humanize(status)}</Button>} title={`Mark ${milestone.title} ${status.toLowerCase()}`} action={setMilestoneStatusAction} submitLabel="Save">
                            <input type="hidden" name="contractId" value={contract.id} />
                            <input type="hidden" name="milestoneId" value={milestone.id} />
                            <input type="hidden" name="status" value={status} />
                            {field(`ms-note-${status}-${milestone.id}`, "Note", { name: "note", required: true })}
                          </EntityDialog>
                        ))}
                      </div>
                    ) : null}
                  </TableCell>
                </TableRow>
              ))}</TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// --- Amendments ----------------------------------------------------------------------

const FINANCIAL_AMENDABLE = new Set(["value", "paymentTerms", "billingFrequency"]);
const AMENDMENT_LABELS: Record<string, string> = {
  title: "Title", value: "Contract value", currency: "Currency", expirationDate: "Expiration date", renewalDate: "Renewal date", noticePeriodDays: "Notice period (days)",
  renewalType: "Renewal type", renewalTermMonths: "Renewal term (months)", paymentTerms: "Payment terms", billingFrequency: "Billing frequency", governingLaw: "Governing law",
  governingJurisdiction: "Governing jurisdiction", description: "Description", body: "Contract text",
};

export function AmendmentsTab({ contract, lifecycle, permissions, userId, canViewFinancials, formatDate, formatDateTime }: LifecycleTabProps) {
  const can = (key: string) => permissions.includes(key);
  const amendable = contract.status === "ACTIVE" || contract.status === "APPROVED";
  const fields = Object.keys(AMENDMENT_LABELS).filter((key) => canViewFinancials || !FINANCIAL_AMENDABLE.has(key));
  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3">
        <div><CardTitle>Amendments</CardTitle><CardDescription>Changes to an approved or active contract are drafted as numbered amendments. Applying an amendment creates a new contract version; earlier versions are never rewritten. Upload the signed amendment under Documents.</CardDescription></div>
        {can(PERMISSIONS.CONTRACTS_UPDATE) && amendable ? (
          <EntityDialog trigger={<Button size="sm"><Plus />Draft amendment</Button>} title="Draft amendment" description="Fill in only the terms that change." action={createAmendmentAction} contentClassName="sm:max-w-2xl">
            <input type="hidden" name="contractId" value={contract.id} />
            <div className="grid gap-3 sm:grid-cols-2">
              {field("am-title", "Amendment title", { name: "title", required: true })}
              {field("am-effective", "Effective date", { name: "effectiveDate", type: "date" })}
            </div>
            <div className="space-y-1.5"><Label htmlFor="am-reason" required>Reason</Label><Textarea id="am-reason" name="reason" rows={2} required /></div>
            <div className="grid gap-3 sm:grid-cols-2">
              {fields.filter((key) => key !== "body" && key !== "description").map((key) => key === "renewalType" ? (
                <div key={key} className="space-y-1.5"><Label htmlFor={`am-${key}`}>{AMENDMENT_LABELS[key]}</Label><select id={`am-${key}`} name={`change_${key}`} className={SELECT_CLASS} defaultValue=""><option value="">No change</option>{["FIXED_TERM", "EVERGREEN", "AUTO_RENEWAL", "MANUAL_RENEWAL", "NO_RENEWAL"].map((value) => <option key={value} value={value}>{humanize(value)}</option>)}</select></div>
              ) : field(`am-${key}`, AMENDMENT_LABELS[key], { name: `change_${key}`, type: key.endsWith("Date") ? "date" : key === "noticePeriodDays" || key === "renewalTermMonths" ? "number" : "text", placeholder: "No change" }))}
            </div>
            <div className="space-y-1.5"><Label htmlFor="am-description">New description</Label><Textarea id="am-description" name="change_description" rows={2} placeholder="No change" /></div>
            <div className="space-y-1.5"><Label htmlFor="am-body">New contract text</Label><Textarea id="am-body" name="change_body" rows={4} placeholder="No change" /></div>
          </EntityDialog>
        ) : null}
      </CardHeader>
      <CardContent>
        {lifecycle.amendments.length === 0 ? <EmptyState icon={FileSignature} title="No amendments" description={amendable ? "Draft an amendment when terms change." : "Amendments are available once the contract is approved or active."} /> : (
          <ul className="space-y-3">{lifecycle.amendments.map((amendment) => {
            const changes = (amendment.changes ?? {}) as Record<string, unknown>;
            return (
              <li key={amendment.id} className="rounded-lg border p-3 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div><span className="font-medium">Amendment {amendment.amendmentNumber}: {amendment.title}</span> <span className="text-muted-foreground">· {person(amendment.createdBy)} · {formatDateTime(amendment.createdAt)}</span></div>
                  <Badge variant={amendment.status === "APPLIED" ? "default" : "outline"}>{humanize(amendment.status)}{amendment.appliedVersion ? ` as v${amendment.appliedVersion}` : ""}</Badge>
                </div>
                <p className="mt-1 text-muted-foreground">{amendment.reason}{amendment.effectiveDate ? ` Effective ${formatDate(amendment.effectiveDate)}.` : ""}</p>
                <dl className="mt-2 grid gap-x-6 gap-y-1 sm:grid-cols-2">{Object.entries(changes).map(([key, value]) => <div key={key} className="flex gap-2"><dt className="text-muted-foreground">{AMENDMENT_LABELS[key] ?? key}:</dt><dd className="truncate font-medium">{key === "body" || key === "description" ? "updated text" : String(value)}</dd></div>)}</dl>
                {amendment.status === "DRAFT" ? (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {can(PERMISSIONS.CONTRACTS_APPROVE) && amendable ? (
                      <EntityDialog trigger={<Button size="sm">Apply</Button>} title={`Apply amendment ${amendment.amendmentNumber}?`} description={amendment.createdById === userId ? "You drafted this amendment. Unless self-approval is allowed in settings, someone else must apply it." : "The contract terms change and a new version is recorded."} action={applyAmendmentAction} submitLabel="Apply">
                        <input type="hidden" name="contractId" value={contract.id} />
                        <input type="hidden" name="amendmentId" value={amendment.id} />
                      </EntityDialog>
                    ) : null}
                    {can(PERMISSIONS.CONTRACTS_UPDATE) ? <form action={cancelAmendmentAction}><input type="hidden" name="contractId" value={contract.id} /><input type="hidden" name="amendmentId" value={amendment.id} /><Button type="submit" size="sm" variant="ghost">Cancel draft</Button></form> : null}
                  </div>
                ) : null}
              </li>
            );
          })}</ul>
        )}
      </CardContent>
    </Card>
  );
}

// --- Renewal and termination -------------------------------------------------------------

export function RenewalsTab({ contract, lifecycle, permissions, canViewFinancials, formatDate, formatDateTime, formatMoney }: LifecycleTabProps) {
  const can = (key: string) => permissions.includes(key);
  const deadline = noticeDeadline(contract.expirationDate, contract.noticePeriodDays);
  const today = new Date(new Date().toISOString().slice(0, 10) + "T00:00:00.000Z");
  const renewable = contract.status === "ACTIVE" || contract.status === "EXPIRED";
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3">
          <div><CardTitle>Term and renewal</CardTitle><CardDescription>Renewing extends the expiration date as a new contract version. Status changes are always made by a person; reminders never renew a contract on their own.</CardDescription></div>
          <div className="flex flex-wrap gap-2">
            {can(PERMISSIONS.CONTRACTS_RENEW) && renewable ? (
              <EntityDialog trigger={<Button size="sm"><RefreshCcw />Renew</Button>} title={`Renew ${contract.contractNumber}`} action={renewContractAction} submitLabel="Renew">
                <input type="hidden" name="contractId" value={contract.id} />
                {field("renew-date", "New expiration date", { name: "newExpirationDate", type: "date", required: true, defaultValue: dayInput(lifecycle.proposedRenewalDate), hint: lifecycle.proposedRenewalDate ? `Proposed from the ${contract.renewalTermMonths}-month renewal term.` : undefined })}
                {canViewFinancials ? field("renew-value", `New value (${contract.currency})`, { name: "newValue", inputMode: "decimal", hint: "Leave blank to keep the current value." }) : null}
                {field("renew-reason", "Reason or reference", { name: "reason" })}
              </EntityDialog>
            ) : null}
            {can(PERMISSIONS.CONTRACTS_RENEW) && contract.status === "ACTIVE" && contract.renewalType !== "NO_RENEWAL" ? (
              <EntityDialog trigger={<Button size="sm" variant="outline">Not renewing</Button>} title="Record a decision not to renew" description="The renewal type becomes no renewal. The contract stays active until it expires or is terminated." action={recordNonRenewalAction} submitLabel="Record decision">
                <input type="hidden" name="contractId" value={contract.id} />
                {field("nr-reason", "Reason", { name: "reason", required: true })}
                {field("nr-notice", "Notice given on", { name: "noticeGivenAt", type: "date", hint: deadline ? `Notice deadline: ${formatDate(deadline)}.` : undefined })}
              </EntityDialog>
            ) : null}
            {can(PERMISSIONS.CONTRACTS_TERMINATE) && contract.status === "ACTIVE" ? (
              <EntityDialog trigger={<Button size="sm" variant="destructive">Terminate</Button>} title={`Terminate ${contract.contractNumber}`} description={`Open obligations and planned milestones after the effective date are closed with a note.${contract.noticePeriodDays ? ` The notice period is ${contract.noticePeriodDays} days.` : ""}`} action={terminateContractAction} submitLabel="Terminate">
                <input type="hidden" name="contractId" value={contract.id} />
                <div className="grid gap-3 sm:grid-cols-2">
                  {field("term-notice", "Notice given on", { name: "noticeGivenAt", type: "date", defaultValue: dayInput(contract.noticeGivenAt ?? today) })}
                  {field("term-effective", "Effective date", { name: "effectiveDate", type: "date", required: true, defaultValue: dayInput(contract.noticePeriodDays ? new Date(today.getTime() + contract.noticePeriodDays * 86_400_000) : today) })}
                </div>
                <div className="space-y-1.5"><Label htmlFor="term-reason" required>Reason</Label><Textarea id="term-reason" name="reason" rows={3} required /></div>
                <label className="flex items-start gap-2 text-sm"><input type="checkbox" name="acknowledgeShortNotice" className="mt-0.5 size-4" />I confirm the termination even if the notice given is shorter than the contract&apos;s notice period.</label>
              </EntityDialog>
            ) : null}
          </div>
        </CardHeader>
        <CardContent>
          <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-3">
            {[
              ["Expiration date", formatDate(contract.expirationDate)], ["Renewal type", humanize(contract.renewalType)], ["Renewal term", contract.renewalTermMonths ? `${contract.renewalTermMonths} months` : "Not set"],
              ["Notice period", contract.noticePeriodDays !== null ? `${contract.noticePeriodDays} days` : "Not set"], ["Notice deadline", deadline ? `${formatDate(deadline)}${deadline < today && contract.status === "ACTIVE" ? " (passed)" : ""}` : "Not applicable"], ["Notice given", formatDate(contract.noticeGivenAt)],
            ].map(([label, value]) => <div key={label}><dt className="text-muted-foreground">{label}</dt><dd className="font-medium">{value}</dd></div>)}
          </dl>
        </CardContent>
      </Card>

      {contract.status === "TERMINATED" ? (
        <Alert variant="destructive">
          <CalendarClock />
          <AlertTitle>Terminated, effective {formatDate(contract.terminationEffectiveDate)}</AlertTitle>
          <AlertDescription>
            {contract.terminationReason}
            {contract.noticeGivenAt && contract.terminationEffectiveDate && noticeShortfallDays(contract.noticeGivenAt, contract.terminationEffectiveDate, contract.noticePeriodDays) > 0 ? ` Notice was ${noticeShortfallDays(contract.noticeGivenAt, contract.terminationEffectiveDate, contract.noticePeriodDays)} days short of the notice period.` : ""}
            {contract.terminatedAt ? ` Recorded ${formatDateTime(contract.terminatedAt)}.` : ""}
          </AlertDescription>
        </Alert>
      ) : null}

      <Card>
        <CardHeader><CardTitle>Renewal history</CardTitle></CardHeader>
        <CardContent>
          {lifecycle.renewals.length === 0 ? <p className="text-sm text-muted-foreground">No renewal decisions recorded.</p> : (
            <Table>
              <TableHeader><TableRow><TableHead>Decision</TableHead><TableHead>Expiration</TableHead>{canViewFinancials ? <TableHead>Value</TableHead> : null}<TableHead>Reason</TableHead><TableHead>Recorded</TableHead></TableRow></TableHeader>
              <TableBody>{lifecycle.renewals.map((renewal) => (
                <TableRow key={renewal.id}>
                  <TableCell><Badge variant={renewal.decision === "RENEWED" ? "default" : "outline"}>{humanize(renewal.decision)}</Badge></TableCell>
                  <TableCell className="text-sm">{formatDate(renewal.previousExpirationDate)}{renewal.newExpirationDate ? ` to ${formatDate(renewal.newExpirationDate)}` : ""}</TableCell>
                  {canViewFinancials ? <TableCell className="text-sm tabular-nums">{renewal.newValue && renewal.previousValue && !renewal.newValue.equals(renewal.previousValue) ? `${formatMoney(renewal.previousValue.toString(), contract.currency)} to ${formatMoney(renewal.newValue.toString(), contract.currency)}` : "Unchanged"}</TableCell> : null}
                  <TableCell className="text-sm">{renewal.reason ?? "-"}</TableCell>
                  <TableCell className="text-sm">{formatDateTime(renewal.createdAt)}</TableCell>
                </TableRow>
              ))}</TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// --- Signatures ----------------------------------------------------------------------------

const METHOD_LABEL: Record<string, string> = { INTERNAL_ACKNOWLEDGEMENT: "Internal acknowledgement", RECORDED_EXTERNAL: "Recorded signature", PROVIDER: "Electronic signature" };

export function SignaturesTab({ contract, lifecycle, options, permissions, userId, formatDate, formatDateTime }: LifecycleTabProps) {
  const canUpdate = permissions.includes(PERMISSIONS.CONTRACTS_UPDATE);
  const documents = contract.documents.filter((document) => !document.removedAt);
  const back = `/app/contracts/${contract.id}?tab=signatures`;
  const documentSelect = (id: string) => (
    <div className="space-y-1.5"><Label htmlFor={id}>Document</Label><select id={id} name="documentId" className={SELECT_CLASS} defaultValue=""><option value="">The contract as a whole</option>{documents.map((document) => <option key={document.id} value={document.id}>{document.title} v{document.version}</option>)}</select></div>
  );
  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3">
        <div>
          <CardTitle>Signatures and acknowledgements</CardTitle>
          <CardDescription>Internal acknowledgements confirm that a colleague has reviewed the contract in this application; they are not electronic signatures. Signatures obtained on paper or in another tool can be recorded here with evidence. No electronic signature provider is connected.</CardDescription>
        </div>
        {canUpdate ? (
          <div className="flex flex-wrap gap-2">
            {["APPROVED", "ACTIVE"].includes(contract.status) ? (
              <EntityDialog trigger={<Button size="sm" variant="outline">Request acknowledgement</Button>} title="Request an internal acknowledgement" action={requestAcknowledgementAction} submitLabel="Send request">
                <input type="hidden" name="contractId" value={contract.id} />
                <div className="space-y-1.5"><Label htmlFor="ack-user" required>Person</Label><select id="ack-user" name="signerUserId" className={SELECT_CLASS} required>{options.members.map((member) => <option key={member.id} value={member.id}>{member.name ?? member.email}</option>)}</select></div>
                {documentSelect("ack-document")}
              </EntityDialog>
            ) : null}
            {!["CANCELLED", "ARCHIVED"].includes(contract.status) ? (
              <EntityDialog trigger={<Button size="sm"><FileSignature />Record signature</Button>} title="Record a signature" description="For signatures obtained on paper or in another tool. Upload the signed copy under Documents and select it here." action={recordSignatureAction} submitLabel="Record" contentClassName="sm:max-w-xl">
                <input type="hidden" name="contractId" value={contract.id} />
                <div className="grid gap-3 sm:grid-cols-2">
                  {field("sig-name", "Signer name", { name: "signerName", required: true })}
                  {field("sig-title", "Signer title", { name: "signerTitle" })}
                  {field("sig-email", "Signer email", { name: "signerEmail", type: "email" })}
                  {field("sig-date", "Signed on", { name: "signedAt", type: "date", required: true })}
                  <div className="space-y-1.5"><Label htmlFor="sig-party">Party</Label><select id="sig-party" name="partyId" className={SELECT_CLASS} defaultValue=""><option value="">Not linked</option>{contract.parties.map((party) => <option key={party.id} value={party.id}>{party.name}</option>)}</select></div>
                  {documentSelect("sig-document")}
                </div>
                {field("sig-evidence", "Evidence", { name: "evidenceNote", placeholder: "For example: wet-ink original filed in the legal cabinet" })}
              </EntityDialog>
            ) : null}
          </div>
        ) : null}
      </CardHeader>
      <CardContent>
        {lifecycle.signatures.length === 0 ? <EmptyState icon={FileSignature} title="No signatures recorded" description="Record signatures or request internal acknowledgements." /> : (
          <Table>
            <TableHeader><TableRow><TableHead>Signer</TableHead><TableHead>Method</TableHead><TableHead>Document</TableHead><TableHead>Status</TableHead><TableHead>Date</TableHead><TableHead /></TableRow></TableHeader>
            <TableBody>{lifecycle.signatures.map((signature) => {
              const document = contract.documents.find((candidate) => candidate.id === signature.documentId);
              return (
                <TableRow key={signature.id}>
                  <TableCell><div className="font-medium">{signature.signerName}</div><div className="text-xs text-muted-foreground">{[signature.signerTitle, signature.signerEmail].filter(Boolean).join(" · ")}</div>{signature.evidenceNote ? <div className="text-xs text-muted-foreground">{signature.evidenceNote}</div> : null}</TableCell>
                  <TableCell className="text-sm">{METHOD_LABEL[signature.method]}</TableCell>
                  <TableCell className="text-sm">{document ? `${document.title} v${document.version}` : "Whole contract"}</TableCell>
                  <TableCell><Badge variant={signature.status === "SIGNED" ? "default" : "outline"}>{signature.status === "SIGNED" && signature.method === "INTERNAL_ACKNOWLEDGEMENT" ? "Acknowledged" : humanize(signature.status)}</Badge></TableCell>
                  <TableCell className="text-sm">{signature.completedAt ? (signature.method === "RECORDED_EXTERNAL" ? formatDate(signature.completedAt) : formatDateTime(signature.completedAt)) : `Requested ${formatDateTime(signature.requestedAt)}`}</TableCell>
                  <TableCell>
                    {signature.status === "PENDING" ? (
                      <div className="flex justify-end gap-1">
                        {signature.signerUserId === userId ? <AcknowledgementButtons signatureId={signature.id} back={back} /> : null}
                        {canUpdate ? <form action={cancelSignatureAction}><input type="hidden" name="contractId" value={contract.id} /><input type="hidden" name="signatureId" value={signature.id} /><Button type="submit" size="sm" variant="ghost">Cancel</Button></form> : null}
                      </div>
                    ) : null}
                  </TableCell>
                </TableRow>
              );
            })}</TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

export function AcknowledgementButtons({ signatureId, back }: { signatureId: string; back: string }) {
  return (
    <>
      <EntityDialog trigger={<Button size="sm">Acknowledge</Button>} title="Acknowledge this contract" description="You confirm that you have reviewed the contract. This is recorded with the current contract version and document checksum." action={respondAcknowledgementAction} submitLabel="Acknowledge">
        <input type="hidden" name="signatureId" value={signatureId} />
        <input type="hidden" name="response" value="ACKNOWLEDGE" />
        <input type="hidden" name="back" value={back} />
        {field(`ack-note-${signatureId}`, "Note", { name: "note" })}
      </EntityDialog>
      <EntityDialog trigger={<Button size="sm" variant="ghost">Decline</Button>} title="Decline the acknowledgement" action={respondAcknowledgementAction} submitLabel="Decline">
        <input type="hidden" name="signatureId" value={signatureId} />
        <input type="hidden" name="response" value="DECLINE" />
        <input type="hidden" name="back" value={back} />
        {field(`decline-note-${signatureId}`, "Reason", { name: "note", required: true })}
      </EntityDialog>
    </>
  );
}
