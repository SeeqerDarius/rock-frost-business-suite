import { Lock, Warehouse } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/feedback/empty-state";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { requireModuleAccess } from "@/lib/auth/module-access";
import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import { getSettings } from "@/modules/procurement/service";
import { listWarehouses } from "@/modules/inventory/service";
import { updateDefaultWarehouse } from "./actions";

const ERROR_MESSAGES: Record<string, string> = {
  forbidden: "You don't have permission to manage Procurement settings.",
  "invalid-input": "That warehouse selection isn't valid.",
};

export default async function ProcurementSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string; error?: string }>;
}) {
  const { saved, error } = await searchParams;
  const tenant = await requireModuleAccess("procurement");

  if (!hasPermission(tenant, PERMISSIONS.PROCUREMENT_SETTINGS_MANAGE)) {
    return (
      <div className="space-y-6">
        <PageHeader title="Procurement Settings" description="Module-wide configuration for Procurement." />
        <EmptyState icon={Lock} title="You don't have access to this page" description="Procurement settings are limited to roles with settings permissions." />
      </div>
    );
  }

  const [settings, warehouses] = await Promise.all([
    getSettings(tenant.organizationId),
    listWarehouses(tenant.organizationId),
  ]);
  const warehouseItems: Record<string, string> = Object.fromEntries(warehouses.map((w) => [w.id, w.name]));

  return (
    <div className="space-y-6">
      <PageHeader title="Procurement Settings" description="Module-wide configuration for Procurement." />

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

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Warehouse className="size-5 text-muted-foreground" />
            <CardTitle>Default receiving warehouse</CardTitle>
          </div>
          <CardDescription>Pre-selected when receiving a purchase order line, if left blank a warehouse must be chosen each time.</CardDescription>
        </CardHeader>
        <CardContent>
          <form action={updateDefaultWarehouse} className="flex flex-wrap items-end gap-2">
            <div className="space-y-2">
              <Label htmlFor="defaultWarehouseId">Warehouse</Label>
              <Select name="defaultWarehouseId" defaultValue={settings?.defaultWarehouseId ?? ""} items={{ "": "None", ...warehouseItems }}>
                <SelectTrigger id="defaultWarehouseId" className="w-64">
                  <SelectValue placeholder="None" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">None</SelectItem>
                  {Object.entries(warehouseItems).map(([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button type="submit" size="sm" variant="outline">
              Save
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
