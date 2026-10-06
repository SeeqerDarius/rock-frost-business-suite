"use client";

import { useActionState, useMemo, useState } from "react";
import { CheckCircle2, Info, Lock, TriangleAlert } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  DATE_FORMATS,
  LEGAL_ENTITY_TYPES,
  MONTH_NAMES,
  NUMBER_FORMATS,
  SUPPORTED_CURRENCIES,
  SUPPORTED_LANGUAGES,
  getCountryProfile,
  listCountries,
  listTimeZones,
  suggestUsTimezone,
} from "@/lib/localization";
import { createOrganizationFormatter } from "@/lib/org-format";
import { updateLocalizationAction, type LocalizationFormState } from "./actions";

type Values = {
  legalName: string; tradingName: string; country: string; region: string; city: string; address: string; postalCode: string;
  legalEntityType: string; taxNumber: string; vatRegistrationNumber: string; businessRegistrationNumber: string; currency: string;
  fiscalYearStartMonth: number; accountingBasis: "ACCRUAL" | "CASH"; timezone: string; locale: string; dateFormat: string;
  numberFormat: string; defaultLanguage: string; pricesIncludeTax: boolean; jurisdictionCode: string;
};

const SELECT_CLASS = "h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-xs focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-60";
const SUGGESTED_FIELDS = ["currency", "timezone", "locale", "dateFormat", "fiscalYearStartMonth"] as const;
type SuggestedField = (typeof SUGGESTED_FIELDS)[number];

function humanize(value: string) {
  return value.toLowerCase().split("_").map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join(" ");
}

