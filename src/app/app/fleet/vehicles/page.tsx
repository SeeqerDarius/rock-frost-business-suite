import { Truck, Plus } from "lucide-react";
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
import { listFleetVehicles, listFleetOwners, listFleetDrivers } from "@/modules/fleet/service";
import { MakeLogo } from "@/components/fleet/make-logo";
import { VehicleMakeModelFields } from "./vehicle-make-model-fields";
import { upsertFleetVehicle } from "./actions";

const ERROR_MESSAGES: Record<string, string> = {
  forbidden: "You don't have permission to manage vehicles.",
  "missing-fields": "Asset tag and plate number are required.",
  duplicate: "A vehicle with that asset tag or plate number already exists.",
  "not-found": "That owner or driver could not be found.",
  "invalid-target": "Choose Daily or Weekly and enter a remittance amount greater than zero, or select No required remittance.",
};

const STATUS_OPTIONS: Record<string, string> = {
  AVAILABLE: "Available",
  ASSIGNED: "Assigned",
  MAINTENANCE: "In maintenance",
  INACTIVE: "Inactive",
  RETIRED: "Retired",
};

const STATUS_BADGE_VARIANT: Record<string, "default" | "outline" | "destructive" | "secondary"> = {
  AVAILABLE: "default",
  ASSIGNED: "secondary",
  MAINTENANCE: "outline",
  INACTIVE: "outline",
  RETIRED: "destructive",
};

const SALES_TARGET_OPTIONS: Record<string, string> = {
  NONE: "No required remittance",
  DAILY: "Daily remittance",
  WEEKLY: "Weekly remittance",
};

interface VehicleFieldsProps {
  vehicle?: {
    assetTag: string;
    plateNumber: string;
    type: string | null;
    make: string | null;
    model: string | null;
    year: number | null;
    ownerId: string | null;
    assignedDriverId: string | null;
    status: string;
    mileage: number | null;
    location: string | null;
    salesTargetPeriod: string | null;
    salesTargetAmount: string | null;
  };
  owners: { id: string; name: string }[];
  drivers: { id: string; name: string }[];
}

