import { Users, Plus } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/feedback/empty-state";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { EntityDialog } from "@/components/forms/entity-dialog";
import { requireModuleAccess } from "@/lib/auth/module-access";
import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import { listAssignableFleetUsers, listFleetOwnersWithPortfolio } from "@/modules/fleet/service";
import { upsertFleetOwner } from "./actions";

const ERROR_MESSAGES: Record<string, string> = {
  forbidden: "You don't have permission to manage owners.",
  "missing-fields": "Owner name is required.",
  "invalid-input": "Please check that the email is valid.",
};

export default async function FleetOwnersPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string; error?: string }>;
}) {
  const { saved, error } = await searchParams;
  const tenant = await requireModuleAccess("fleet");
  const canManage = hasPermission(tenant, PERMISSIONS.FLEET_OWNERS_MANAGE);
  const [owners, users] = await Promise.all([
    listFleetOwnersWithPortfolio(tenant.organizationId),
    listAssignableFleetUsers(tenant.organizationId),
  ]);
  const userItems = Object.fromEntries(users.map((user) => [user.id, `${user.name ?? user.email} (${user.email})`]));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <PageHeader title="Owners" description="Vehicle owners, linked portal access, assigned vehicles, and verified revenue." />
        {canManage ? (
          <EntityDialog
            trigger={
              <Button size="sm">
                <Plus />
                New owner
              </Button>
            }
            title="New owner"
            action={upsertFleetOwner}
          >
            <div className="space-y-2">
              <Label htmlFor="name">Name</Label>
              <Input id="name" name="name" required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="businessName">Business name</Label>
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
            <div className="space-y-2">
              <Label htmlFor="userId">Owner portal login (optional)</Label>
              <Select name="userId" items={userItems}>
                <SelectTrigger id="userId" className="w-full"><SelectValue placeholder="Link an organization user" /></SelectTrigger>
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

      {owners.length === 0 ? (
        <EmptyState icon={Users} title="No owners yet" description="Vehicle owners you add will appear here." />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Business</TableHead>
              <TableHead>Phone</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Vehicles</TableHead>
              <TableHead>Verified revenue</TableHead>
              {canManage ? <TableHead /> : null}
            </TableRow>
          </TableHeader>
          <TableBody>
            {owners.map((owner) => (
              <TableRow key={owner.id}>
                <TableCell className="font-medium">{owner.name}</TableCell>
                <TableCell className="text-muted-foreground">{owner.businessName ?? "-"}</TableCell>
                <TableCell className="text-muted-foreground">{owner.phone ?? "-"}</TableCell>
                <TableCell className="text-muted-foreground">{owner.email ?? "-"}</TableCell>
                <TableCell className="text-muted-foreground">
                  <details>
                    <summary className="cursor-pointer">{owner.vehicleCount}</summary>
                    <div className="mt-2 min-w-44 space-y-1 rounded-md border bg-popover p-3 text-xs shadow-sm">
                      {owner.vehicles.length === 0 ? "No vehicles assigned" : owner.vehicles.map((vehicle) => <p key={vehicle.id}>{vehicle.plateNumber}. {vehicle.assetTag}</p>)}
                    </div>
                  </details>
                </TableCell>
                <TableCell className="text-muted-foreground">{tenant.organization.currency ?? "GHS"} {owner.revenue.toFixed(2)}</TableCell>
                {canManage ? (
                  <TableCell className="text-right">
                    <EntityDialog
                      trigger={
                        <Button size="sm" variant="ghost">
                          Edit
                        </Button>
                      }
                      title="Edit owner"
                      action={upsertFleetOwner}
                      submitLabel="Save changes"
                    >
                      <input type="hidden" name="id" value={owner.id} />
                      <div className="space-y-2">
                        <Label htmlFor={`name-${owner.id}`}>Name</Label>
                        <Input id={`name-${owner.id}`} name="name" defaultValue={owner.name} required />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor={`businessName-${owner.id}`}>Business name</Label>
                        <Input id={`businessName-${owner.id}`} name="businessName" defaultValue={owner.businessName ?? ""} />
                      </div>
                      <div className="grid gap-4 sm:grid-cols-2">
                        <div className="space-y-2">
                          <Label htmlFor={`phone-${owner.id}`}>Phone</Label>
                          <Input id={`phone-${owner.id}`} name="phone" defaultValue={owner.phone ?? ""} />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor={`email-${owner.id}`}>Email</Label>
                          <Input id={`email-${owner.id}`} name="email" type="email" defaultValue={owner.email ?? ""} />
                        </div>
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor={`userId-${owner.id}`}>Owner portal login</Label>
                        <Select name="userId" items={userItems} defaultValue={owner.userId ?? undefined}>
                          <SelectTrigger id={`userId-${owner.id}`} className="w-full"><SelectValue placeholder="Link an organization user" /></SelectTrigger>
                          <SelectContent>{Object.entries(userItems).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent>
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
