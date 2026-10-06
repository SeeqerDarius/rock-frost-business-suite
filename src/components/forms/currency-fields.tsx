import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SUPPORTED_CURRENCIES } from "@/lib/localization";

/**
 * Document currency and optional explicit exchange rate. The server resolves
 * the authoritative rate: the recorded rate for the document date unless the
 * user enters one here (for example the rate on a bank advice).
 */
export function CurrencyFields({ baseCurrency, idPrefix = "doc", rateLabel = "Exchange rate" }: { baseCurrency: string; idPrefix?: string; rateLabel?: string }) {
  const currencies = [...new Set([baseCurrency, ...SUPPORTED_CURRENCIES])];
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <div className="space-y-2">
        <Label htmlFor={`${idPrefix}-currency`}>Currency</Label>
        <select id={`${idPrefix}-currency`} name="currency" defaultValue={baseCurrency} className="h-10 w-full rounded-md border bg-background px-3">
          {currencies.map((code) => <option key={code} value={code}>{code}{code === baseCurrency ? " (base)" : ""}</option>)}
        </select>
      </div>
      <div className="space-y-2">
        <Label htmlFor={`${idPrefix}-exchangeRate`}>{rateLabel} (optional)</Label>
        <Input id={`${idPrefix}-exchangeRate`} name="exchangeRate" inputMode="decimal" pattern="[0-9]+(\.[0-9]{1,10})?" placeholder={`1 unit = x ${baseCurrency}`} />
        <p className="text-xs text-muted-foreground">Leave blank to use the recorded rate for the date. Ignored for {baseCurrency}.</p>
      </div>
    </div>
  );
}

/** Settlement rate for a foreign-currency payment. */
export function SettlementRateField({ id, currency, baseCurrency }: { id: string; currency: string; baseCurrency: string }) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>Settlement rate (optional)</Label>
      <Input id={id} name="exchangeRate" inputMode="decimal" pattern="[0-9]+(\.[0-9]{1,10})?" placeholder={`1 ${currency} = x ${baseCurrency}`} />
      <p className="text-xs text-muted-foreground">Leave blank to use the recorded rate for the payment date. Any difference from the invoice rate posts as realized foreign exchange gain or loss.</p>
    </div>
  );
}
