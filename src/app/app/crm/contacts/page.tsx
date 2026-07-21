import { Users, Plus } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/feedback/empty-state";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { EntityDialog } from "@/components/forms/entity-dialog";
import { requireCurrentTenant } from "@/lib/tenant";
import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import { listContacts, listAssignableUsers } from "@/modules/crm/service";
import { upsertContact } from "./actions";

const ERROR_MESSAGES: Record<string, string> = {
  forbidden: "You don't have permission to manage contacts.",
  "missing-fields": "Full name is required.",
  "not-found": "That owner could not be found.",
};

interface ContactFieldsProps {
  contact?: {
    fullName: string;
    company: string | null;
    email: string | null;
    phone: string | null;
    jobTitle: string | null;
    notes: string | null;
    ownerId: string | null;
  };
  ownerItems: Record<string, string>;
}

function ContactFields({ contact, ownerItems }: ContactFieldsProps) {
  const idSuffix = contact ? "-edit" : "";
  return (
    <>
      <div className="space-y-2">
        <Label htmlFor={`fullName${idSuffix}`}>Full name</Label>
        <Input id={`fullName${idSuffix}`} name="fullName" defaultValue={contact?.fullName} required />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor={`company${idSuffix}`}>Company</Label>
          <Input id={`company${idSuffix}`} name="company" defaultValue={contact?.company ?? ""} />
        </div>
        <div className="space-y-2">
          <Label htmlFor={`jobTitle${idSuffix}`}>Job title</Label>
          <Input id={`jobTitle${idSuffix}`} name="jobTitle" defaultValue={contact?.jobTitle ?? ""} />
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor={`email${idSuffix}`}>Email</Label>
          <Input id={`email${idSuffix}`} name="email" type="email" defaultValue={contact?.email ?? ""} />
        </div>
        <div className="space-y-2">
          <Label htmlFor={`phone${idSuffix}`}>Phone</Label>
          <Input id={`phone${idSuffix}`} name="phone" defaultValue={contact?.phone ?? ""} />
        </div>
      </div>
      <div className="space-y-2">
        <Label htmlFor={`ownerId${idSuffix}`}>Owner</Label>
        <Select name="ownerId" defaultValue={contact?.ownerId ?? ""} items={{ "": "Unassigned", ...ownerItems }}>
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
      <div className="space-y-2">
        <Label htmlFor={`notes${idSuffix}`}>Notes</Label>
        <Textarea id={`notes${idSuffix}`} name="notes" defaultValue={contact?.notes ?? ""} rows={3} />
      </div>
    </>
  );
}

export default async function CrmContactsPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string; error?: string }>;
}) {
  const { saved, error } = await searchParams;
  const tenant = await requireCurrentTenant();
  const canManage = hasPermission(tenant, PERMISSIONS.CRM_CONTACTS_MANAGE);
  const [contacts, users] = await Promise.all([listContacts(tenant.organizationId), listAssignableUsers(tenant.organizationId)]);
  const ownerItems: Record<string, string> = Object.fromEntries(users.map((u) => [u.id, u.name ?? u.email]));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <PageHeader title="Contacts" description="People and companies your organization works with." />
        {canManage ? (
          <EntityDialog
            trigger={
              <Button size="sm">
                <Plus />
                New contact
              </Button>
            }
            title="New contact"
            action={upsertContact}
          >
            <ContactFields ownerItems={ownerItems} />
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

      {contacts.length === 0 ? (
        <EmptyState icon={Users} title="No contacts yet" description="Contacts you add will appear here." />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Company</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Owner</TableHead>
              {canManage ? <TableHead /> : null}
            </TableRow>
          </TableHeader>
          <TableBody>
            {contacts.map((contact) => (
              <TableRow key={contact.id}>
                <TableCell className="font-medium">{contact.fullName}</TableCell>
                <TableCell className="text-muted-foreground">{contact.company ?? "-"}</TableCell>
                <TableCell className="text-muted-foreground">{contact.email ?? "-"}</TableCell>
                <TableCell className="text-muted-foreground">{contact.owner?.name ?? "-"}</TableCell>
                {canManage ? (
                  <TableCell className="text-right">
                    <EntityDialog
                      trigger={
                        <Button size="sm" variant="ghost">
                          Edit
                        </Button>
                      }
                      title="Edit contact"
                      action={upsertContact}
                      submitLabel="Save changes"
                    >
                      <input type="hidden" name="id" value={contact.id} />
                      <ContactFields contact={contact} ownerItems={ownerItems} />
                    </EntityDialog>
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
