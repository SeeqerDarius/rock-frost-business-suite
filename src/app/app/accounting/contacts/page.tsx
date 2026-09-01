import { Contact, Plus, Upload } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/feedback/empty-state";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { EntityDialog } from "@/components/forms/entity-dialog";
import { requireModuleAccess } from "@/lib/auth/module-access";
import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import { listContacts } from "@/modules/accounting/service";
import { upsertContact, importContactsCsvAction } from "./actions";

const ERROR_MESSAGES: Record<string, string> = {
  forbidden: "You don't have permission to manage contacts.",
  "invalid-input": "Please check that the name and email are valid.",
  "not-found": "That contact could not be found.",
  "missing-file": "Choose a CSV file to import.",
  "file-too-large": "That file is larger than 1 MB.",
  "invalid-csv": "That file could not be read as CSV.",
  "unrecognized-columns": "Couldn't find a name column in that file's header row.",
  "no-valid-rows": "No valid rows were found in that file.",
};

const TYPE_LABELS: Record<string, string> = { CUSTOMER: "Customer", SUPPLIER: "Supplier", BOTH: "Customer and supplier" };
const TYPE_BADGE: Record<string, "default" | "secondary" | "outline"> = { CUSTOMER: "default", SUPPLIER: "secondary", BOTH: "outline" };

function ContactFields({ contact }: { contact?: { id: string; type: string; name: string; email: string | null; phone: string | null; address: string | null; taxIdentificationNumber: string | null } }) {
  const idSuffix = contact ? `-${contact.id}` : "";
  return (
    <>
      {contact ? <input type="hidden" name="id" value={contact.id} /> : null}
      <div className="space-y-2">
        <Label htmlFor={`name${idSuffix}`}>Name</Label>
        <Input id={`name${idSuffix}`} name="name" defaultValue={contact?.name} required />
      </div>
      <div className="space-y-2">
        <Label htmlFor={`type${idSuffix}`}>Type</Label>
        <Select name="type" defaultValue={contact?.type ?? "CUSTOMER"} items={TYPE_LABELS}>
          <SelectTrigger id={`type${idSuffix}`} className="w-full">
            <SelectValue placeholder="Select a type" />
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
        <Label htmlFor={`taxIdentificationNumber${idSuffix}`}>TIN (Ghana Tax Identification Number)</Label>
        <Input id={`taxIdentificationNumber${idSuffix}`} name="taxIdentificationNumber" defaultValue={contact?.taxIdentificationNumber ?? ""} />
      </div>
      <div className="space-y-2">
        <Label htmlFor={`address${idSuffix}`}>Address</Label>
        <Textarea id={`address${idSuffix}`} name="address" rows={2} defaultValue={contact?.address ?? ""} />
      </div>
    </>
  );
}

export default async function AccountingContactsPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string; imported?: string; skipped?: string; error?: string }>;
}) {
  const { saved, imported, skipped, error } = await searchParams;
  const tenant = await requireModuleAccess("accounting");
  const canManage = hasPermission(tenant, PERMISSIONS.ACCOUNTING_CONTACTS_MANAGE);
  const contacts = await listContacts(tenant.organizationId);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <PageHeader title="Contacts" description="Customers and suppliers you invoice and bill, shared across invoices, bills, and credit notes." />
        {canManage ? (
          <div className="flex gap-2">
            <EntityDialog trigger={<Button size="sm" variant="outline"><Upload />Import CSV</Button>} title="Import contacts from CSV" description="A CSV with a name column and, optionally, type/email/phone/address/TIN columns. A row whose email matches an existing contact is skipped." action={importContactsCsvAction}>
              <Input type="file" name="file" accept=".csv,text/csv" required />
            </EntityDialog>
            <EntityDialog trigger={<Button size="sm"><Plus />New contact</Button>} title="New contact" action={upsertContact}>
              <ContactFields />
            </EntityDialog>
          </div>
        ) : null}
      </div>

      {saved ? (
        <div className="rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-600 dark:text-emerald-400">
          Saved.
          {imported !== undefined ? ` Imported ${imported} contact${imported === "1" ? "" : "s"}.${Number(skipped) > 0 ? ` Skipped ${skipped} duplicate or invalid row${skipped === "1" ? "" : "s"}.` : ""}` : ""}
        </div>
      ) : null}
      {error && ERROR_MESSAGES[error] ? (
        <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {ERROR_MESSAGES[error]}
        </div>
      ) : null}

      {contacts.length === 0 ? (
        <EmptyState icon={Contact} title="No contacts yet" description="Customers and suppliers you add will appear here." />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Phone</TableHead>
              <TableHead>TIN</TableHead>
              {canManage ? <TableHead /> : null}
            </TableRow>
          </TableHeader>
          <TableBody>
            {contacts.map((contact) => (
              <TableRow key={contact.id}>
                <TableCell className="font-medium">{contact.name}</TableCell>
                <TableCell>
                  <Badge variant={TYPE_BADGE[contact.type]}>{TYPE_LABELS[contact.type]}</Badge>
                </TableCell>
                <TableCell className="text-muted-foreground">{contact.email ?? "-"}</TableCell>
                <TableCell className="text-muted-foreground">{contact.phone ?? "-"}</TableCell>
                <TableCell className="text-muted-foreground">{contact.taxIdentificationNumber ?? "-"}</TableCell>
                {canManage ? (
                  <TableCell className="text-right">
                    <EntityDialog trigger={<Button size="sm" variant="ghost">Edit</Button>} title="Edit contact" action={upsertContact} submitLabel="Save changes">
                      <ContactFields contact={contact} />
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
