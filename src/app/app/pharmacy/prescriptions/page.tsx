import { ClipboardList, Plus } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/feedback/empty-state";
import { EntityDialog } from "@/components/forms/entity-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { requireModuleAccess } from "@/lib/auth/module-access";
import { listMedicines, listPatients, listPrescribers, listPrescriptions } from "@/modules/pharmacy/service";
import { addPrescriber, addPrescription } from "../actions";
import { PharmacyStatusBanner } from "../status-banner";

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
  const patientItems: Record<string, string> = Object.fromEntries(patients.map((x) => [x.id, x.fullName]));
  const prescriberItems: Record<string, string> = Object.fromEntries(docs.map((x) => [x.id, x.fullName]));
  const medicineItems: Record<string, string> = Object.fromEntries(meds.map((x) => [x.id, x.name]));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap justify-between gap-2">
        <PageHeader title="Prescriptions" description="Validated prescribers, prescription lines, remaining quantities and expiry." />
        <div className="flex gap-2">
          <EntityDialog trigger={<Button variant="outline"><Plus />Prescriber</Button>} title="Register prescriber" action={addPrescriber}>
            <div className="space-y-2">
              <Label htmlFor="prescriber-fullName" required>Full name</Label>
              <Input id="prescriber-fullName" name="fullName" required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="prescriber-registrationNumber" required>Registration number</Label>
              <Input id="prescriber-registrationNumber" name="registrationNumber" required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="prescriber-facilityName">Facility</Label>
              <Input id="prescriber-facilityName" name="facilityName" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="prescriber-phone">Phone</Label>
              <Input id="prescriber-phone" name="phone" />
            </div>
          </EntityDialog>
          <EntityDialog trigger={<Button><Plus />Prescription</Button>} title="New prescription" action={addPrescription} contentClassName="sm:max-w-xl">
            <div className="space-y-2">
              <Label htmlFor="prescription-number" required>Prescription number</Label>
              <Input id="prescription-number" name="prescriptionNumber" required />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="prescription-patientId" required>Patient</Label>
                <Select name="patientId" items={patientItems}>
                  <SelectTrigger id="prescription-patientId" className="w-full"><SelectValue placeholder="Select patient" /></SelectTrigger>
                  <SelectContent>{patients.map((x) => <SelectItem key={x.id} value={x.id}>{x.fullName}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="prescription-prescriberId" required>Prescriber</Label>
                <Select name="prescriberId" items={prescriberItems}>
                  <SelectTrigger id="prescription-prescriberId" className="w-full"><SelectValue placeholder="Select prescriber" /></SelectTrigger>
                  <SelectContent>{docs.map((x) => <SelectItem key={x.id} value={x.id}>{x.fullName}</SelectItem>)}</SelectContent>
                </Select>
              </div>
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
    </div>
  );
}
