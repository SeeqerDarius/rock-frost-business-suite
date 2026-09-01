import { ShoppingBag } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/feedback/empty-state";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { requireModuleAccess } from "@/lib/auth/module-access";
import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import { listRegisters } from "@/modules/pos/service";
import { listItems, listCategories } from "@/modules/inventory/service";
import { SaleCart } from "./sale-cart";

export default async function PosSellPage() {
  const tenant = await requireModuleAccess("pos");
  const canSell = hasPermission(tenant, PERMISSIONS.POS_SALES_MANAGE);
  const [registers, items, categories] = await Promise.all([
    listRegisters(tenant.organizationId),
    listItems(tenant.organizationId),
    listCategories(tenant.organizationId),
  ]);
  const openSessionItems: Record<string, string> = Object.fromEntries(
    registers.filter((r) => r.sessions[0]).map((r) => [r.sessions[0].id, r.name]),
  );

  if (!canSell) {
    return (
      <div className="space-y-6">
        <PageHeader title="Sell" description="Record a new sale." />
        <EmptyState icon={ShoppingBag} title="You don't have access to this page" description="Recording sales is limited to roles with sales permissions." />
      </div>
    );
  }

  if (Object.keys(openSessionItems).length === 0) {
    return (
      <div className="space-y-6">
        <PageHeader title="Sell" description="Record a new sale." />
        <EmptyState icon={ShoppingBag} title="No open register sessions" description="Open a session on the Registers page before recording a sale." />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Sell" description="Record a new sale against an open register session." />

      <Card>
        <CardHeader>
          <CardTitle>New sale</CardTitle>
          <CardDescription>Tap products to add them, scan barcodes, split payment, or suspend the sale.</CardDescription>
        </CardHeader>
        <CardContent>
          <form className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="sessionId">Register session</Label>
                <Select name="sessionId" items={openSessionItems}>
                  <SelectTrigger id="sessionId" className="w-full">
                    <SelectValue placeholder="Select an open session" />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(openSessionItems).map(([value, label]) => (
                      <SelectItem key={value} value={value}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="customerName">Customer name (optional)</Label>
                <Input id="customerName" name="customerName" />
              </div>
            </div>

            <SaleCart
              items={items.filter((item) => item.isPosAvailable).map((item) => ({ id: item.id, name: item.name, sku: item.sku, barcode: item.barcode, price: Number(item.salesPrice).toFixed(2), categoryId: item.categoryId, imageData: item.imageData }))}
              categories={categories.map((category) => ({ id: category.id, name: category.name }))}
              organizationId={tenant.organizationId}
              userId={tenant.userId}
              currency={tenant.organization.currency ?? "GHS"}
            />
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
