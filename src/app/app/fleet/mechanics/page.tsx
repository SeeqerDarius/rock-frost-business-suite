import { Hammer, Plus } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/feedback/empty-state";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { EntityDialog } from "@/components/forms/entity-dialog";
import { requireModuleAccess } from "@/lib/auth/module-access";
import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import { listAssignableMechanicUsers, listFleetMechanics } from "@/modules/fleet/service";
import { upsertFleetMechanic } from "./actions";

const ERROR_MESSAGES: Record<string, string> = {
  forbidden: "You don't have permission to manage mechanics.",
  "missing-fields": "Mechanic name is required.",
  "invalid-input": "Please check that the email is valid.",
};

export default async function FleetMechanicsPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string; error?: string }>;
}) {
  const { saved, error } = await searchParams;
  const tenant = await requireModuleAccess("fleet");
  const canManage = hasPermission(tenant, PERMISSIONS.FLEET_MECHANICS_MANAGE);
  const [mechanics, users] = await Promise.all([
    listFleetMechanics(tenant.organizationId),
    listAssignableMechanicUsers(tenant.organizationId),
  ]);
  const userItems = Object.fromEntries(users.map((user) => [user.id, `${user.name ?? user.email} (${user.email})`]));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <PageHeader title="Mechanics" description="The roster of mechanics and workshops available for maintenance assignment." />
        {canManage ? (
          <EntityDialog
            trigger={
              <Button size="sm">
                <Plus />
                New mechanic
              </Button>
            }
            title="New mechanic"
            action={upsertFleetMechanic}
          >
            <div className="space-y-2">
              <Label htmlFor="name">Name</Label>
              <Input id="name" name="name" required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="businessName">Workshop / business name</Label>
              <Input id="businessName" name="businessName" />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="phone">Phone</Label>
                <Input id="phone" name="phone" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input id="email" name="email" type="email" />
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="location">Location</Label>
                <Input id="location" name="location" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="specialty">Specialty</Label>
                <Input id="specialty" name="specialty" placeholder="e.g. Electrical, Bodywork" />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="userId">Mechanic portal login (optional)</Label>
              <Select name="userId" items={userItems}>
                <SelectTrigger id="userId" className="w-full"><SelectValue placeholder="Link an organization user with the Mechanic role" /></SelectTrigger>
                <SelectContent>{Object.entries(userItems).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent>
              </Select>
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

      {mechanics.length === 0 ? (
        <EmptyState icon={Hammer} title="No mechanics yet" description="Mechanics and workshops you add will appear here, ready for maintenance assignment." />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Workshop</TableHead>
              <TableHead>Phone</TableHead>
              <TableHead>Specialty</TableHead>
              <TableHead>Status</TableHead>
              {canManage ? <TableHead /> : null}
            </TableRow>
          </TableHeader>
          <TableBody>
            {mechanics.map((mechanic) => (
              <TableRow key={mechanic.id}>
                <TableCell className="font-medium">{mechanic.name}</TableCell>
                <TableCell className="text-muted-foreground">{mechanic.businessName ?? "-"}</TableCell>
                <TableCell className="text-muted-foreground">{mechanic.phone ?? "-"}</TableCell>
                <TableCell className="text-muted-foreground">{mechanic.specialty ?? "-"}</TableCell>
                <TableCell>
                  <Badge variant={mechanic.status === "ACTIVE" ? "default" : "secondary"}>{mechanic.status === "ACTIVE" ? "Active" : "Inactive"}</Badge>
                </TableCell>
                {canManage ? (
                  <TableCell className="text-right">
                    <EntityDialog
                      trigger={
                        <Button size="sm" variant="ghost">
                          Edit
                        </Button>
                      }
                      title="Edit mechanic"
                      action={upsertFleetMechanic}
                      submitLabel="Save changes"
                    >
                      <input type="hidden" name="id" value={mechanic.id} />
                      <div className="space-y-2">
                        <Label htmlFor={`name-${mechanic.id}`}>Name</Label>
                        <Input id={`name-${mechanic.id}`} name="name" defaultValue={mechanic.name} required />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor={`businessName-${mechanic.id}`}>Workshop / business name</Label>
                        <Input id={`businessName-${mechanic.id}`} name="businessName" defaultValue={mechanic.businessName ?? ""} />
                      </div>
                      <div className="grid gap-4 sm:grid-cols-2">
                        <div className="space-y-2">
                          <Label htmlFor={`phone-${mechanic.id}`}>Phone</Label>
                          <Input id={`phone-${mechanic.id}`} name="phone" defaultValue={mechanic.phone ?? ""} />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor={`email-${mechanic.id}`}>Email</Label>
                          <Input id={`email-${mechanic.id}`} name="email" type="email" defaultValue={mechanic.email ?? ""} />
                        </div>
                      </div>
                      <div className="grid gap-4 sm:grid-cols-2">
                        <div className="space-y-2">
                          <Label htmlFor={`location-${mechanic.id}`}>Location</Label>
                          <Input id={`location-${mechanic.id}`} name="location" defaultValue={mechanic.location ?? ""} />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor={`specialty-${mechanic.id}`}>Specialty</Label>
                          <Input id={`specialty-${mechanic.id}`} name="specialty" defaultValue={mechanic.specialty ?? ""} />
                        </div>
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor={`userId-${mechanic.id}`}>Mechanic portal login</Label>
                        <Select name="userId" items={userItems} defaultValue={mechanic.userId ?? undefined}>
                          <SelectTrigger id={`userId-${mechanic.id}`} className="w-full"><SelectValue placeholder="Link an organization user with the Mechanic role" /></SelectTrigger>
                          <SelectContent>{Object.entries(userItems).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor={`status-${mechanic.id}`}>Status</Label>
                        <Select name="status" items={{ ACTIVE: "Active", INACTIVE: "Inactive" }} defaultValue={mechanic.status}>
                          <SelectTrigger id={`status-${mechanic.id}`} className="w-full"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="ACTIVE">Active</SelectItem>
                            <SelectItem value="INACTIVE">Inactive</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
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
