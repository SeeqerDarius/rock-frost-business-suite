import Link from "next/link";
import { notFound } from "next/navigation";
import { Download, FileUp, History, Lock, Pencil, Plus, ShieldCheck, TriangleAlert, Trash2 } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/feedback/empty-state";
import { EntityDialog } from "@/components/forms/entity-dialog";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { requireModuleAccess } from "@/lib/auth/module-access";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { createOrganizationFormatter } from "@/lib/org-format";
import { cn } from "@/lib/utils";
import { daysUntil } from "@/modules/contracts/rules";
import { actorFromTenant, compareContractVersions, ContractNotFoundError, getContractDetail, getContractFormOptions } from "@/modules/contracts/service";
import {
  addAccessGrantAction,
  addPartyAction,
  attachClauseAction,
  changeContractStatusAction,
  detachClauseAction,
  removeAccessGrantAction,
  removeDocumentAction,
  removePartyAction,
} from "../actions";
import { ContractsFlash, ContractStatusBadge, humanize, RiskBadge, SELECT_CLASS } from "../_components/shared";
import { UploadDocumentDialog } from "../_components/upload-document-dialog";

export const metadata = { title: "Contract" };

const TABS = ["overview", "parties", "documents", "clauses", "versions", "access"] as const;
type Tab = (typeof TABS)[number];
const PARTY_ROLES = ["CLIENT", "VENDOR", "BUYER", "SELLER", "CONTRACTOR", "EMPLOYEE", "EMPLOYER", "PARTNER", "SERVICE_PROVIDER", "LANDLORD", "TENANT", "OWNER", "GUARANTOR", "WITNESS", "OTHER"];
const DOCUMENT_TYPES = ["PRIMARY", "SUPPORTING", "AMENDMENT", "ADDENDUM", "SCHEDULE", "EXHIBIT", "EVIDENCE", "CERTIFICATE", "OTHER"];

