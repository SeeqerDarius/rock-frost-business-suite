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
import { completeSale } from "./actions";
import { SaleCart } from "./sale-cart";

const ERROR_MESSAGES: Record<string, string> = {
  forbidden: "You don't have permission to record sales.",
  "missing-fields": "A session and payment method are required.",
  "no-lines": "Add at least one line with a description, quantity, and unit price.",
  "insufficient-stock": "There isn't enough stock of one of these items at this register's warehouse.",
  "no-open-session": "That session is no longer open.",
  "invalid-line": "Every line needs a positive whole-number quantity and a valid unit price.",
  "not-found": "That session or register could not be found.",
};

export default async function PosSellPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string; error?: string }>;
}) {
  const { saved, error } = await searchParams;
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

      {saved ? (
        <div className="rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-600 dark:text-emerald-400">
          Sale recorded.
        </div>
      ) : null}
      {error && ERROR_MESSAGES[error] ? (
        <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {ERROR_MESSAGES[error]}
        </div>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>New sale</CardTitle>
          <CardDescription>Tap products to add them, scan barcodes, split payment, or suspend the sale.</CardDescription>
        </CardHeader>
        <CardContent>
          <form action={completeSale} className="space-y-4">
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
              items={items.map((item) => ({ id: item.id, name: item.name, sku: item.sku, barcode: item.barcode, price: Number(item.costPrice).toFixed(2), categoryId: item.categoryId, imageData: item.imageData }))}
              categories={categories.map((category) => ({ id: category.id, name: category.name }))}
            />
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
