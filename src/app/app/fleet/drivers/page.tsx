import Link from "next/link";
import { UserRound, Plus, Mail, CircleAlert, CircleCheck, Search, Lock } from "lucide-react";
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
import { getFleetDriverRosterSummary, type PaymentReadiness } from "@/modules/fleet/driver-obligations";
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

const READINESS_LABELS: Record<PaymentReadiness, string> = {
  current: "Up to date",
  due: "Due",
  overdue: "Overdue",
  "no-obligation": "No obligation",
};

const READINESS_BADGE: Record<PaymentReadiness, "default" | "outline" | "destructive" | "secondary"> = {
  current: "default",
  due: "outline",
  overdue: "destructive",
  "no-obligation": "outline",
};

const SELECT_CLASS = "h-8 w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 py-1 text-base outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 md:text-sm dark:bg-input/30";

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
  searchParams: Promise<{ saved?: string; invited?: string; error?: string; q?: string; readiness?: string; status?: string; maintenance?: string }>;
}) {
  const { saved, invited, error, q, readiness, status, maintenance } = await searchParams;
  const tenant = await requireModuleAccess("fleet");
  const canManage = hasPermission(tenant, PERMISSIONS.FLEET_DRIVERS_MANAGE);
  if (!canManage) {
    return (
      <div className="space-y-6">
        <PageHeader title="Drivers" description="The roster of drivers available for vehicle assignment." />
        <EmptyState icon={Lock} title="You don't have access to this page" description="The driver roster is limited to roles with driver-management permissions." />
      </div>
    );
  }
  const currency = tenant.organization.currency ?? "GHS";
  const [drivers, users, roster] = await Promise.all([
    listFleetDrivers(tenant.organizationId),
    listAssignableDriverUsers(tenant.organizationId),
    getFleetDriverRosterSummary(tenant.organizationId),
  ]);
  const rosterById = new Map(roster.map((entry) => [entry.driverId, entry]));

  const activeCount = drivers.filter((driver) => driver.status === "ACTIVE").length;
  const linkedCount = drivers.filter((driver) => driver.userId).length;
  const overdueCount = roster.filter((entry) => entry.paymentReadiness === "overdue").length;
  const pendingSubmissionCount = roster.reduce((sum, entry) => sum + entry.pendingSubmissionCount, 0);

  const searchTerm = (q ?? "").trim().toLowerCase();
  const filteredDrivers = drivers.filter((driver) => {
    const entry = rosterById.get(driver.id);
    if (status && driver.status !== status) return false;
    if (readiness && entry?.paymentReadiness !== readiness) return false;
    if (maintenance === "open" && !(entry && entry.openMaintenanceCount > 0)) return false;
    if (searchTerm) {
      const haystack = [driver.name, ...(entry?.vehiclePlates ?? [])].join(" ").toLowerCase();
      if (!haystack.includes(searchTerm)) return false;
    }
    return true;
  });
  const hasActiveFilter = Boolean(q || readiness || status || maintenance);

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
              description="Sends an activation link to this email with the Driver role. The roster entry links and becomes active automatically once they accept."
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

      <section aria-label="Driver roster summary" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <div className="rounded-xl border bg-card p-4"><p className="text-sm text-muted-foreground">Total drivers</p><p className="mt-1 text-2xl font-semibold">{drivers.length}</p></div>
        <div className="rounded-xl border bg-card p-4"><p className="text-sm text-muted-foreground">Active</p><p className="mt-1 text-2xl font-semibold">{activeCount}</p></div>
        <div className="rounded-xl border bg-card p-4"><p className="text-sm text-muted-foreground">Workspace access</p><p className="mt-1 text-2xl font-semibold">{linkedCount}<span className="text-sm font-normal text-muted-foreground"> / {drivers.length}</span></p></div>
        <Link href="/app/fleet/drivers?readiness=overdue" className="rounded-xl border bg-card p-4 transition-colors hover:border-destructive/40"><p className="text-sm text-muted-foreground">Overdue</p><p className="mt-1 text-2xl font-semibold text-destructive">{overdueCount}</p></Link>
        <Link href="/app/fleet/payments" className="rounded-xl border bg-card p-4 transition-colors hover:border-primary/40"><p className="text-sm text-muted-foreground">Pending verification</p><p className="mt-1 text-2xl font-semibold">{pendingSubmissionCount}</p></Link>
      </section>

      <form method="GET" className="flex flex-wrap items-end gap-3 rounded-xl border bg-card p-4">
        <div className="w-56 space-y-1.5">
          <Label htmlFor="q">Search</Label>
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
            <input id="q" name="q" type="search" defaultValue={q ?? ""} placeholder="Name or plate" className={`${SELECT_CLASS} pl-8`} />
          </div>
        </div>
        <div className="w-48 space-y-1.5">
          <Label htmlFor="readiness">Payment readiness</Label>
          <select id="readiness" name="readiness" defaultValue={readiness ?? ""} className={SELECT_CLASS}>
            <option value="">Any</option>
            {Object.entries(READINESS_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </div>
        <div className="w-40 space-y-1.5">
          <Label htmlFor="status">Status</Label>
          <select id="status" name="status" defaultValue={status ?? ""} className={SELECT_CLASS}>
            <option value="">Any</option>
            {Object.entries(STATUS_OPTIONS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </div>
        <div className="w-44 space-y-1.5">
          <Label htmlFor="maintenance">Maintenance</Label>
          <select id="maintenance" name="maintenance" defaultValue={maintenance ?? ""} className={SELECT_CLASS}>
            <option value="">Any</option>
            <option value="open">Needs attention</option>
          </select>
        </div>
        <Button type="submit" size="sm">Filter</Button>
        {hasActiveFilter ? <Button type="button" size="sm" variant="ghost" nativeButton={false} render={<Link href="/app/fleet/drivers" />}>Clear</Button> : null}
      </form>

      {drivers.length === 0 ? (
        <EmptyState icon={UserRound} title="No drivers yet" description="Drivers you add will appear here." />
      ) : filteredDrivers.length === 0 ? (
        <EmptyState icon={Search} title="No drivers match these filters" description="Try a different search term or clear the filters above." />
      ) : (
        <div className="overflow-x-auto rounded-xl border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Vehicle</TableHead>
              <TableHead>Payment readiness</TableHead>
              <TableHead className="hidden md:table-cell">Current obligation</TableHead>
              <TableHead className="hidden lg:table-cell">Pending</TableHead>
              <TableHead className="hidden lg:table-cell">Work & Pay</TableHead>
              <TableHead className="hidden xl:table-cell">Maintenance</TableHead>
              <TableHead className="hidden md:table-cell">Login</TableHead>
              {canManage ? <TableHead /> : null}
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredDrivers.map((driver) => {
              const entry = rosterById.get(driver.id);
              return (
                <TableRow key={driver.id}>
                  <TableCell className="font-medium">
                    {driver.name}
                    <div className="mt-0.5 text-xs font-normal text-muted-foreground md:hidden">{driver.user?.email ?? "No login"}</div>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{entry?.vehiclePlates.length ? entry.vehiclePlates.join(", ") : "Unassigned"}</TableCell>
                  <TableCell>
                    {entry ? <Badge variant={READINESS_BADGE[entry.paymentReadiness]}>{READINESS_LABELS[entry.paymentReadiness]}</Badge> : null}
                  </TableCell>
                  <TableCell className="hidden text-muted-foreground md:table-cell">
                    {entry && entry.paymentReadiness !== "no-obligation" ? (
                      <>
                        {currency} {(entry.currentObligation + entry.overdueAmount).toFixed(2)}
                        {entry.overdueAmount > 0 ? <span className="ml-1 text-xs text-destructive">({currency} {entry.overdueAmount.toFixed(2)} overdue)</span> : null}
                      </>
                    ) : "-"}
                  </TableCell>
                  <TableCell className="hidden lg:table-cell">
                    {entry && entry.pendingSubmissionCount > 0 ? (
                      <Link href="/app/fleet/payments" className="text-primary underline underline-offset-2">{entry.pendingSubmissionCount} pending</Link>
                    ) : <span className="text-muted-foreground">-</span>}
                  </TableCell>
                  <TableCell className="hidden text-muted-foreground lg:table-cell">
                    {entry?.hasActiveWorkAndPay ? `${(entry.workAndPayProgress ?? 0).toFixed(0)}% complete` : "-"}
                  </TableCell>
                  <TableCell className="hidden xl:table-cell">
                    {entry && entry.openMaintenanceCount > 0 ? <Badge variant="secondary">{entry.openMaintenanceCount} open</Badge> : <span className="text-muted-foreground">-</span>}
                  </TableCell>
                  <TableCell className="hidden text-muted-foreground md:table-cell">{driver.user?.email ?? "Not linked"}</TableCell>
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
              );
            })}
          </TableBody>
        </Table>
        </div>
      )}
    </div>
  );
}
