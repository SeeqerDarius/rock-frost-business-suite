import { ShieldCheck, Plus, Lock } from "lucide-react";
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
import { listFleetVehicleDocuments, listFleetVehicles } from "@/modules/fleet/service";
import { upsertFleetVehicleDocument } from "./actions";

const ERROR_MESSAGES: Record<string, string> = {
  forbidden: "You don't have permission to manage insurance and roadworthy records.",
  "missing-fields": "Vehicle, provider, policy number, and both expiry dates are required.",
  "not-found": "That vehicle could not be found.",
};

const RENEWAL_LABELS: Record<string, string> = { CLEAR: "Clear", READY: "Renewal due soon", DUE: "Overdue" };
const RENEWAL_BADGE: Record<string, "default" | "outline" | "destructive"> = { CLEAR: "default", READY: "outline", DUE: "destructive" };

function toDateInputValue(date: Date) {
  return date.toISOString().slice(0, 10);
}

interface DocumentFieldsProps {
  doc?: { vehicleId: string; provider: string; policyNumber: string; insuranceExpiresAt: Date; roadworthyExpiresAt: Date; alerts: string | null };
  vehicleItems: Record<string, string>;
}

function DocumentFields({ doc, vehicleItems }: DocumentFieldsProps) {
  const idSuffix = doc ? "-edit" : "";
  return (
    <>
      <div className="space-y-2">
        <Label htmlFor={`vehicleId${idSuffix}`}>Vehicle</Label>
        <Select name="vehicleId" defaultValue={doc?.vehicleId} items={vehicleItems}>
          <SelectTrigger id={`vehicleId${idSuffix}`} className="w-full">
            <SelectValue placeholder="Select a vehicle" />
          </SelectTrigger>
          <SelectContent>
            {Object.entries(vehicleItems).map(([value, label]) => (
              <SelectItem key={value} value={value}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor={`provider${idSuffix}`}>Insurance provider</Label>
          <Input id={`provider${idSuffix}`} name="provider" defaultValue={doc?.provider} required />
        </div>
        <div className="space-y-2">
          <Label htmlFor={`policyNumber${idSuffix}`}>Policy number</Label>
          <Input id={`policyNumber${idSuffix}`} name="policyNumber" defaultValue={doc?.policyNumber} required />
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor={`insuranceExpiresAt${idSuffix}`}>Insurance expires</Label>
          <Input
            id={`insuranceExpiresAt${idSuffix}`}
            name="insuranceExpiresAt"
            type="date"
            defaultValue={doc ? toDateInputValue(doc.insuranceExpiresAt) : ""}
            required
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor={`roadworthyExpiresAt${idSuffix}`}>Roadworthy expires</Label>
          <Input
            id={`roadworthyExpiresAt${idSuffix}`}
            name="roadworthyExpiresAt"
            type="date"
            defaultValue={doc ? toDateInputValue(doc.roadworthyExpiresAt) : ""}
            required
          />
        </div>
      </div>
      <div className="space-y-2">
        <Label htmlFor={`alerts${idSuffix}`}>Alerts / notes</Label>
        <Input id={`alerts${idSuffix}`} name="alerts" defaultValue={doc?.alerts ?? ""} />
      </div>
    </>
  );
}

export default async function FleetInsuranceRoadworthyPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string; error?: string }>;
}) {
  const { saved, error } = await searchParams;
  const tenant = await requireModuleAccess("fleet");
  const canManage = hasPermission(tenant, PERMISSIONS.FLEET_INSURANCE_MANAGE);
  if (!canManage) {
    return (
      <div className="space-y-6">
        <PageHeader title="Insurance & Roadworthy" description="Vehicle insurance and roadworthy certification records." />
        <EmptyState icon={Lock} title="You don't have access to this page" description="Insurance and roadworthy records are limited to roles with insurance-management permissions." />
      </div>
    );
  }
  const [documents, vehicles] = await Promise.all([
    listFleetVehicleDocuments(tenant.organizationId),
    listFleetVehicles(tenant.organizationId),
  ]);
  const vehicleItems: Record<string, string> = Object.fromEntries(vehicles.map((v) => [v.id, `${v.assetTag} - ${v.plateNumber}`]));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <PageHeader title="Insurance & Roadworthy" description="Vehicle insurance and roadworthy certification records." />
        {canManage && vehicles.length > 0 ? (
          <EntityDialog
            trigger={
              <Button size="sm">
                <Plus />
                New record
              </Button>
            }
            title="New insurance / roadworthy record"
            action={upsertFleetVehicleDocument}
          >
            <DocumentFields vehicleItems={vehicleItems} />
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

      {documents.length === 0 ? (
        <EmptyState icon={ShieldCheck} title="No records yet" description="Insurance and roadworthy records you add will appear here." />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Vehicle</TableHead>
              <TableHead>Provider</TableHead>
              <TableHead>Insurance expires</TableHead>
              <TableHead>Roadworthy expires</TableHead>
              <TableHead>Status</TableHead>
              {canManage ? <TableHead /> : null}
            </TableRow>
          </TableHeader>
          <TableBody>
            {documents.map((doc) => (
              <TableRow key={doc.id}>
                <TableCell className="font-medium">{doc.vehicle.assetTag}</TableCell>
                <TableCell className="text-muted-foreground">{doc.provider}</TableCell>
                <TableCell className="text-muted-foreground">{doc.insuranceExpiresAt.toLocaleDateString()}</TableCell>
                <TableCell className="text-muted-foreground">{doc.roadworthyExpiresAt.toLocaleDateString()}</TableCell>
                <TableCell>
                  <Badge variant={RENEWAL_BADGE[doc.renewalStatus]}>{RENEWAL_LABELS[doc.renewalStatus]}</Badge>
                </TableCell>
                {canManage ? (
                  <TableCell className="text-right">
                    <EntityDialog
                      trigger={
                        <Button size="sm" variant="ghost">
                          Edit
                        </Button>
                      }
                      title="Edit record"
                      action={upsertFleetVehicleDocument}
                      submitLabel="Save changes"
                    >
                      <input type="hidden" name="id" value={doc.id} />
                      <DocumentFields doc={doc} vehicleItems={vehicleItems} />
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
