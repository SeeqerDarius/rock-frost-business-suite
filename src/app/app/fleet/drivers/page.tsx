import { UserRound, Plus } from "lucide-react";
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
import { listFleetDrivers, listAssignableFleetUsers } from "@/modules/fleet/service";
import { upsertFleetDriver } from "./actions";

const ERROR_MESSAGES: Record<string, string> = {
  forbidden: "You don't have permission to manage drivers.",
  "missing-fields": "Driver name is required.",
  "invalid-input": "Please check that the email and dates are valid.",
};

const STATUS_OPTIONS: Record<string, string> = { ACTIVE: "Active", INACTIVE: "Inactive", SUSPENDED: "Suspended" };

function toDateInputValue(date: Date | null) {
  return date ? date.toISOString().slice(0, 10) : "";
}

function DriverFields({ driver, users }: { driver?: { name: string; licenceNumber: string | null; licenceExpiry: Date | null; phone: string | null; email: string | null; status: string; employmentStartDate: Date | null; userId: string | null }; users: { id: string; name: string | null; email: string }[] }) {
  const idSuffix = driver ? "-edit" : "";
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
      <div className="space-y-2"><Label htmlFor={`userId${idSuffix}`}>Driver login</Label><select id={`userId${idSuffix}`} name="userId" defaultValue={driver?.userId ?? ""} className="h-10 w-full rounded-md border bg-background px-3"><option value="">No login linked</option>{users.map((user) => <option key={user.id} value={user.id}>{user.name || user.email} ({user.email})</option>)}</select><p className="text-xs text-muted-foreground">Invite the driver from Administration with the Driver role, then link the active login here.</p></div>
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
  searchParams: Promise<{ saved?: string; error?: string }>;
}) {
  const { saved, error } = await searchParams;
  const tenant = await requireModuleAccess("fleet");
  const canManage = hasPermission(tenant, PERMISSIONS.FLEET_DRIVERS_MANAGE);
  const [drivers, users] = await Promise.all([listFleetDrivers(tenant.organizationId), listAssignableFleetUsers(tenant.organizationId)]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <PageHeader title="Drivers" description="Drivers assigned to fleet vehicles." />
        {canManage ? (
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

      {drivers.length === 0 ? (
        <EmptyState icon={UserRound} title="No drivers yet" description="Drivers you add will appear here." />
      ) : (
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
                        <Button size="sm" variant="ghost">
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
      )}
    </div>
  );
}
