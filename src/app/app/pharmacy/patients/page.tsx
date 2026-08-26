import { Users, Plus } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/feedback/empty-state";
import { EntityDialog } from "@/components/forms/entity-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { requireModuleAccess } from "@/lib/auth/module-access";
import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import { listPatients } from "@/modules/pharmacy/service";
import { upsertPatient } from "../actions";
import { PharmacyStatusBanner } from "../status-banner";

const SEX_ITEMS: Record<string, string> = { MALE: "Male", FEMALE: "Female", OTHER: "Other" };

interface PatientFieldsProps {
  patient?: {
    id: string;
    patientNumber: string;
    fullName: string;
    dateOfBirth: Date | null;
    sex: string | null;
    phone: string | null;
    email: string | null;
    address: string | null;
    allergies: string | null;
    notes: string | null;
  };
}

function PatientFields({ patient }: PatientFieldsProps) {
  const idSuffix = patient ? "-edit" : "";
  const dateOfBirthValue = patient?.dateOfBirth ? patient.dateOfBirth.toISOString().slice(0, 10) : "";

  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor={`patientNumber${idSuffix}`} required>
            Patient number
          </Label>
          <Input id={`patientNumber${idSuffix}`} name="patientNumber" defaultValue={patient?.patientNumber} required />
        </div>
        <div className="space-y-2">
          <Label htmlFor={`fullName${idSuffix}`} required>
            Full name
          </Label>
          <Input id={`fullName${idSuffix}`} name="fullName" defaultValue={patient?.fullName} required />
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor={`dateOfBirth${idSuffix}`}>Date of birth</Label>
          <Input id={`dateOfBirth${idSuffix}`} name="dateOfBirth" type="date" defaultValue={dateOfBirthValue} />
        </div>
        <div className="space-y-2">
          <Label htmlFor={`sex${idSuffix}`}>Sex</Label>
          <Select name="sex" defaultValue={patient?.sex ?? ""} items={{ "": "Not specified", ...SEX_ITEMS }}>
            <SelectTrigger id={`sex${idSuffix}`} className="w-full">
              <SelectValue placeholder="Not specified" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="">Not specified</SelectItem>
              {Object.entries(SEX_ITEMS).map(([value, label]) => (
                <SelectItem key={value} value={value}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor={`phone${idSuffix}`}>Phone</Label>
          <Input id={`phone${idSuffix}`} name="phone" defaultValue={patient?.phone ?? ""} />
        </div>
        <div className="space-y-2">
          <Label htmlFor={`email${idSuffix}`}>Email</Label>
          <Input id={`email${idSuffix}`} name="email" type="email" defaultValue={patient?.email ?? ""} />
        </div>
      </div>
      <div className="space-y-2">
        <Label htmlFor={`address${idSuffix}`}>Address</Label>
        <Input id={`address${idSuffix}`} name="address" defaultValue={patient?.address ?? ""} />
      </div>
      <div className="space-y-2">
        <Label htmlFor={`allergies${idSuffix}`}>Allergies</Label>
        <Textarea id={`allergies${idSuffix}`} name="allergies" defaultValue={patient?.allergies ?? ""} rows={2} />
      </div>
      <div className="space-y-2">
        <Label htmlFor={`notes${idSuffix}`}>Notes</Label>
        <Textarea id={`notes${idSuffix}`} name="notes" defaultValue={patient?.notes ?? ""} rows={3} />
      </div>
    </>
  );
}

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string; error?: string }>;
}) {
  const { saved, error } = await searchParams;
  const tenant = await requireModuleAccess("pharmacy");
  const canManage = hasPermission(tenant, PERMISSIONS.PHARMACY_PATIENTS_MANAGE);
  const patients = await listPatients(tenant.organizationId);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <PageHeader title="Patients" description="Patient identity, contact, allergy and dispensing context." />
        {canManage ? (
          <EntityDialog
            trigger={
              <Button>
                <Plus />
                New patient
              </Button>
            }
            title="New patient"
            action={upsertPatient}
          >
            <PatientFields />
          </EntityDialog>
        ) : null}
      </div>

      <PharmacyStatusBanner saved={saved} error={error} savedMessage={saved === "updated" ? "Patient updated." : "Patient saved."} />

      {!patients.length ? (
        <EmptyState icon={Users} title="No patients" description="Registered patients appear here." />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Number</TableHead>
              <TableHead>Name</TableHead>
              <TableHead>Contact</TableHead>
              <TableHead>Allergies</TableHead>
              {canManage ? <TableHead /> : null}
            </TableRow>
          </TableHeader>
          <TableBody>
            {patients.map((x) => (
              <TableRow key={x.id}>
                <TableCell>{x.patientNumber}</TableCell>
                <TableCell>{x.fullName}</TableCell>
                <TableCell>{x.phone ?? x.email ?? "-"}</TableCell>
                <TableCell>{x.allergies ?? "None recorded"}</TableCell>
                {canManage ? (
                  <TableCell className="text-right">
                    <EntityDialog
                      trigger={
                        <Button size="sm" variant="ghost">
                          Edit
                        </Button>
                      }
                      title="Edit patient"
                      action={upsertPatient}
                      submitLabel="Save changes"
                    >
                      <input type="hidden" name="id" value={x.id} />
                      <PatientFields patient={x} />
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
