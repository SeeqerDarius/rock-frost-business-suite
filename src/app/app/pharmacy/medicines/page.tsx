import { Pill, Plus } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/feedback/empty-state";
import { EntityDialog } from "@/components/forms/entity-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { requireModuleAccess } from "@/lib/auth/module-access";
import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import { formatMoney } from "@/lib/currency";
import { listMedicines } from "@/modules/pharmacy/service";
import { addMedicine } from "../actions";
import { PharmacyStatusBanner } from "../status-banner";
import { BarcodeLookup } from "./barcode-lookup";

const MEDICINE_CLASS_ITEMS: Record<string, string> = {
  OTC: "OTC",
  PHARMACY_ONLY: "Pharmacy only",
  PRESCRIPTION_ONLY: "Prescription only",
  CONTROLLED: "Controlled",
};

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string; error?: string }>;
}) {
  const { saved, error } = await searchParams;
  const t = await requireModuleAccess("pharmacy");
  const items = await listMedicines(t.organizationId);
  const can = hasPermission(t, PERMISSIONS.PHARMACY_MEDICINES_MANAGE);
  const currency = t.organization.currency;

  return (
    <div className="space-y-6">
      <div className="flex justify-between">
        <PageHeader title="Medicines" description="Registered medicine catalogue and regulatory supply classification." />
        {can ? (
          <EntityDialog trigger={<Button><Plus />New medicine</Button>} title="New medicine" action={addMedicine}>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="medicine-sku" required>SKU</Label>
                <Input id="medicine-sku" name="sku" required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="medicine-name" required>Name</Label>
                <Input id="medicine-name" name="name" required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="medicine-genericName">Generic name</Label>
                <Input id="medicine-genericName" name="genericName" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="medicine-strength">Strength</Label>
                <Input id="medicine-strength" name="strength" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="medicine-dosageForm">Dosage form</Label>
                <Input id="medicine-dosageForm" name="dosageForm" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="medicine-unit" required>Unit</Label>
                <Input id="medicine-unit" name="unit" defaultValue="unit" required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="medicine-medicineClass" required>Class</Label>
                <Select name="medicineClass" defaultValue="OTC" items={MEDICINE_CLASS_ITEMS}>
                  <SelectTrigger id="medicine-medicineClass" className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(MEDICINE_CLASS_ITEMS).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="medicine-registrationNumber">FDA registration</Label>
                <Input id="medicine-registrationNumber" name="registrationNumber" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="medicine-barcode">Barcode</Label>
                <Input id="medicine-barcode" name="barcode" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="medicine-sellingPrice" required>Selling price ({t.organization.currency})</Label>
                <Input id="medicine-sellingPrice" name="sellingPrice" type="number" step="0.01" required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="medicine-reorderPoint" required>Reorder point</Label>
                <Input id="medicine-reorderPoint" name="reorderPoint" type="number" defaultValue="0" required />
              </div>
            </div>
            <label className="flex gap-2">
              <Switch name="requiresPrescription" />
              Requires prescription
            </label>
          </EntityDialog>
        ) : null}
      </div>

      <PharmacyStatusBanner saved={saved} error={error} />

      <BarcodeLookup />

      {!items.length ? (
        <EmptyState icon={Pill} title="No medicines" description="Add the licensed medicines this pharmacy supplies." />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>SKU</TableHead>
              <TableHead>Medicine</TableHead>
              <TableHead>Class</TableHead>
              <TableHead>Price ({currency})</TableHead>
              <TableHead>Eligible stock</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((i) => (
              <TableRow key={i.id}>
                <TableCell>{i.sku}</TableCell>
                <TableCell>
                  <b>{i.name}</b>
                  <div className="text-xs text-muted-foreground">{[i.genericName, i.strength, i.dosageForm].filter(Boolean).join(" · ")}</div>
                </TableCell>
                <TableCell><Badge variant={i.medicineClass === "CONTROLLED" ? "destructive" : "outline"}>{i.medicineClass.replaceAll("_", " ")}</Badge></TableCell>
                <TableCell>{formatMoney(i.sellingPrice, currency)}</TableCell>
                <TableCell>{i.batches.filter((b) => b.status === "AVAILABLE" && b.expiryDate > new Date()).reduce((s, b) => s + b.quantity, 0)} {i.unit}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
