"use client";

import { useMemo, useState } from "react";
import { ShoppingBag } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { formatGhs, type ModulePrice } from "@/lib/pricing";
import { startCartCheckout } from "./actions";

type CartProduct = ModulePrice & { name: string; description: string };

export function ModuleCart({ products, paystackAvailable }: { products: CartProduct[]; paystackAvailable: boolean }) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [billingCycle, setBillingCycle] = useState<"MONTHLY" | "ANNUAL">("ANNUAL");

  function toggle(moduleKey: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(moduleKey)) next.delete(moduleKey);
      else next.add(moduleKey);
      return next;
    });
  }

  const selectedProducts = useMemo(() => products.filter((product) => selected.has(product.moduleKey)), [products, selected]);
  const total = useMemo(
    () => selectedProducts.reduce((sum, product) => sum + (billingCycle === "ANNUAL" ? product.annualGhs : product.monthlyGhs), 0),
    [selectedProducts, billingCycle],
  );

  return (
    <form action={startCartCheckout} className="space-y-4">
      <div className="grid gap-3 lg:grid-cols-2">
        {products.map((product) => {
          const isSelected = selected.has(product.moduleKey);
          return (
            <label
              key={product.moduleKey}
              className={cn("block cursor-pointer rounded-xl", isSelected && "ring-1 ring-primary")}
            >
              <input
                type="checkbox"
                name="moduleKeys"
                value={product.moduleKey}
                checked={isSelected}
                onChange={() => toggle(product.moduleKey)}
                className="sr-only"
              />
              <Card className={cn("transition-colors", isSelected ? "border-primary" : "hover:border-primary/40")}>
                <CardHeader>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <CardTitle>{product.name}</CardTitle>
                      <CardDescription>{product.description}</CardDescription>
                    </div>
                    <span
                      aria-hidden="true"
                      className={cn(
                        "flex size-5 shrink-0 items-center justify-center rounded-md border",
                        isSelected ? "border-primary bg-primary text-primary-foreground" : "border-input text-transparent",
                      )}
                    >
                      ✓
                    </span>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">
                      {billingCycle === "ANNUAL" ? `${formatGhs(product.annualGhs)}/year` : `${formatGhs(product.monthlyGhs)}/month`}
                    </span>
                    <span className="text-xs text-muted-foreground">Includes {product.includedSeats} seats</span>
                  </div>
                </CardContent>
              </Card>
            </label>
          );
        })}
      </div>

      <Card className="border-primary/30 bg-primary/5">
        <CardContent className="flex flex-col gap-4 py-5 sm:flex-row sm:items-end sm:justify-between">
          <div className="flex items-start gap-3">
            <ShoppingBag className="mt-0.5 size-5 shrink-0 text-primary" />
            <div>
              <p className="font-medium">
                {selectedProducts.length === 0
                  ? "No products selected yet"
                  : `${selectedProducts.length} product${selectedProducts.length === 1 ? "" : "s"} selected`}
              </p>
              {selectedProducts.length > 0 ? (
                <p className="text-sm text-muted-foreground">{selectedProducts.map((product) => product.name).join(", ")}</p>
              ) : (
                <p className="text-sm text-muted-foreground">Check the products you want, then pay for all of them in one payment.</p>
              )}
            </div>
          </div>
          <div className="flex flex-col gap-3 sm:items-end">
            <label className="flex items-center gap-2 text-sm">
              <span className="font-medium">Billing period</span>
              <select
                name="billingCycle"
                value={billingCycle}
                onChange={(event) => setBillingCycle(event.target.value as "MONTHLY" | "ANNUAL")}
                className="h-9 rounded-md border bg-background px-2"
              >
                <option value="MONTHLY">Monthly</option>
                <option value="ANNUAL">Annual</option>
              </select>
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="autoRenew" value="true" defaultChecked className="size-4" />
              <span>Renew automatically</span>
            </label>
            <div className="text-right">
              <p className="text-xs text-muted-foreground">Total due today</p>
              <p className="text-2xl font-semibold tabular-nums">{formatGhs(total)}</p>
            </div>
            <Button type="submit" disabled={!paystackAvailable || selectedProducts.length === 0} size="lg">
              Continue to secure payment
            </Button>
            {!paystackAvailable ? <p className="text-xs text-muted-foreground">Paystack checkout is temporarily unavailable.</p> : null}
          </div>
        </CardContent>
      </Card>
    </form>
  );
}
