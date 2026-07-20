import { Target, Plus } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/feedback/empty-state";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { EntityDialog } from "@/components/forms/entity-dialog";
import { requireCurrentTenant } from "@/lib/tenant";
import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import { listLeads, listLeadSources, listAssignableUsers } from "@/modules/crm/service";
import { upsertLead, convertLead } from "./actions";

const ERROR_MESSAGES: Record<string, string> = {
  forbidden: "You don't have permission to manage leads.",
  "missing-fields": "Please fill in all required fields.",
  "already-converted": "This lead has already been converted to a deal.",
};

const STATUS_BADGE: Record<string, "default" | "outline" | "destructive" | "secondary"> = {
  NEW: "outline",
  CONTACTED: "secondary",
  QUALIFIED: "secondary",
  DISQUALIFIED: "destructive",
  CONVERTED: "default",
};

interface LeadFieldsProps {
  lead?: { fullName: string; company: string | null; email: string | null; phone: string | null; source: string | null; notes: string | null; ownerId: string | null };
  sourceItems: Record<string, string>;
  ownerItems: Record<string, string>;
}

function LeadFields({ lead, sourceItems, ownerItems }: LeadFieldsProps) {
  const idSuffix = lead ? "-edit" : "";
  return (
    <>
      <div className="space-y-2">
        <Label htmlFor={`fullName${idSuffix}`}>Full name</Label>
        <Input id={`fullName${idSuffix}`} name="fullName" defaultValue={lead?.fullName} required />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor={`company${idSuffix}`}>Company</Label>
          <Input id={`company${idSuffix}`} name="company" defaultValue={lead?.company ?? ""} />
        </div>
        <div className="space-y-2">
          <Label htmlFor={`source${idSuffix}`}>Source</Label>
          {Object.keys(sourceItems).length > 0 ? (
            <Select name="source" defaultValue={lead?.source ?? undefined} items={sourceItems}>
              <SelectTrigger id={`source${idSuffix}`} className="w-full">
                <SelectValue placeholder="Select a source" />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(sourceItems).map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <Input id={`source${idSuffix}`} name="source" defaultValue={lead?.source ?? ""} placeholder="e.g. Referral, Website" />
          )}
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor={`email${idSuffix}`}>Email</Label>
          <Input id={`email${idSuffix}`} name="email" type="email" defaultValue={lead?.email ?? ""} />
        </div>
        <div className="space-y-2">
          <Label htmlFor={`phone${idSuffix}`}>Phone</Label>
          <Input id={`phone${idSuffix}`} name="phone" defaultValue={lead?.phone ?? ""} />
        </div>
      </div>
      <div className="space-y-2">
        <Label htmlFor={`ownerId${idSuffix}`}>Owner</Label>
        <Select name="ownerId" defaultValue={lead?.ownerId ?? ""} items={{ "": "Unassigned", ...ownerItems }}>
          <SelectTrigger id={`ownerId${idSuffix}`} className="w-full">
            <SelectValue placeholder="Unassigned" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="">Unassigned</SelectItem>
            {Object.entries(ownerItems).map(([value, label]) => (
              <SelectItem key={value} value={value}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </>
  );
}

export default async function CrmLeadsPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string; error?: string }>;
}) {
  const { saved, error } = await searchParams;
  const tenant = await requireCurrentTenant();
  const canManage = hasPermission(tenant, PERMISSIONS.CRM_LEADS_MANAGE);
  const canConvert = canManage && hasPermission(tenant, PERMISSIONS.CRM_DEALS_MANAGE);
  const [leads, sources, users] = await Promise.all([
    listLeads(tenant.organizationId),
    listLeadSources(tenant.organizationId),
    listAssignableUsers(tenant.organizationId),
  ]);
  const sourceItems: Record<string, string> = Object.fromEntries(sources.filter((s) => s.active).map((s) => [s.name, s.name]));
  const ownerItems: Record<string, string> = Object.fromEntries(users.map((u) => [u.id, u.name ?? u.email]));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <PageHeader title="Leads" description="Unqualified interest, before it becomes a deal." />
        {canManage ? (
          <EntityDialog
            trigger={
              <Button size="sm">
                <Plus />
                New lead
              </Button>
            }
            title="New lead"
            action={upsertLead}
          >
            <LeadFields sourceItems={sourceItems} ownerItems={ownerItems} />
          </EntityDialog>
        ) : null}
      </div>

      {saved ? (
        <div className="rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-600 dark:text-emerald-400">
          Saved.
        </div>
      ) : null}
      {error && ERROR_MESSAGES[error] ? (
        <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {ERROR_MESSAGES[error]}
        </div>
      ) : null}

      {leads.length === 0 ? (
        <EmptyState icon={Target} title="No leads yet" description="Leads you add will appear here." />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Company</TableHead>
              <TableHead>Source</TableHead>
              <TableHead>Status</TableHead>
              {canManage ? <TableHead /> : null}
            </TableRow>
          </TableHeader>
          <TableBody>
            {leads.map((lead) => (
              <TableRow key={lead.id}>
                <TableCell className="font-medium">{lead.fullName}</TableCell>
                <TableCell className="text-muted-foreground">{lead.company ?? "—"}</TableCell>
                <TableCell className="text-muted-foreground">{lead.source ?? "—"}</TableCell>
                <TableCell>
                  <Badge variant={STATUS_BADGE[lead.status]}>{lead.status}</Badge>
                </TableCell>
                {canManage ? (
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      {canConvert && lead.status !== "CONVERTED" ? (
                        <EntityDialog
                          trigger={
                            <Button size="sm" variant="ghost">
                              Convert to deal
                            </Button>
                          }
                          title={`Convert "${lead.fullName}" to a deal`}
                          action={convertLead}
                          submitLabel="Convert"
                        >
                          <input type="hidden" name="leadId" value={lead.id} />
                          <div className="space-y-2">
                            <Label htmlFor={`deal-title-${lead.id}`}>Deal title</Label>
                            <Input id={`deal-title-${lead.id}`} name="title" defaultValue={`${lead.fullName}${lead.company ? ` — ${lead.company}` : ""}`} required />
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor={`deal-value-${lead.id}`}>Estimated value</Label>
                            <Input id={`deal-value-${lead.id}`} name="value" type="number" step="0.01" defaultValue="0" required />
                          </div>
                        </EntityDialog>
                      ) : null}
                      <EntityDialog
                        trigger={
                          <Button size="sm" variant="ghost">
                            Edit
                          </Button>
                        }
                        title="Edit lead"
                        action={upsertLead}
                        submitLabel="Save changes"
                      >
                        <input type="hidden" name="id" value={lead.id} />
                        <LeadFields lead={lead} sourceItems={sourceItems} ownerItems={ownerItems} />
                      </EntityDialog>
                    </div>
                  </TableCell>
                ) : null}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