function VehicleFields({ vehicle, owners, drivers }: VehicleFieldsProps) {
  const idSuffix = vehicle ? "-edit" : "";
  const ownerItems: Record<string, string> = { "": "No owner", ...Object.fromEntries(owners.map((o) => [o.id, o.name])) };
  const driverItems: Record<string, string> = { "": "Unassigned", ...Object.fromEntries(drivers.map((d) => [d.id, d.name])) };

  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor={`assetTag${idSuffix}`}>Asset tag</Label>
          <Input id={`assetTag${idSuffix}`} name="assetTag" defaultValue={vehicle?.assetTag} required />
        </div>
        <div className="space-y-2">
          <Label htmlFor={`plateNumber${idSuffix}`}>Plate number</Label>
          <Input id={`plateNumber${idSuffix}`} name="plateNumber" defaultValue={vehicle?.plateNumber} required />
        </div>
      </div>
      <VehicleMakeModelFields idSuffix={idSuffix} initialMake={vehicle?.make} initialModel={vehicle?.model} />
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="space-y-2 sm:col-start-3">
          <Label htmlFor={`year${idSuffix}`}>Year</Label>
          <Input id={`year${idSuffix}`} name="year" type="number" defaultValue={vehicle?.year ?? ""} />
        </div>
      </div>
      <div className="grid gap-4 rounded-lg border p-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor={`salesTargetPeriod${idSuffix}`}>Driver remittance schedule</Label>
          <Select name="salesTargetPeriod" defaultValue={vehicle?.salesTargetPeriod ?? "NONE"} items={SALES_TARGET_OPTIONS}>
            <SelectTrigger id={`salesTargetPeriod${idSuffix}`} className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(SALES_TARGET_OPTIONS).map(([value, label]) => (
                <SelectItem key={value} value={value}>{label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor={`salesTargetAmount${idSuffix}`}>Required remittance amount</Label>
          <Input id={`salesTargetAmount${idSuffix}`} name="salesTargetAmount" type="number" min="0.01" step="0.01" defaultValue={vehicle?.salesTargetAmount ?? ""} />
        </div>
        <p className="text-xs text-muted-foreground sm:col-span-2">
          Use this for vehicles whose drivers remit a required amount daily or weekly. Work & Pay amounts are controlled by their contract.
        </p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor={`ownerId${idSuffix}`}>Owner</Label>
          <Select name="ownerId" defaultValue={vehicle?.ownerId ?? ""} items={ownerItems}>
            <SelectTrigger id={`ownerId${idSuffix}`} className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(ownerItems).map(([value, label]) => (
                <SelectItem key={value || "none"} value={value}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor={`assignedDriverId${idSuffix}`}>Assigned driver</Label>
          <Select name="assignedDriverId" defaultValue={vehicle?.assignedDriverId ?? ""} items={driverItems}>
            <SelectTrigger id={`assignedDriverId${idSuffix}`} className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(driverItems).map(([value, label]) => (
                <SelectItem key={value || "none"} value={value}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="space-y-2">
          <Label htmlFor={`status${idSuffix}`}>Status</Label>
          <Select name="status" defaultValue={vehicle?.status ?? "AVAILABLE"} items={STATUS_OPTIONS}>
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
          <Label htmlFor={`mileage${idSuffix}`}>Mileage</Label>
          <Input id={`mileage${idSuffix}`} name="mileage" type="number" defaultValue={vehicle?.mileage ?? ""} />
        </div>
        <div className="space-y-2">
          <Label htmlFor={`location${idSuffix}`}>Location</Label>
          <Input id={`location${idSuffix}`} name="location" defaultValue={vehicle?.location ?? ""} />
        </div>
      </div>
    </>
  );
}

export default async function FleetVehiclesPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string; error?: string }>;
}) {
  const { saved, error } = await searchParams;
  const tenant = await requireModuleAccess("fleet");
  const canManage = hasPermission(tenant, PERMISSIONS.FLEET_VEHICLES_MANAGE);
  const [vehicles, owners, drivers] = await Promise.all([
    listFleetVehicles(tenant.organizationId),
    listFleetOwners(tenant.organizationId),
    listFleetDrivers(tenant.organizationId),
  ]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <PageHeader title="Vehicles" description="Fleet vehicles, their owners, and assigned drivers." />
        {canManage ? (
          <EntityDialog
            trigger={
              <Button size="sm">
                <Plus />
                New vehicle
              </Button>
            }
            title="New vehicle"
            action={upsertFleetVehicle}
          >
            <VehicleFields owners={owners} drivers={drivers} />
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

      {vehicles.length === 0 ? (
        <EmptyState icon={Truck} title="No vehicles yet" description="Vehicles you add will appear here." />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Asset tag</TableHead>
              <TableHead>Plate</TableHead>
              <TableHead>Make/model</TableHead>
              <TableHead>Owner</TableHead>
              <TableHead>Driver</TableHead>
              <TableHead>Sales target</TableHead>
              <TableHead>Status</TableHead>
              {canManage ? <TableHead /> : null}
            </TableRow>
          </TableHeader>
          <TableBody>
            {vehicles.map((vehicle) => (
              <TableRow key={vehicle.id}>
                <TableCell className="font-medium">{vehicle.assetTag}</TableCell>
                <TableCell className="text-muted-foreground">{vehicle.plateNumber}</TableCell>
                <TableCell className="text-muted-foreground">
                  {vehicle.make ? (
                    <div className="flex items-center gap-2">
                      <MakeLogo make={vehicle.make} size={24} />
                      <span>{[vehicle.make, vehicle.model].filter(Boolean).join(" ")}</span>
                    </div>
                  ) : (
                    "-"
                  )}
                </TableCell>
                <TableCell className="text-muted-foreground">
                  <p>{vehicle.owner?.name ?? "-"}</p>
                  {vehicle.ownershipHistory.length > 0 ? (
                    <details className="mt-1 text-xs">
                      <summary className="cursor-pointer">Ownership history</summary>
                      <div className="mt-2 min-w-56 space-y-2 rounded-md border bg-popover p-3 shadow-sm">
                        {vehicle.ownershipHistory.map((event) => (
                          <p key={event.id}>{event.changedAt.toLocaleDateString()}: {event.previousOwnerName ?? "No owner"} to {event.newOwnerName ?? "No owner"}</p>
                        ))}
                      </div>
                    </details>
                  ) : null}
                </TableCell>
                <TableCell className="text-muted-foreground">{vehicle.assignedDriver?.name ?? "-"}</TableCell>
                <TableCell className="text-muted-foreground">
                  {vehicle.salesTargetPeriod && vehicle.salesTargetAmount
                    ? `${tenant.organization.currency ?? "GHS"} ${Number(vehicle.salesTargetAmount).toFixed(2)} / ${vehicle.salesTargetPeriod === "DAILY" ? "day" : "week"}`
                    : "Work & Pay or none"}
                </TableCell>
                <TableCell>
                  <Badge variant={STATUS_BADGE_VARIANT[vehicle.status]}>{STATUS_OPTIONS[vehicle.status]}</Badge>
                </TableCell>
                {canManage ? (
                  <TableCell className="text-right">
                    <EntityDialog
                      trigger={
                        <Button size="sm" variant="ghost">
                          Edit
                        </Button>
                      }
                      title="Edit vehicle"
                      action={upsertFleetVehicle}
                      submitLabel="Save changes"
                    >
                      <input type="hidden" name="id" value={vehicle.id} />
                      <VehicleFields
                        vehicle={{
                          ...vehicle,
                          ownerId: vehicle.ownerId,
                          assignedDriverId: vehicle.assignedDriverId,
                          salesTargetAmount: vehicle.salesTargetAmount?.toString() ?? null,
                        }}
                        owners={owners}
                        drivers={drivers}
                      />
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
