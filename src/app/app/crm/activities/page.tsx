import { History, Plus } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/feedback/empty-state";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { EntityDialog } from "@/components/forms/entity-dialog";
import { requireModuleAccess } from "@/lib/auth/module-access";
import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import { listActivities, listContacts, listLeads, listDeals } from "@/modules/crm/service";
import { logActivity } from "./actions";

const ERROR_MESSAGES: Record<string, string> = {
  forbidden: "You don't have permission to log activities.",
  "missing-fields": "Type, subject, and date are required.",
  "not-found": "That related contact, lead, or deal could not be found.",
};

const TYPE_LABELS: Record<string, string> = { CALL: "Call", EMAIL: "Email", MEETING: "Meeting", NOTE: "Note", TASK: "Task" };

export default async function CrmActivitiesPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string; error?: string }>;
}) {
  const { saved, error } = await searchParams;
  const tenant = await requireModuleAccess("crm");
  const canLog =
    hasPermission(tenant, PERMISSIONS.CRM_CONTACTS_MANAGE) ||
    hasPermission(tenant, PERMISSIONS.CRM_LEADS_MANAGE) ||
    hasPermission(tenant, PERMISSIONS.CRM_DEALS_MANAGE);

  const [activities, contacts, leads, deals] = await Promise.all([
    listActivities(tenant.organizationId),
    listContacts(tenant.organizationId),
    listLeads(tenant.organizationId),
    listDeals(tenant.organizationId),
  ]);

  const relatedItems: Record<string, string> = {
    "": "None",
    ...Object.fromEntries(contacts.map((c) => [`contact:${c.id}`, `Contact: ${c.fullName}`])),
    ...Object.fromEntries(leads.map((l) => [`lead:${l.id}`, `Lead: ${l.fullName}`])),
    ...Object.fromEntries(deals.map((d) => [`deal:${d.id}`, `Deal: ${d.title}`])),
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <PageHeader title="Activities" description="Calls, emails, meetings, and notes across contacts, leads, and deals." />
        {canLog ? (
          <EntityDialog
            trigger={
              <Button size="sm">
                <Plus />
                Log activity
              </Button>
            }
            title="Log an activity"
            action={logActivity}
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="type">Type</Label>
                <Select name="type" defaultValue="NOTE" items={TYPE_LABELS}>
                  <SelectTrigger id="type" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(TYPE_LABELS).map(([value, label]) => (
                      <SelectItem key={value} value={value}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="occurredAt">Date</Label>
                <Input id="occurredAt" name="occurredAt" type="date" defaultValue={new Date().toISOString().slice(0, 10)} required />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="subject">Subject</Label>
              <Input id="subject" name="subject" required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="relatedTo">Related to</Label>
              <Select name="relatedTo" defaultValue="" items={relatedItems}>
                <SelectTrigger id="relatedTo" className="w-full">
                  <SelectValue placeholder="None" />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(relatedItems).map(([value, label]) => (
                    <SelectItem key={value || "none"} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="notes">Notes</Label>
              <Textarea id="notes" name="notes" rows={3} />
            </div>
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

      {activities.length === 0 ? (
        <EmptyState icon={History} title="No activity yet" description="Calls, emails, meetings, and notes will appear here." />
      ) : (
        <div className="space-y-2">
          {activities.map((activity) => {
            const related = activity.contact?.fullName ?? activity.lead?.fullName ?? activity.deal?.title ?? null;
            return (
              <div key={activity.id} className="flex items-start justify-between gap-4 rounded-lg border p-3">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline">{TYPE_LABELS[activity.type]}</Badge>
                    <p className="text-sm font-medium">{activity.subject}</p>
                  </div>
                  {activity.notes ? <p className="text-sm text-muted-foreground">{activity.notes}</p> : null}
                  <p className="text-xs text-muted-foreground">
                    {activity.occurredAt.toLocaleDateString()}
                    {related ? ` · ${related}` : ""}
                    {activity.createdBy ? ` · logged by ${activity.createdBy.name ?? activity.createdBy.email}` : ""}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
