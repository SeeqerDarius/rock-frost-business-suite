import { Fuel, Plus, Lock } from "lucide-react";
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
import { listFleetVehicleExpenses, listFleetVehicles } from "@/modules/fleet/service";
import { createVehicleExpense } from "./actions";

const ERROR_MESSAGES: Record<string, string> = {
  forbidden: "You don't have permission to manage vehicle expenses.",
  "missing-fields": "Vehicle, type, and amount are required.",
  "invalid-input": "Please check that the amount and date are valid.",
  "not-found": "That vehicle could not be found.",
  "invalid-photo": "That receipt file isn't a supported image (JPEG, PNG or WebP, up to 1MB).",
};

const TYPE_LABELS: Record<string, string> = {
  FUEL: "Fuel",
  FINE: "Fine",
  INSURANCE_PREMIUM: "Insurance premium",
  LICENSING: "Licensing",
  OTHER: "Other",
};

const TYPE_BADGE: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  FUEL: "default",
  FINE: "destructive",
  INSURANCE_PREMIUM: "secondary",
  LICENSING: "secondary",
  OTHER: "outline",
};

export default async function FleetVehicleExpensesPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string; error?: string }>;
}) {
  const { saved, error } = await searchParams;
  const tenant = await requireModuleAccess("fleet");
  const canManage = hasPermission(tenant, PERMISSIONS.FLEET_VEHICLES_MANAGE);
  if (!canManage) {
    return (
      <div className="space-y-6">
        <PageHeader title="Vehicle Expenses" description="Fuel, fines, insurance premiums, licensing and other vehicle running costs." />
        <EmptyState icon={Lock} title="You don't have access to this page" description="Vehicle expenses are limited to roles with vehicle-management permissions." />
      </div>
    );
  }
  const [expenses, vehicles] = await Promise.all([
    listFleetVehicleExpenses(tenant.organizationId),
    listFleetVehicles(tenant.organizationId),
  ]);
  const vehicleItems = Object.fromEntries(vehicles.map((vehicle) => [vehicle.id, `${vehicle.assetTag} - ${vehicle.plateNumber}`]));
  const currency = tenant.organization.currency ?? "GHS";
  const totalThisMonth = expenses
    .filter((expense) => {
      const now = new Date();
      return expense.date.getUTCFullYear() === now.getUTCFullYear() && expense.date.getUTCMonth() === now.getUTCMonth();
    })
    .reduce((sum, expense) => sum + Number(expense.amount), 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <PageHeader title="Vehicle Expenses" description="Fuel, fines, insurance premiums, licensing and other vehicle running costs. Each entry posts to Accounting under its own expense account." />
        {vehicles.length > 0 ? (
          <EntityDialog
            trigger={
              <Button size="sm">
                <Plus />
                Record expense
              </Button>
            }
            title="Record vehicle expense"
            action={createVehicleExpense}
          >
            <div className="space-y-2">
              <Label htmlFor="vehicleId">Vehicle</Label>
              <Select name="vehicleId" items={vehicleItems}>
                <SelectTrigger id="vehicleId" className="w-full">
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
                <Label htmlFor="type">Type</Label>
                <Select name="type" items={TYPE_LABELS}>
                  <SelectTrigger id="type" className="w-full">
                    <SelectValue placeholder="Select a type" />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(TYPE_LABELS).map(([value, label]) => (
                      <SelectItem key={value} value={value}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="amount">Amount ({currency})</Label>
                <Input id="amount" name="amount" type="number" step="0.01" min="0.01" required />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="date">Date</Label>
              <Input id="date" name="date" type="date" defaultValue={new Date().toISOString().slice(0, 10)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="note">Note (optional)</Label>
              <Input id="note" name="note" placeholder="e.g. Shell Achimota, full tank" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="receipt">Receipt photo (optional)</Label>
              <Input id="receipt" name="receipt" type="file" accept="image/jpeg,image/png,image/webp" />
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

      {vehicles.length === 0 ? (
        <EmptyState icon={Fuel} title="No vehicles yet" description="Register a vehicle first, then record its running costs here." />
      ) : expenses.length === 0 ? (
        <EmptyState icon={Fuel} title="No expenses recorded yet" description="Fuel, fines, insurance, licensing and other vehicle costs you record will appear here." />
      ) : (
        <>
          <div className="rounded-xl border p-4">
            <p className="text-sm text-muted-foreground">This month</p>
            <p className="text-2xl font-semibold">{currency} {totalThisMonth.toFixed(2)}</p>
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Vehicle</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Note</TableHead>
                <TableHead className="text-right">Amount ({currency})</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {expenses.map((expense) => (
                <TableRow key={expense.id}>
                  <TableCell className="text-muted-foreground">{expense.date.toLocaleDateString()}</TableCell>
                  <TableCell className="font-medium">{expense.vehicle.assetTag} - {expense.vehicle.plateNumber}</TableCell>
                  <TableCell>
                    <Badge variant={TYPE_BADGE[expense.type]}>{TYPE_LABELS[expense.type]}</Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{expense.note ?? "-"}</TableCell>
                  <TableCell className="text-right text-muted-foreground">{Number(expense.amount).toFixed(2)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </>
      )}
    </div>
  );
}
