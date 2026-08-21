"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { lookupBarcodeAction, type BarcodeLookupState } from "../actions";

const initialState: BarcodeLookupState = {};

/** Tenant-scoped barcode lookup for medicines and batches — see lookupBarcodeAction. */
export function BarcodeLookup() {
  const [state, action, pending] = useActionState(lookupBarcodeAction, initialState);
  return (
    <form action={action} className="flex flex-wrap items-end gap-2">
      <Input name="barcode" placeholder="Scan or type a barcode" className="h-9 w-56" />
      <Button type="submit" variant="outline" size="sm" disabled={pending}>{pending ? "Looking up…" : "Look up barcode"}</Button>
      {state.searched ? (
        state.medicine || state.batch ? (
          <span className="text-xs text-muted-foreground" aria-live="polite">
            {state.medicine ? `Medicine: ${state.medicine.name} (${state.medicine.sku})` : ""}
            {state.medicine && state.batch ? " · " : ""}
            {state.batch ? `Batch: ${state.batch.medicineName} · ${state.batch.batchNumber} (${state.batch.quantity} in stock)` : ""}
          </span>
        ) : (
          <span className="text-xs text-muted-foreground" aria-live="polite">No medicine or batch matches this barcode.</span>
        )
      ) : null}
    </form>
  );
}