export function LocalizationForm({ initial, baseCurrencyLocked, accountingCounts, hasTaxHistory }: {
  initial: Values;
  baseCurrencyLocked: boolean;
  accountingCounts: { journalEntries: number; invoices: number; bills: number };
  hasTaxHistory: boolean;
}) {
  const [state, action, pending] = useActionState<LocalizationFormState, FormData>(updateLocalizationAction, {});
  const [values, setValues] = useState<Values>({ ...initial, locale: initial.locale || getCountryProfile(initial.country || null).locale || "en-GH" });
  const [touched, setTouched] = useState<Set<SuggestedField>>(new Set());
  const countries = useMemo(() => listCountries(), []);
  const timeZones = useMemo(() => listTimeZones(), []);
  const profile = getCountryProfile(values.country || null);
  const labels = profile.labels;
  const preview = createOrganizationFormatter(values);
  const currencyChanging = values.currency !== initial.currency;
  const jurisdictionChanging = !!values.country && profile.jurisdictionCode !== initial.jurisdictionCode;

  function set<K extends keyof Values>(key: K, value: Values[K]) {
    setValues((current) => ({ ...current, [key]: value }));
    if ((SUGGESTED_FIELDS as readonly string[]).includes(key)) setTouched((current) => new Set(current).add(key as SuggestedField));
  }

  /** Country suggests defaults only for fields the administrator has not edited. */
  function chooseCountry(country: string) {
    const next = getCountryProfile(country);
    setValues((current) => {
      const updated: Values = { ...current, country };
      if (!touched.has("currency") && next.currency && !baseCurrencyLocked) updated.currency = next.currency;
      if (!touched.has("timezone") && next.timezone) updated.timezone = next.countryCode === "US" ? suggestUsTimezone(current.region) : next.timezone;
      if (!touched.has("locale") && next.locale) updated.locale = next.locale;
      if (!touched.has("dateFormat")) updated.dateFormat = "LOCALE";
      if (!touched.has("fiscalYearStartMonth")) updated.fiscalYearStartMonth = next.fiscalYearStartMonth;
      return updated;
    });
  }

  const field = (name: keyof Values, label: string, options: { required?: boolean; placeholder?: string; hint?: string } = {}) => (
    <div className="space-y-1.5">
      <Label htmlFor={name} required={options.required}>{label}</Label>
      <Input id={name} name={name} value={String(values[name] ?? "")} onChange={(event) => set(name, event.target.value as never)} required={options.required} placeholder={options.placeholder} />
      {options.hint ? <p className="text-xs text-muted-foreground">{options.hint}</p> : null}
    </div>
  );

  return (
    <form action={action} className="space-y-6">
      {state.status === "saved" ? (
        <Alert><CheckCircle2 /><AlertTitle>Settings saved</AlertTitle><AlertDescription>{state.message} Formatting updates across the workspace on the next page load.</AlertDescription></Alert>
      ) : state.status === "error" ? (
        <Alert variant="destructive"><TriangleAlert /><AlertTitle>Settings were not saved</AlertTitle><AlertDescription>{state.message}</AlertDescription></Alert>
      ) : state.status === "unchanged" ? (
        <Alert><Info /><AlertTitle>Nothing changed</AlertTitle><AlertDescription>{state.message}</AlertDescription></Alert>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Legal identity</CardTitle>
          <CardDescription>How the organization appears on invoices, contracts, and statutory reports.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          {field("legalName", "Legal business name", { required: true })}
          {field("tradingName", "Trading name", { hint: "Optional. Shown alongside the legal name where relevant." })}
          <div className="space-y-1.5">
            <Label htmlFor="legalEntityType">Business type / legal entity</Label>
            <select id="legalEntityType" name="legalEntityType" className={SELECT_CLASS} value={values.legalEntityType} onChange={(event) => set("legalEntityType", event.target.value)}>
              <option value="">Not specified</option>
              {LEGAL_ENTITY_TYPES.map((type) => <option key={type} value={type}>{humanize(type)}</option>)}
            </select>
          </div>
          {field("businessRegistrationNumber", labels.businessRegistration)}
          {field("taxNumber", labels.taxId)}
          {field("vatRegistrationNumber", labels.indirectTaxRegistration, { hint: "Leave blank if the organization is not registered." })}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Registered address</CardTitle>
          <CardDescription>Country of registration selects the tax jurisdiction pack and suggests defaults below.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="country" required>Country of registration</Label>
            <select id="country" name="country" required className={SELECT_CLASS} value={values.country} onChange={(event) => chooseCountry(event.target.value)}>
              <option value="" disabled>Choose a country</option>
              {countries.map((country) => <option key={country.code} value={country.code}>{country.name}</option>)}
            </select>
            {values.country ? <p className="text-xs text-muted-foreground">Tax jurisdiction: {profile.jurisdictionCode}{profile.euMember ? " (EU VAT member state)" : ""}</p> : null}
          </div>
          {field("region", labels.region)}
          {field("city", "City")}
          {field("postalCode", labels.postalCode)}
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="address">Registered address</Label>
            <Input id="address" name="address" value={values.address} onChange={(event) => set("address", event.target.value)} />
          </div>
          {jurisdictionChanging && initial.jurisdictionCode ? (
            <Alert className="sm:col-span-2">
              <TriangleAlert />
              <AlertTitle>Tax jurisdiction will change from {initial.jurisdictionCode} to {profile.jurisdictionCode}</AlertTitle>
              <AlertDescription>
                Existing invoices, bills, and tax records keep the rates and jurisdiction they were recorded under. New documents use the new jurisdiction&apos;s tax configuration.
                {hasTaxHistory ? (
                  <label className="mt-2 flex items-center gap-2 font-medium text-foreground"><input type="checkbox" name="confirmJurisdictionChange" className="size-4" required />I understand and want to change the tax jurisdiction</label>
                ) : null}
              </AlertDescription>
            </Alert>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Accounting defaults</CardTitle>
          <CardDescription>The base currency is the currency every ledger balance is kept in. It comes from these settings, never from a visitor&apos;s location.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="currency" required>Base currency</Label>
            {baseCurrencyLocked ? <input type="hidden" name="currency" value={initial.currency} /> : null}
            <select id="currency" name={baseCurrencyLocked ? undefined : "currency"} required disabled={baseCurrencyLocked} className={SELECT_CLASS} value={values.currency} onChange={(event) => set("currency", event.target.value)}>
              {[...new Set([initial.currency, ...SUPPORTED_CURRENCIES])].map((code) => <option key={code} value={code}>{code}</option>)}
            </select>
            {baseCurrencyLocked ? (
              <p className="flex items-start gap-1.5 text-xs text-muted-foreground"><Lock className="mt-0.5 size-3 shrink-0" />Locked: {accountingCounts.journalEntries} journal entries, {accountingCounts.invoices} invoices, and {accountingCounts.bills} bills already exist in {initial.currency}. Record foreign-currency transactions instead of changing the base currency.</p>
            ) : null}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="fiscalYearStartMonth" required>Fiscal year starts</Label>
            <select id="fiscalYearStartMonth" name="fiscalYearStartMonth" className={SELECT_CLASS} value={values.fiscalYearStartMonth} onChange={(event) => set("fiscalYearStartMonth", Number(event.target.value))}>
              {MONTH_NAMES.map((month, index) => <option key={month} value={index + 1}>{month}</option>)}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="accountingBasis" required>Accounting method</Label>
            <select id="accountingBasis" name="accountingBasis" className={SELECT_CLASS} value={values.accountingBasis} onChange={(event) => set("accountingBasis", event.target.value as Values["accountingBasis"])}>
              <option value="ACCRUAL">Accrual</option>
              <option value="CASH">Cash</option>
            </select>
            <p className="text-xs text-muted-foreground">Recorded for reporting. The ledger continues to post documents on an accrual basis.</p>
          </div>
          <div className="flex items-start gap-2 rounded-md border p-3 text-sm sm:self-end">
            <input id="pricesIncludeTax" name="pricesIncludeTax" type="checkbox" className="mt-0.5 size-4" checked={values.pricesIncludeTax} onChange={(event) => set("pricesIncludeTax", event.target.checked)} />
            <label htmlFor="pricesIncludeTax"><span className="font-medium">Prices include tax by default</span><span className="block text-xs text-muted-foreground">New invoices start tax-inclusive. Each document can still be changed.</span></label>
          </div>
          {currencyChanging && !baseCurrencyLocked ? (
            <Alert className="sm:col-span-2">
              <TriangleAlert />
              <AlertTitle>Change base currency to {values.currency}?</AlertTitle>
              <AlertDescription>
                No accounting records exist yet, so the change is allowed. Amounts already entered in other modules (for example, Fleet or School fees) are not converted.
                <label className="mt-2 flex items-center gap-2 font-medium text-foreground"><input type="checkbox" name="confirmBaseCurrencyChange" className="size-4" required />Change the base currency</label>
              </AlertDescription>
            </Alert>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Time, language, and formatting</CardTitle>
          <CardDescription>Dates, reporting periods, and deadlines follow the organization timezone. Timestamps are stored in UTC.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="timezone" required>Default timezone</Label>
            <select id="timezone" name="timezone" required className={SELECT_CLASS} value={values.timezone} onChange={(event) => set("timezone", event.target.value)}>
              {[...new Set([values.timezone, ...timeZones])].map((zone) => <option key={zone} value={zone}>{zone.replaceAll("_", " ")}</option>)}
            </select>
            <p className="text-xs text-muted-foreground">Branches can set their own timezone.</p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="defaultLanguage" required>Language</Label>
            <select id="defaultLanguage" name="defaultLanguage" className={SELECT_CLASS} value={values.defaultLanguage} onChange={(event) => set("defaultLanguage", event.target.value)}>
              {Object.entries(SUPPORTED_LANGUAGES).map(([code, name]) => <option key={code} value={code}>{name}</option>)}
            </select>
            <p className="text-xs text-muted-foreground">Used for generated documents. The application interface is currently in English.</p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="locale" required>Locale</Label>
            <Input id="locale" name="locale" required value={values.locale} onChange={(event) => set("locale", event.target.value)} placeholder="en-US" pattern="[a-z]{2,3}(-[A-Za-z0-9]{2,8})*" />
            <p className="text-xs text-muted-foreground">BCP 47 tag, for example en-US, de-DE, fr-FR, en-GH.</p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="dateFormat" required>Date format</Label>
            <select id="dateFormat" name="dateFormat" className={SELECT_CLASS} value={values.dateFormat} onChange={(event) => set("dateFormat", event.target.value)}>
              {Object.entries(DATE_FORMATS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="numberFormat" required>Number format</Label>
            <select id="numberFormat" name="numberFormat" className={SELECT_CLASS} value={values.numberFormat} onChange={(event) => set("numberFormat", event.target.value)}>
              {Object.entries(NUMBER_FORMATS).map(([key, option]) => <option key={key} value={key}>{option.label}</option>)}
            </select>
          </div>
          <div className="rounded-md border bg-muted/30 p-3 text-sm sm:col-span-2" aria-live="polite">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Preview</p>
            <dl className="mt-2 grid gap-2 sm:grid-cols-3">
              <div><dt className="text-xs text-muted-foreground">Amount</dt><dd className="font-medium tabular-nums">{preview.money("1250.50")}</dd></div>
              <div><dt className="text-xs text-muted-foreground">Date</dt><dd className="font-medium">{preview.date(new Date("2026-03-31T12:00:00Z"))}</dd></div>
              <div><dt className="text-xs text-muted-foreground">Quantity</dt><dd className="font-medium tabular-nums">{preview.number(1234567.891, { maximumFractionDigits: 3 })}</dd></div>
            </dl>
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button type="submit" disabled={pending}>{pending ? "Saving…" : "Save localization settings"}</Button>
      </div>
    </form>
  );
}
