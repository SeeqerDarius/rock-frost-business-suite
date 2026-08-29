import { UserRound, Plus, Mail, CircleAlert, CircleCheck } from "lucide-react";
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
import { listFleetDrivers, listAssignableDriverUsers } from "@/modules/fleet/service";
import { upsertFleetDriver, inviteFleetDriver } from "./actions";

const ERROR_MESSAGES: Record<string, string> = {
  forbidden: "You don't have permission to manage drivers.",
  "missing-fields": "Driver name is required.",
  "invalid-input": "Please check that the email and dates are valid.",
  "role-unavailable": "The Driver role isn't available for this organization yet.",
  "platform-owner": "That email belongs to a platform account and can't be invited.",
  "seat-limit": "No available seats for the Driver role. Free up a seat or upgrade your plan.",
  "delivery-failed": "The driver was added but the invitation email failed to send. Use Resend from Administration.",
  "login-linked": "That login is already linked to another driver profile.",
};

const STATUS_OPTIONS: Record<string, string> = { ACTIVE: "Active", INACTIVE: "Inactive", SUSPENDED: "Suspended" };

function toDateInputValue(date: Date | null) {
  return date ? date.toISOString().slice(0, 10) : "";
}

function DriverFields({ driver, users }: { driver?: { id: string; name: string; licenceNumber: string | null; licenceExpiry: Date | null; phone: string | null; email: string | null; status: string; employmentStartDate: Date | null; userId: string | null }; users: { id: string; name: string | null; email: string; linkedDriverId: string | null }[] }) {
  const idSuffix = driver ? "-edit" : "";
  const availableUsers = users.filter((user) => !user.linkedDriverId || user.linkedDriverId === driver?.id);
  return (
    <>
      <div className="space-y-2">
        <Label htmlFor={`name${idSuffix}`}>Name</Label>
        <Input id={`name${idSuffix}`} name="name" defaultValue={driver?.name} required />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor={`licenceNumber${idSuffix}`}>Licence number</Label>
          <Input id={`licenceNumber${idSuffix}`} name="licenceNumber" defaultValue={driver?.licenceNumber ?? ""} />
        </div>
        <div className="space-y-2">
          <Label htmlFor={`licenceExpiry${idSuffix}`}>Licence expiry</Label>
          <Input id={`licenceExpiry${idSuffix}`} name="licenceExpiry" type="date" defaultValue={toDateInputValue(driver?.licenceExpiry ?? null)} />
        </div>
      </div>
      <div className="space-y-2"><Label htmlFor={`userId${idSuffix}`}>Workspace login</Label><select id={`userId${idSuffix}`} name="userId" defaultValue={driver?.userId ?? ""} className="h-11 w-full rounded-md border bg-background px-3"><option value="">No login linked</option>{availableUsers.map((user) => <option key={user.id} value={user.id}>{user.name || user.email} ({user.email})</option>)}</select><p className="text-xs text-muted-foreground">Link one active Driver-role member. Logins already used by another driver are hidden.</p></div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor={`phone${idSuffix}`}>Phone</Label>
          <Input id={`phone${idSuffix}`} name="phone" defaultValue={driver?.phone ?? ""} />
        </div>
        <div className="space-y-2">
          <Label htmlFor={`email${idSuffix}`}>Email</Label>
          <Input id={`email${idSuffix}`} name="email" type="email" defaultValue={driver?.email ?? ""} />
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor={`status${idSuffix}`}>Status</Label>
          <Select name="status" defaultValue={driver?.status ?? "ACTIVE"} items={STATUS_OPTIONS}>
            <SelectTrigger id={`status${idSuffix}`} className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(STATUS_OPTIONS).map(([value, label]) => (
                <SelectItem key={value} value={value}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor={`employmentStartDate${idSuffix}`}>Employment start</Label>
          <Input
            id={`employmentStartDate${idSuffix}`}
            name="employmentStartDate"
            type="date"
            defaultValue={toDateInputValue(driver?.employmentStartDate ?? null)}
          />
        </div>
      </div>
    </>
  );
}

export default async function FleetDriversPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string; invited?: string; error?: string }>;
}) {
  const { saved, invited, error } = await searchParams;
  const tenant = await requireModuleAccess("fleet");
  const canManage = hasPermission(tenant, PERMISSIONS.FLEET_DRIVERS_MANAGE);
  const [drivers, users] = await Promise.all([listFleetDrivers(tenant.organizationId), listAssignableDriverUsers(tenant.organizationId)]);
  const activeCount = drivers.filter((driver) => driver.status === "ACTIVE").length;
  const linkedCount = drivers.filter((driver) => driver.userId).length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <PageHeader title="Drivers" description="Manage driver records, workspace access, and operational readiness." />
        {canManage ? (
          <div className="flex gap-2">
            <EntityDialog
              trigger={
                <Button size="sm" variant="outline">
                  <Mail />
                  Invite driver
                </Button>
              }
              title="Invite driver"
              description="Sends an activation link to this email with the Driver role. The roster entry links and becomes active automatically once they sign in."
              action={inviteFleetDriver}
            >
              <div className="space-y-2">
                <Label htmlFor="invite-name">Name</Label>
                <Input id="invite-name" name="name" required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="invite-email">Email</Label>
                <Input id="invite-email" name="email" type="email" required />
              </div>
            </EntityDialog>
            <EntityDialog
              trigger={
                <Button size="sm">
                  <Plus />
                  New driver
                </Button>
              }
              title="New driver"
              action={upsertFleetDriver}
            >
              <DriverFields users={users} />
            </EntityDialog>
          </div>
        ) : null}
      </div>

      {saved ? (
        <div className="rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-600 dark:text-emerald-400">
          <span className="flex items-center gap-2"><CircleCheck className="size-4" aria-hidden="true" />Driver saved.</span>
        </div>
      ) : null}
      {invited ? (
        <div className="rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-600 dark:text-emerald-400">
          Invitation sent. The driver will appear here once they accept.
        </div>
      ) : null}
      {error && ERROR_MESSAGES[error] ? (
        <div role="alert" className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          <span className="flex items-center gap-2"><CircleAlert className="size-4" aria-hidden="true" />{ERROR_MESSAGES[error]}</span>
        </div>
      ) : null}

      <section aria-label="Driver roster summary" className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl border bg-card p-4"><p className="text-sm text-muted-foreground">Total drivers</p><p className="mt-1 text-2xl font-semibold">{drivers.length}</p></div>
        <div className="rounded-xl border bg-card p-4"><p className="text-sm text-muted-foreground">Active</p><p className="mt-1 text-2xl font-semibold">{activeCount}</p></div>
        <div className="rounded-xl border bg-card p-4"><p className="text-sm text-muted-foreground">Workspace access</p><p className="mt-1 text-2xl font-semibold">{linkedCount}<span className="text-sm font-normal text-muted-foreground"> / {drivers.length}</span></p></div>
      </section>

      {drivers.length === 0 ? (
        <EmptyState icon={UserRound} title="No drivers yet" description="Drivers you add will appear here." />
      ) : (
        <div className="overflow-x-auto rounded-xl border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Licence</TableHead>
              <TableHead>Phone</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Login</TableHead>
              {canManage ? <TableHead /> : null}
            </TableRow>
          </TableHeader>
          <TableBody>
            {drivers.map((driver) => (
              <TableRow key={driver.id}>
                <TableCell className="font-medium">{driver.name}</TableCell>
                <TableCell className="text-muted-foreground">{driver.licenceNumber ?? "-"}</TableCell>
                <TableCell className="text-muted-foreground">{driver.phone ?? "-"}</TableCell>
                <TableCell>
                  <Badge variant={driver.status === "ACTIVE" ? "default" : "outline"}>{STATUS_OPTIONS[driver.status]}</Badge>
                </TableCell>
                <TableCell className="text-muted-foreground">{driver.user?.email ?? "Not linked"}</TableCell>
                {canManage ? (
                  <TableCell className="text-right">
                    <EntityDialog
                      trigger={
                        <Button className="min-h-10" size="sm" variant="ghost">
                          Edit
                        </Button>
                      }
                      title="Edit driver"
                      action={upsertFleetDriver}
                      submitLabel="Save changes"
                    >
                      <input type="hidden" name="id" value={driver.id} />
                      <DriverFields driver={driver} users={users} />
                    </EntityDialog>
                  </TableCell>
                ) : null}
              </TableRow>
            ))}
          </TableBody>
        </Table>
        </div>
      )}
    </div>
  );
}
