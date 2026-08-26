import { ClipboardList, Plus, Stethoscope } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/feedback/empty-state";
import { EntityDialog } from "@/components/forms/entity-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { requireModuleAccess } from "@/lib/auth/module-access";
import { listMedicines, listPatients, listPrescribers, listPrescriptions } from "@/modules/pharmacy/service";
import { addPrescription, upsertPrescriber } from "../actions";
import { PharmacyStatusBanner } from "../status-banner";
import { PatientPicker, PrescriberPicker } from "./entity-picker";

interface PrescriberFieldsProps {
  prescriber?: {
    id: string;
    fullName: string;
    registrationNumber: string;
    facilityName: string | null;
    phone: string | null;
    active: boolean;
  };
}

function PrescriberFields({ prescriber }: PrescriberFieldsProps) {
  const idSuffix = prescriber ? "-edit" : "";
  return (
    <>
      <div className="space-y-2">
        <Label htmlFor={`prescriber-fullName${idSuffix}`} required>Full name</Label>
        <Input id={`prescriber-fullName${idSuffix}`} name="fullName" defaultValue={prescriber?.fullName} required />
      </div>
      <div className="space-y-2">
        <Label htmlFor={`prescriber-registrationNumber${idSuffix}`} required>Registration number</Label>
        <Input id={`prescriber-registrationNumber${idSuffix}`} name="registrationNumber" defaultValue={prescriber?.registrationNumber} required />
      </div>
      <div className="space-y-2">
        <Label htmlFor={`prescriber-facilityName${idSuffix}`}>Facility</Label>
        <Input id={`prescriber-facilityName${idSuffix}`} name="facilityName" defaultValue={prescriber?.facilityName ?? ""} />
      </div>
      <div className="space-y-2">
        <Label htmlFor={`prescriber-phone${idSuffix}`}>Phone</Label>
        <Input id={`prescriber-phone${idSuffix}`} name="phone" defaultValue={prescriber?.phone ?? ""} />
      </div>
      {prescriber ? (
        <label className="flex items-center gap-2 text-sm">
          <Switch name="active" defaultChecked={prescriber.active} />
          Active (selectable for new prescriptions)
        </label>
      ) : null}
    </>
  );
}

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string; error?: string }>;
}) {
  const { saved, error } = await searchParams;
  const t = await requireModuleAccess("pharmacy");
  const [rx, patients, docs, meds] = await Promise.all([
    listPrescriptions(t.organizationId),
    listPatients(t.organizationId),
    listPrescribers(t.organizationId),
    listMedicines(t.organizationId),
  ]);
  const activePrescribers = docs.filter((x) => x.active);
  const medicineItems: Record<string, string> = Object.fromEntries(meds.map((x) => [x.id, x.name]));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap justify-between gap-2">
        <PageHeader title="Prescriptions" description="Validated prescribers, prescription lines, remaining quantities and expiry." />
        <div className="flex gap-2">
          <EntityDialog trigger={<Button variant="outline"><Plus />Prescriber</Button>} title="Register prescriber" action={upsertPrescriber}>
            <PrescriberFields />
          </EntityDialog>
          <EntityDialog trigger={<Button><Plus />Prescription</Button>} title="New prescription" action={addPrescription} contentClassName="sm:max-w-xl">
            <div className="space-y-2">
              <Label htmlFor="prescription-number" required>Prescription number</Label>
              <Input id="prescription-number" name="prescriptionNumber" required />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <PatientPicker patients={patients} />
              <PrescriberPicker prescribers={activePrescribers} />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="prescription-prescribedAt" required>Prescribed date</Label>
                <Input id="prescription-prescribedAt" name="prescribedAt" type="date" required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="prescription-expiresAt">Expires</Label>
                <Input id="prescription-expiresAt" name="expiresAt" type="date" />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="prescription-medicineId" required>Medicine</Label>
              <Select name="medicineId" items={medicineItems}>
                <SelectTrigger id="prescription-medicineId" className="w-full"><SelectValue placeholder="Select medicine" /></SelectTrigger>
                <SelectContent>{meds.map((x) => <SelectItem key={x.id} value={x.id}>{x.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-2">
                <Label htmlFor="prescription-quantityPrescribed" required>Quantity</Label>
                <Input id="prescription-quantityPrescribed" name="quantityPrescribed" type="number" min="1" required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="prescription-dosage" required>Dosage</Label>
                <Input id="prescription-dosage" name="dosage" required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="prescription-frequency" required>Frequency</Label>
                <Input id="prescription-frequency" name="frequency" required />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="prescription-duration">Duration</Label>
              <Input id="prescription-duration" name="duration" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="prescription-instructions">Instructions</Label>
              <Textarea id="prescription-instructions" name="instructions" rows={2} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="prescription-clinicalNotes">Clinical notes</Label>
              <Textarea id="prescription-clinicalNotes" name="clinicalNotes" rows={3} />
            </div>
          </EntityDialog>
        </div>
      </div>

      <PharmacyStatusBanner saved={saved} error={error} />

      {!rx.length ? (
        <EmptyState icon={ClipboardList} title="No prescriptions" description="Validated prescriptions appear here." />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Number</TableHead>
              <TableHead>Patient</TableHead>
              <TableHead>Prescriber</TableHead>
              <TableHead>Medicines</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rx.map((x) => (
              <TableRow key={x.id}>
                <TableCell>{x.prescriptionNumber}</TableCell>
                <TableCell>{x.patient.fullName}</TableCell>
                <TableCell>{x.prescriber.fullName}</TableCell>
                <TableCell>{x.lines.map((l) => <div key={l.id}>{l.medicine.name}: {l.quantityDispensed}/{l.quantityPrescribed}</div>)}</TableCell>
                <TableCell><Badge variant="outline">{x.status}</Badge></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      <div>
        <h2 className="mb-2 text-sm font-medium">Prescribers</h2>
        {!docs.length ? (
          <EmptyState icon={Stethoscope} title="No prescribers" description="Registered prescribers appear here." />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Registration number</TableHead>
                <TableHead>Facility</TableHead>
                <TableHead>Phone</TableHead>
                <TableHead>Status</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {docs.map((x) => (
                <TableRow key={x.id}>
                  <TableCell>{x.fullName}</TableCell>
                  <TableCell>{x.registrationNumber}</TableCell>
                  <TableCell className="text-muted-foreground">{x.facilityName ?? "-"}</TableCell>
                  <TableCell className="text-muted-foreground">{x.phone ?? "-"}</TableCell>
                  <TableCell><Badge variant={x.active ? "outline" : "secondary"}>{x.active ? "Active" : "Inactive"}</Badge></TableCell>
                  <TableCell className="text-right">
                    <EntityDialog
                      trigger={<Button size="sm" variant="ghost">Edit</Button>}
                      title="Edit prescriber"
                      action={upsertPrescriber}
                      submitLabel="Save changes"
                    >
                      <input type="hidden" name="id" value={x.id} />
                      <PrescriberFields prescriber={x} />
                    </EntityDialog>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>
    </div>
  );
}