export default async function ContractDetailPage({ params, searchParams }: { params: Promise<{ contractId: string }>; searchParams: Promise<{ tab?: string; saved?: string; error?: string; from?: string; to?: string }> }) {
  const tenant = await requireModuleAccess("contracts");
  const actor = actorFromTenant(tenant);
  if (!actor.permissions.includes(PERMISSIONS.CONTRACTS_VIEW)) {
    return <EmptyState icon={Lock} title="You don't have access to contracts" description="Ask an administrator for a Contract Management role." />;
  }
  const { contractId } = await params;
  const search = await searchParams;
  const tab: Tab = (TABS as readonly string[]).includes(search.tab ?? "") ? (search.tab as Tab) : "overview";
  let detail;
  try {
    detail = await getContractDetail(actor, contractId);
  } catch (caught) {
    if (caught instanceof ContractNotFoundError) notFound();
    throw caught;
  }
  const { contract, versions, missingRequiredClauses, canViewFinancials } = detail;
  const format = createOrganizationFormatter(tenant.organization);
  const can = (key: string) => actor.permissions.includes(key);
  const editable = ["DRAFT", "PENDING_APPROVAL", "APPROVED", "ACTIVE"].includes(contract.status);
  const canEdit = can(PERMISSIONS.CONTRACTS_UPDATE) && editable;
  const canManageAccess = contract.ownerId === tenant.userId || can(PERMISSIONS.CONTRACTS_VIEW_CONFIDENTIAL);
  const options = tab === "clauses" || tab === "access" || tab === "parties" ? await getContractFormOptions(tenant.organizationId) : null;
  const fromVersion = Number(search.from);
  const toVersion = Number(search.to);
  const comparison = tab === "versions" && Number.isInteger(fromVersion) && Number.isInteger(toVersion) && fromVersion !== toVersion ? await compareContractVersions(actor, contract.id, Math.min(fromVersion, toVersion), Math.max(fromVersion, toVersion)).catch(() => null) : null;
  const days = daysUntil(contract.expirationDate);
  const date = (value: Date | null) => (value ? format.date(value.toISOString().slice(0, 10) + "T12:00:00Z") : "Not set");
  const activeDocuments = contract.documents.filter((document) => !document.removedAt);
  const latestByKey = new Map<string, string>();
  for (const document of activeDocuments) if (!latestByKey.has(`${document.documentType}|${document.title}`)) latestByKey.set(`${document.documentType}|${document.title}`, document.id);
  const memberName = (id: string | null) => options?.members.find((member) => member.id === id)?.name ?? options?.members.find((member) => member.id === id)?.email ?? id;
  const roleName = (id: string | null) => options?.roles.find((role) => role.id === id)?.name ?? id;

  const statusForm = (action: string, label: string, opts: { variant?: "default" | "outline" | "destructive"; reason?: boolean; description?: string } = {}) => (
    <EntityDialog trigger={<Button size="sm" variant={opts.variant ?? "outline"}>{label}</Button>} title={`${label} ${contract.contractNumber}?`} description={opts.description} action={changeContractStatusAction} submitLabel={label}>
      <input type="hidden" name="contractId" value={contract.id} />
      <input type="hidden" name="action" value={action} />
      <div className="space-y-1.5"><Label htmlFor={`reason-${action}`} required={opts.reason}>Reason</Label><Input id={`reason-${action}`} name="reason" required={opts.reason} /></div>
    </EntityDialog>
  );

  return (
    <div className="space-y-6">
      <nav aria-label="Breadcrumb" className="text-sm text-muted-foreground"><Link href="/app/contracts/list" className="hover:text-foreground">Contracts</Link><span className="px-1.5">/</span><span className="text-foreground">{contract.contractNumber}</span></nav>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-2">
          <PageHeader title={contract.title} description={`${contract.contractNumber} · ${contract.counterpartyName}`} />
          <div className="flex flex-wrap items-center gap-2">
            <ContractStatusBadge status={contract.status} />
            <RiskBadge level={contract.riskLevel} />
            {contract.confidentiality !== "STANDARD" ? <Badge variant="outline" className="gap-1"><ShieldCheck className="size-3" />{humanize(contract.confidentiality)}</Badge> : null}
            <Badge variant="secondary">Version {contract.currentVersion}</Badge>
            {contract.tags.map((tag) => <Badge key={tag} variant="outline">{tag}</Badge>)}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {canEdit ? <Button size="sm" nativeButton={false} render={<Link href={`/app/contracts/${contract.id}/edit`} />}><Pencil />Edit</Button> : null}
          {can(PERMISSIONS.CONTRACTS_UPDATE) && ["DRAFT", "APPROVED"].includes(contract.status) ? statusForm("ACTIVATE", "Activate", { variant: "default", description: "The contract becomes active. Approval workflows, when configured, will gate this step." }) : null}
          {can(PERMISSIONS.CONTRACTS_UPDATE) && contract.status === "ACTIVE" && days !== null && days < 0 ? statusForm("MARK_EXPIRED", "Mark expired") : null}
          {can(PERMISSIONS.CONTRACTS_UPDATE) && ["DRAFT", "PENDING_APPROVAL", "APPROVED"].includes(contract.status) ? statusForm("CANCEL", "Cancel", { reason: true, description: "Cancelled contracts are kept with their history." }) : null}
          {can(PERMISSIONS.CONTRACTS_DELETE) && ["DRAFT", "CANCELLED", "EXPIRED", "TERMINATED"].includes(contract.status) ? statusForm("ARCHIVE", "Archive", { reason: true, description: "Archiving hides the contract from active lists. Nothing is deleted and it can be restored." }) : null}
          {can(PERMISSIONS.CONTRACTS_DELETE) && contract.status === "ARCHIVED" ? statusForm("RESTORE", "Restore") : null}
        </div>
      </div>

      <ContractsFlash saved={search.saved} error={search.error} />
      {contract.status === "ACTIVE" && days !== null && days <= 30 ? (
        <Alert variant={days < 0 ? "destructive" : "default"}><TriangleAlert /><AlertTitle>{days < 0 ? `Expired ${-days} days ago` : `Expires in ${days} days`}</AlertTitle><AlertDescription>{contract.renewalType === "AUTO_RENEWAL" ? "This contract renews automatically unless notice is given." : "Decide whether to renew, renegotiate, or let it lapse."}{contract.noticePeriodDays ? ` Notice period: ${contract.noticePeriodDays} days.` : ""}</AlertDescription></Alert>
      ) : null}
      {missingRequiredClauses.length ? <Alert><TriangleAlert /><AlertTitle>Required clauses not attached</AlertTitle><AlertDescription>{missingRequiredClauses.map((clause) => clause.name).join(", ")}. Your organization marks these clauses as required.</AlertDescription></Alert> : null}

      <nav aria-label="Contract sections" className="flex flex-wrap gap-1 border-b">
        {TABS.map((item) => <Link key={item} href={`?tab=${item}`} aria-current={item === tab ? "page" : undefined} className={cn("rounded-t-md px-3 py-2 text-sm", item === tab ? "border-b-2 border-primary font-medium text-foreground" : "text-muted-foreground hover:text-foreground")}>{humanize(item)}{item === "parties" ? ` (${contract.parties.length})` : item === "documents" ? ` (${activeDocuments.length})` : item === "clauses" ? ` (${contract.clauses.length})` : ""}</Link>)}
      </nav>

      {tab === "overview" ? (
        <div className="grid gap-4 lg:grid-cols-3">
          <Card className="lg:col-span-2">
            <CardHeader><CardTitle>Details</CardTitle></CardHeader>
            <CardContent>
              <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
                {[
                  ["Category", contract.category?.name ?? "Uncategorized"], ["Type", contract.type?.name ?? "Not specified"],
                  ["Owner", contract.owner?.name ?? contract.owner?.email ?? "Unassigned"], ["Department", contract.department ?? "Not set"],
                  ["Branch", contract.branch?.name ?? "Organization-wide"], ["Language", contract.language ?? "Not set"],
                  ["Start date", date(contract.startDate)], ["Effective date", date(contract.effectiveDate)],
                  ["Expiration date", date(contract.expirationDate)], ["Renewal", `${humanize(contract.renewalType)}${contract.renewalDate ? `, ${date(contract.renewalDate)}` : ""}`],
                  ["Notice period", contract.noticePeriodDays !== null ? `${contract.noticePeriodDays} days` : "Not set"], ["Governing law", contract.governingLaw ?? "Not set"],
                  ["Governing jurisdiction", contract.governingJurisdiction ?? "Not set"], ["Template", contract.template ? `${contract.template.name} v${contract.templateVersion}` : "None"],
                ].map(([label, value]) => <div key={label}><dt className="text-muted-foreground">{label}</dt><dd className="font-medium">{value}</dd></div>)}
              </dl>
              {contract.description ? <p className="mt-4 whitespace-pre-wrap text-sm">{contract.description}</p> : null}
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>Commercial terms</CardTitle><CardDescription>{canViewFinancials ? `In ${contract.currency}.` : "Hidden for your role."}</CardDescription></CardHeader>
            <CardContent>
              {canViewFinancials ? (
                <dl className="space-y-3 text-sm">
                  <div><dt className="text-muted-foreground">Contract value</dt><dd className="text-2xl font-semibold tabular-nums">{contract.value ? format.money(contract.value.toString(), contract.currency) : "Not set"}</dd></div>
                  <div><dt className="text-muted-foreground">Payment terms</dt><dd className="font-medium">{contract.paymentTerms ?? "Not set"}</dd></div>
                  <div><dt className="text-muted-foreground">Billing frequency</dt><dd className="font-medium">{contract.billingFrequency ?? "Not set"}</dd></div>
                  <div><dt className="text-muted-foreground">Tax treatment</dt><dd className="font-medium">{contract.taxTreatment ?? "Not set"}</dd></div>
                </dl>
              ) : <p className="text-sm text-muted-foreground">Requires contract financial access.</p>}
            </CardContent>
          </Card>
          {contract.body ? <Card className="lg:col-span-3"><CardHeader><CardTitle>Contract text</CardTitle></CardHeader><CardContent><pre className="max-h-[32rem] overflow-auto whitespace-pre-wrap rounded-md bg-muted/40 p-4 text-sm">{contract.body}</pre></CardContent></Card> : null}
          {contract.notes ? <Card className="lg:col-span-3"><CardHeader><CardTitle>Internal notes</CardTitle></CardHeader><CardContent><p className="whitespace-pre-wrap text-sm">{contract.notes}</p></CardContent></Card> : null}
        </div>
      ) : null}

      {tab === "parties" ? (
        <Card>
          <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3">
            <div><CardTitle>Parties</CardTitle><CardDescription>Everyone bound by or witnessing the contract.</CardDescription></div>
            {canEdit ? (
              <EntityDialog trigger={<Button size="sm"><Plus />Add party</Button>} title="Add party" action={addPartyAction} contentClassName="sm:max-w-xl">
                <input type="hidden" name="contractId" value={contract.id} />
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5"><Label htmlFor="p-name" required>Name</Label><Input id="p-name" name="name" required /></div>
                  <div className="space-y-1.5"><Label htmlFor="p-role" required>Role</Label><select id="p-role" name="role" className={SELECT_CLASS}>{PARTY_ROLES.map((role) => <option key={role} value={role}>{humanize(role)}</option>)}</select></div>
                  <div className="space-y-1.5"><Label htmlFor="p-custom">Custom role</Label><Input id="p-custom" name="customRole" placeholder="When the role is Other" /></div>
                  <div className="space-y-1.5"><Label htmlFor="p-legal">Legal name</Label><Input id="p-legal" name="legalName" /></div>
                  <div className="space-y-1.5"><Label htmlFor="p-email">Email</Label><Input id="p-email" name="email" type="email" /></div>
                  <div className="space-y-1.5"><Label htmlFor="p-phone">Phone</Label><Input id="p-phone" name="phone" /></div>
                  <div className="space-y-1.5"><Label htmlFor="p-tax">Tax ID</Label><Input id="p-tax" name="taxId" /></div>
                  <div className="space-y-1.5"><Label htmlFor="p-reg">Registration number</Label><Input id="p-reg" name="registrationNumber" /></div>
                  <div className="space-y-1.5"><Label htmlFor="p-sig">Signatory</Label><Input id="p-sig" name="signatoryName" /></div>
                  <div className="space-y-1.5"><Label htmlFor="p-sigt">Signatory title</Label><Input id="p-sigt" name="signatoryTitle" /></div>
                </div>
                <div className="space-y-1.5"><Label htmlFor="p-address">Address</Label><Input id="p-address" name="address" /></div>
                <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="isPrimary" className="size-4" />Primary party</label>
              </EntityDialog>
            ) : null}
          </CardHeader>
          <CardContent>
            {contract.parties.length === 0 ? <EmptyState icon={Plus} title="No parties recorded" description="Add the parties to this contract." /> : (
              <Table>
                <TableHeader><TableRow><TableHead>Party</TableHead><TableHead>Role</TableHead><TableHead>Contact</TableHead><TableHead>Identifiers</TableHead><TableHead>Signatory</TableHead>{canEdit ? <TableHead /> : null}</TableRow></TableHeader>
                <TableBody>{contract.parties.map((party) => (
                  <TableRow key={party.id}>
                    <TableCell><div className="font-medium">{party.name}{party.isPrimary ? <Badge variant="secondary" className="ml-2">Primary</Badge> : null}</div>{party.legalName ? <div className="text-xs text-muted-foreground">{party.legalName}</div> : null}</TableCell>
                    <TableCell>{party.role === "OTHER" ? party.customRole : humanize(party.role)}</TableCell>
                    <TableCell className="text-sm">{party.email ?? "-"}{party.phone ? <div className="text-xs text-muted-foreground">{party.phone}</div> : null}</TableCell>
                    <TableCell className="text-xs">{[party.taxId && `Tax ${party.taxId}`, party.registrationNumber && `Reg ${party.registrationNumber}`].filter(Boolean).join(" · ") || "-"}</TableCell>
                    <TableCell className="text-sm">{party.signatoryName ? `${party.signatoryName}${party.signatoryTitle ? `, ${party.signatoryTitle}` : ""}` : "-"}</TableCell>
                    {canEdit ? <TableCell className="text-right"><form action={removePartyAction}><input type="hidden" name="contractId" value={contract.id} /><input type="hidden" name="partyId" value={party.id} /><Button size="sm" variant="ghost" aria-label={`Remove ${party.name}`}><Trash2 /></Button></form></TableCell> : null}
                  </TableRow>
                ))}</TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      ) : null}

      {tab === "documents" ? (
        <Card>
          <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3">
            <div><CardTitle>Documents</CardTitle><CardDescription>Private files, available only to people who can see this contract. Uploading a file with the same type and title creates a new version; earlier versions are kept. Up to 4 MB per file.</CardDescription></div>
            {can(PERMISSIONS.CONTRACTS_UPDATE) ? (
              <UploadDocumentDialog contractId={contract.id} documentTypes={DOCUMENT_TYPES.map((type) => ({ value: type, label: humanize(type) }))} defaultType={activeDocuments.length ? "SUPPORTING" : "PRIMARY"} />
            ) : null}
          </CardHeader>
          <CardContent>
            {contract.documents.length === 0 ? <EmptyState icon={FileUp} title="No documents yet" description="Upload the signed contract and supporting documents." /> : (
              <Table>
                <TableHeader><TableRow><TableHead>Document</TableHead><TableHead>Type</TableHead><TableHead>Version</TableHead><TableHead>Uploaded</TableHead><TableHead>Checksum</TableHead><TableHead /></TableRow></TableHeader>
                <TableBody>{contract.documents.map((document) => {
                  const isLatest = latestByKey.get(`${document.documentType}|${document.title}`) === document.id;
                  return (
                    <TableRow key={document.id} className={document.removedAt ? "text-muted-foreground" : ""}>
                      <TableCell><div className="font-medium">{document.title}</div><div className="text-xs text-muted-foreground">{document.fileAsset.fileName} · {(document.fileAsset.size / 1024).toFixed(0)} KB</div>{document.removedAt ? <div className="text-xs text-destructive">Removed: {document.removalReason}</div> : null}</TableCell>
                      <TableCell>{humanize(document.documentType)}</TableCell>
                      <TableCell>v{document.version}{isLatest && !document.removedAt ? <Badge variant="secondary" className="ml-2">Current</Badge> : null}</TableCell>
                      <TableCell className="text-sm">{format.dateTime(document.createdAt)}<div className="text-xs text-muted-foreground">{document.uploadedBy?.name ?? document.uploadedBy?.email ?? ""}</div></TableCell>
                      <TableCell className="font-mono text-xs" title={document.checksumSha256}>{document.checksumSha256.slice(0, 12)}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button size="sm" variant="ghost" nativeButton={false} render={<a href={`/api/contracts/documents/${document.id}`} />}><Download />Download</Button>
                          {can(PERMISSIONS.CONTRACTS_UPDATE) && !document.removedAt ? (
                            <EntityDialog trigger={<Button size="sm" variant="ghost">Remove</Button>} title={`Remove ${document.title} v${document.version}?`} description="The file is kept for audit; it is marked removed and hidden from current documents." action={removeDocumentAction} submitLabel="Remove">
                              <input type="hidden" name="contractId" value={contract.id} />
                              <input type="hidden" name="documentId" value={document.id} />
                              <div className="space-y-1.5"><Label htmlFor={`rm-${document.id}`} required>Reason</Label><Input id={`rm-${document.id}`} name="reason" required /></div>
                            </EntityDialog>
                          ) : null}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}</TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      ) : null}

      {tab === "clauses" ? (
        <Card>
          <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3">
            <div><CardTitle>Clauses</CardTitle><CardDescription>Approved clause versions attached to this contract. A later clause version does not change this contract.</CardDescription></div>
            {canEdit && options?.clauses.length ? (
              <form action={attachClauseAction} className="flex items-end gap-2">
                <input type="hidden" name="contractId" value={contract.id} />
                <select name="clauseId" className={SELECT_CLASS} aria-label="Clause to attach">{options.clauses.filter((clause) => !contract.clauses.some((link) => link.clauseId === clause.id)).map((clause) => <option key={clause.id} value={clause.id}>{clause.name} ({clause.code} v{clause.version}, {clause.usage.toLowerCase()})</option>)}</select>
                <Button size="sm" type="submit"><Plus />Attach</Button>
              </form>
            ) : null}
          </CardHeader>
          <CardContent className="space-y-3">
            {contract.clauses.length === 0 ? <EmptyState icon={Plus} title="No clauses attached" description="Attach approved clauses from your library." /> : contract.clauses.map((link) => (
              <details key={link.id} className="rounded-lg border p-3">
                <summary className="flex cursor-pointer flex-wrap items-center justify-between gap-2"><span className="font-medium">{link.clause.name}</span><span className="flex items-center gap-2 text-xs text-muted-foreground">{link.clause.code} v{link.clause.version} · {link.clause.category}<Badge variant="outline">{humanize(link.clause.usage)}</Badge></span></summary>
                <p className="mt-3 whitespace-pre-wrap text-sm">{link.clause.body}</p>
                {canEdit ? <form action={detachClauseAction} className="mt-2"><input type="hidden" name="contractId" value={contract.id} /><input type="hidden" name="linkId" value={link.id} /><Button size="sm" variant="ghost">Remove from contract</Button></form> : null}
              </details>
            ))}
          </CardContent>
        </Card>
      ) : null}

      {tab === "versions" ? (
        <div className="space-y-4">
          <Card>
            <CardHeader><CardTitle>Compare versions</CardTitle><CardDescription>See exactly which fields changed between two versions.</CardDescription></CardHeader>
            <CardContent>
              <form method="get" className="flex flex-wrap items-end gap-2">
                <input type="hidden" name="tab" value="versions" />
                <div className="space-y-1.5"><Label htmlFor="from">From</Label><select id="from" name="from" defaultValue={String(search.from ?? Math.max(contract.currentVersion - 1, 1))} className={SELECT_CLASS}>{versions.map((version) => <option key={version.id} value={version.version}>v{version.version}</option>)}</select></div>
                <div className="space-y-1.5"><Label htmlFor="to">To</Label><select id="to" name="to" defaultValue={String(search.to ?? contract.currentVersion)} className={SELECT_CLASS}>{versions.map((version) => <option key={version.id} value={version.version}>v{version.version}</option>)}</select></div>
                <Button type="submit" variant="outline">Compare</Button>
              </form>
              {comparison ? (
                Object.keys(comparison).length === 0 ? <p className="mt-4 text-sm text-muted-foreground">No field differences.</p> : (
                  <Table className="mt-4">
                    <TableHeader><TableRow><TableHead>Field</TableHead><TableHead>From</TableHead><TableHead>To</TableHead></TableRow></TableHeader>
                    <TableBody>{Object.entries(comparison).map(([field, change]) => <TableRow key={field}><TableCell className="font-medium">{field}</TableCell><TableCell className="max-w-xs truncate text-sm">{String((change as { from: unknown }).from ?? "empty")}</TableCell><TableCell className="max-w-xs truncate text-sm">{String((change as { to: unknown }).to ?? "empty")}</TableCell></TableRow>)}</TableBody>
                  </Table>
                )
              ) : null}
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>Version history</CardTitle><CardDescription>Every significant change creates a version. History is never edited.</CardDescription></CardHeader>
            <CardContent>
              <ol className="space-y-3">
                {versions.map((version) => (
                  <li key={version.id} className="flex gap-3 rounded-lg border p-3">
                    <History className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                    <div className="min-w-0 space-y-1 text-sm">
                      <div><span className="font-medium">Version {version.version}</span> <span className="text-muted-foreground">· {format.dateTime(version.createdAt)} · {version.changedBy?.name ?? version.changedBy?.email ?? "System"}</span></div>
                      {version.reason ? <div>Reason: {version.reason}</div> : null}
                      {version.changedFields.length ? <div className="flex flex-wrap gap-1">{version.changedFields.map((field) => <Badge key={field} variant="outline">{field}</Badge>)}</div> : null}
                    </div>
                  </li>
                ))}
              </ol>
            </CardContent>
          </Card>
        </div>
      ) : null}

      {tab === "access" ? (
        <Card>
          <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3">
            <div><CardTitle>Access</CardTitle><CardDescription>{contract.confidentiality === "STANDARD" ? "Standard contracts are visible to everyone with Contract Management access. Grants here apply when the contract is made confidential or restricted." : "Visible to the creator, the owner, and the grants below. Organization-wide confidential access applies only if enabled in Contract Settings, and never to restricted contracts."}</CardDescription></div>
            {canManageAccess && options ? (
              <EntityDialog trigger={<Button size="sm"><Plus />Grant access</Button>} title="Grant access" action={addAccessGrantAction}>
                <input type="hidden" name="contractId" value={contract.id} />
                <div className="space-y-1.5"><Label htmlFor="g-target" required>Grant to</Label>
                  <select id="g-target" name="target" className={SELECT_CLASS}>
                    <optgroup label="People">{options.members.map((member) => <option key={member.id} value={`user:${member.id}`}>{member.name ?? member.email}</option>)}</optgroup>
                    <optgroup label="Roles">{options.roles.map((role) => <option key={role.id} value={`role:${role.id}`}>{role.name}</option>)}</optgroup>
                    <option value="department:">A department (enter below)</option>
                  </select>
                </div>
                <div className="space-y-1.5"><Label htmlFor="g-dept">Department</Label><Input id="g-dept" name="department" placeholder="Matches the HR employee department" /></div>
              </EntityDialog>
            ) : null}
          </CardHeader>
          <CardContent>
            <dl className="mb-4 grid gap-3 text-sm sm:grid-cols-3">
              <div><dt className="text-muted-foreground">Confidentiality</dt><dd className="font-medium">{humanize(contract.confidentiality)}</dd></div>
              <div><dt className="text-muted-foreground">Creator</dt><dd className="font-medium">{contract.createdBy?.name ?? contract.createdBy?.email ?? "-"}</dd></div>
              <div><dt className="text-muted-foreground">Owner</dt><dd className="font-medium">{contract.owner?.name ?? contract.owner?.email ?? "-"}</dd></div>
            </dl>
            {contract.accessGrants.length === 0 ? <p className="text-sm text-muted-foreground">No additional access granted.</p> : (
              <Table>
                <TableHeader><TableRow><TableHead>Granted to</TableHead><TableHead>Granted</TableHead>{canManageAccess ? <TableHead /> : null}</TableRow></TableHeader>
                <TableBody>{contract.accessGrants.map((grant) => (
                  <TableRow key={grant.id}>
                    <TableCell>{grant.userId ? `Person: ${memberName(grant.userId)}` : grant.roleId ? `Role: ${roleName(grant.roleId)}` : `Department: ${grant.department}`}</TableCell>
                    <TableCell className="text-sm">{format.dateTime(grant.createdAt)}</TableCell>
                    {canManageAccess ? <TableCell className="text-right"><form action={removeAccessGrantAction}><input type="hidden" name="contractId" value={contract.id} /><input type="hidden" name="grantId" value={grant.id} /><Button size="sm" variant="ghost">Revoke</Button></form></TableCell> : null}
                  </TableRow>
                ))}</TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
