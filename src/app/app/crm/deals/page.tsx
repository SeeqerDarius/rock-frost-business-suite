import { Handshake, Plus } from "lucide-react";
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
import { listDeals, listContacts, listAssignableUsers } from "@/modules/crm/service";
import { upsertDeal, changeDealStage } from "./actions";

const ERROR_MESSAGES: Record<string, string> = {
  forbidden: "You don't have permission to manage deals.",
  "missing-fields": "A deal title is required.",
  "not-found": "That contact or owner could not be found.",
};

const STAGE_LABELS: Record<string, string> = {
  NEW: "New",
  QUALIFIED: "Qualified",
  PROPOSAL: "Proposal",
  NEGOTIATION: "Negotiation",
  WON: "Won",
  LOST: "Lost",
};

const STAGE_BADGE: Record<string, "default" | "outline" | "destructive" | "secondary"> = {
  NEW: "outline",
  QUALIFIED: "secondary",
  PROPOSAL: "secondary",
  NEGOTIATION: "secondary",
  WON: "default",
  LOST: "destructive",
};

const NEXT_STAGE: Record<string, string | null> = {
  NEW: "QUALIFIED",
  QUALIFIED: "PROPOSAL",
  PROPOSAL: "NEGOTIATION",
  NEGOTIATION: "WON",
  WON: null,
  LOST: null,
};

interface DealFieldsProps {
  deal?: { title: string; contactId: string | null; value: string; expectedCloseDate: Date | null; ownerId: string | null; notes: string | null };
  contactItems: Record<string, string>;
  ownerItems: Record<string, string>;
}

function DealFields({ deal, contactItems, ownerItems }: DealFieldsProps) {
  const idSuffix = deal ? "-edit" : "";
  return (
    <>
      <div className="space-y-2">
        <Label htmlFor={`title${idSuffix}`}>Title</Label>
        <Input id={`title${idSuffix}`} name="title" defaultValue={deal?.title} required />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor={`value${idSuffix}`}>Value</Label>
          <Input id={`value${idSuffix}`} name="value" type="number" step="0.01" defaultValue={deal?.value ?? "0"} required />
        </div>
        <div className="space-y-2">
          <Label htmlFor={`expectedCloseDate${idSuffix}`}>Expected close</Label>
          <Input
            id={`expectedCloseDate${idSuffix}`}
            name="expectedCloseDate"
            type="date"
            defaultValue={deal?.expectedCloseDate ? deal.expectedCloseDate.toISOString().slice(0, 10) : ""}
          />
        </div>
      </div>
      <div className="space-y-2">
        <Label htmlFor={`contactId${idSuffix}`}>Contact</Label>
        <Select name="contactId" defaultValue={deal?.contactId ?? ""} items={{ "": "None", ...contactItems }}>
          <SelectTrigger id={`contactId${idSuffix}`} className="w-full">
            <SelectValue placeholder="None" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="">None</SelectItem>
            {Object.entries(contactItems).map(([value, label]) => (
              <SelectItem key={value} value={value}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-2">
        <Label htmlFor={`ownerId${idSuffix}`}>Owner</Label>
        <Select name="ownerId" defaultValue={deal?.ownerId ?? ""} items={{ "": "Unassigned", ...ownerItems }}>
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

export default async function CrmDealsPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string; error?: string }>;
}) {
  const { saved, error } = await searchParams;
  const tenant = await requireCurrentTenant();
  const canManage = hasPermission(tenant, PERMISSIONS.CRM_DEALS_MANAGE);
  const [deals, contacts, users] = await Promise.all([
    listDeals(tenant.organizationId),
    listContacts(tenant.organizationId),
    listAssignableUsers(tenant.organizationId),
  ]);
  const contactItems: Record<string, string> = Object.fromEntries(contacts.map((c) => [c.id, c.fullName]));
  const ownerItems: Record<string, string> = Object.fromEntries(users.map((u) => [u.id, u.name ?? u.email]));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <PageHeader title="Deals" description="Qualified opportunities moving through the pipeline." />
        {canManage ? (
          <EntityDialog
            trigger={
              <Button size="sm">
                <Plus />
                New deal
              </Button>
            }
            title="New deal"
            action={upsertDeal}
          >
            <DealFields contactItems={contactItems} ownerItems={ownerItems} />
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

      {deals.length === 0 ? (
        <EmptyState icon={Handshake} title="No deals yet" description="Deals you create will appear here." />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Title</TableHead>
              <TableHead>Contact</TableHead>
              <TableHead>Value</TableHead>
              <TableHead>Stage</TableHead>
              {canManage ? <TableHead /> : null}
            </TableRow>
          </TableHeader>
          <TableBody>
            {deals.map((deal) => {
              const nextStage = NEXT_STAGE[deal.stage];
              const isOpen = deal.stage !== "WON" && deal.stage !== "LOST";
              return (
                <TableRow key={deal.id}>
                  <TableCell className="font-medium">{deal.title}</TableCell>
                  <TableCell className="text-muted-foreground">{deal.contact?.fullName ?? "—"}</TableCell>
                  <TableCell className="text-muted-foreground">{Number(deal.value).toFixed(2)}</TableCell>
                  <TableCell>
                    <Badge variant={STAGE_BADGE[deal.stage]}>{STAGE_LABELS[deal.stage]}</Badge>
                  </TableCell>
                  {canManage ? (
                    <TableCell className="text-right">
                      <div className="flex flex-wrap justify-end gap-1">
                        {isOpen && nextStage ? (
                          <form action={changeDealStage}>
                            <input type="hidden" name="id" value={deal.id} />
                            <input type="hidden" name="stage" value={nextStage} />
                            <Button type="submit" size="sm" variant="ghost">
                              Move to {STAGE_LABELS[nextStage]}
                            </Button>
                          </form>
                        ) : null}
                        {isOpen ? (
                          <form action={changeDealStage}>
                            <input type="hidden" name="id" value={deal.id} />
                            <input type="hidden" name="stage" value="LOST" />
                            <Button type="submit" size="sm" variant="ghost">
                              Mark lost
                            </Button>
                          </form>
                        ) : null}
                        <EntityDialog
                          trigger={
                            <Button size="sm" variant="ghost">
                              Edit
                            </Button>
                          }
                          title="Edit deal"
                          action={upsertDeal}
                          submitLabel="Save changes"
                        >
                          <input type="hidden" name="id" value={deal.id} />
                          <DealFields deal={{ ...deal, value: deal.value.toString() }} contactItems={contactItems} ownerItems={ownerItems} />
                        </EntityDialog>
                      </div>
                    </TableCell>
                  ) : null}
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
