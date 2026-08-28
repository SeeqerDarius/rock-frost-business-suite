import Link from "next/link";
import { Hash, Lock, Warehouse, Boxes, ArrowRight } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/feedback/empty-state";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SettingsBanner } from "@/components/settings/settings-banner";
import { requireModuleAccess } from "@/lib/auth/module-access";
import { hasPermission, canAccessModule, PERMISSIONS } from "@/lib/auth/permissions";
import { getOrderNumberPrefix, getSettings } from "@/modules/procurement/service";
import { listWarehouses } from "@/modules/inventory/service";
import { saveOrderNumberPrefix, updateDefaultWarehouse } from "./actions";

const ERROR_MESSAGES: Record<string, string> = {
  forbidden: "You don't have permission to manage Procurement settings.",
  "invalid-input": "That warehouse selection isn't valid.",
  "invalid-prefix": "Use 2-8 uppercase letters or numbers.",
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

  const [settings, warehouses, orderNumberPrefix] = await Promise.all([
    getSettings(tenant.organizationId),
    listWarehouses(tenant.organizationId),
    getOrderNumberPrefix(tenant.organizationId),
  ]);
  const warehouseItems: Record<string, string> = Object.fromEntries(warehouses.map((w) => [w.id, w.name]));
  const canReachInventorySettings = canAccessModule(tenant, "inventory") && hasPermission(tenant, PERMISSIONS.INVENTORY_SETTINGS_MANAGE);

  return (
    <div className="space-y-6">
      <PageHeader title="Procurement Settings" description="Module-wide configuration for Procurement." />

      {canReachInventorySettings ? (
        <Link
          href="/app/inventory/settings"
          className="flex items-center justify-between gap-3 rounded-lg border bg-muted/30 p-3 text-sm transition-colors hover:bg-muted/50"
        >
          <span className="flex items-center gap-2">
            <Boxes className="size-4 text-muted-foreground" aria-hidden="true" />
            Looking for reorder points or item categories? See Inventory Settings.
          </span>
          <ArrowRight className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        </Link>
      ) : null}

      <SettingsBanner saved={saved} error={error} errorMessages={ERROR_MESSAGES} />

      <Card className="shadow-sm">
        <CardHeader>
          <div className="flex items-center gap-2">
            <Hash className="size-5 text-muted-foreground" />
            <CardTitle>Order numbering</CardTitle>
          </div>
          <CardDescription>e.g. &quot;PO&quot; → PO-0001. Existing order numbers are not renumbered.</CardDescription>
        </CardHeader>
        <CardContent>
          <form action={saveOrderNumberPrefix} className="flex flex-wrap items-end gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="orderNumberPrefix" required>Order number prefix</Label>
              <Input id="orderNumberPrefix" name="orderNumberPrefix" defaultValue={orderNumberPrefix} minLength={2} maxLength={8} className="w-32 uppercase" required />
            </div>
            <Button type="submit" size="sm" variant="outline">Save</Button>
          </form>
        </CardContent>
      </Card>

      <Card className="shadow-sm">
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
