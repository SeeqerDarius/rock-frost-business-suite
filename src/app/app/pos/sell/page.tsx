import { ShoppingBag } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/feedback/empty-state";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { requireCurrentTenant } from "@/lib/tenant";
import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import { listRegisters } from "@/modules/pos/service";
import { listItems } from "@/modules/inventory/service";
import { completeSale } from "./actions";

const ERROR_MESSAGES: Record<string, string> = {
  forbidden: "You don't have permission to record sales.",
  "missing-fields": "A session and payment method are required.",
  "no-lines": "Add at least one line with a description, quantity, and unit price.",
  "insufficient-stock": "There isn't enough stock of one of these items at this register's warehouse.",
  "no-open-session": "That session is no longer open.",
};

const PAYMENT_METHODS: Record<string, string> = { CASH: "Cash", CARD: "Card", MOBILE_MONEY: "Mobile Money", OTHER: "Other" };

export default async function PosSellPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string; error?: string }>;
}) {
  const { saved, error } = await searchParams;
  const tenant = await requireCurrentTenant();
  const canSell = hasPermission(tenant, PERMISSIONS.POS_SALES_MANAGE);
  const [registers, items] = await Promise.all([listRegisters(tenant.organizationId), listItems(tenant.organizationId)]);
  const openSessionItems: Record<string, string> = Object.fromEntries(
    registers.filter((r) => r.sessions[0]).map((r) => [r.sessions[0].id, r.name]),
  );
  const itemItems: Record<string, string> = Object.fromEntries(items.map((i) => [i.id, `${i.name} (${i.sku})`]));

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
          <CardDescription>Up to three line items per sale.</CardDescription>
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
                <Label htmlFor="paymentMethod">Payment method</Label>
                <Select name="paymentMethod" defaultValue="CASH" items={PAYMENT_METHODS}>
                  <SelectTrigger id="paymentMethod" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(PAYMENT_METHODS).map(([value, label]) => (
                      <SelectItem key={value} value={value}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="customerName">Customer name (optional)</Label>
              <Input id="customerName" name="customerName" />
            </div>

            {[1, 2, 3].map((i) => (
              <div key={i} className="space-y-2 rounded-lg border p-3">
                <p className="text-xs font-medium text-muted-foreground">Line {i}</p>
                <div className="space-y-2">
                  <Label htmlFor={`itemId${i}`}>Inventory item (optional)</Label>
                  <Select name={`itemId${i}`} defaultValue="" items={{ "": "None", ...itemItems }}>
                    <SelectTrigger id={`itemId${i}`} className="w-full">
                      <SelectValue placeholder="None" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">None</SelectItem>
                      {Object.entries(itemItems).map(([value, label]) => (
                        <SelectItem key={value} value={value}>
                          {label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor={`description${i}`}>Description</Label>
                  <Input id={`description${i}`} name={`description${i}`} />
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor={`quantity${i}`}>Quantity</Label>
                    <Input id={`quantity${i}`} name={`quantity${i}`} type="number" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor={`unitPrice${i}`}>Unit price</Label>
                    <Input id={`unitPrice${i}`} name={`unitPrice${i}`} type="number" step="0.01" />
                  </div>
                </div>
              </div>
            ))}

            <Button type="submit" className="w-full">
              Complete sale
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
