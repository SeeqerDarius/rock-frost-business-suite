import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { SUPPORTED_CURRENCIES } from "@/lib/localization";
import { dayInput, humanize, SELECT_CLASS } from "./shared";

type Options = {
  categories: { id: string; name: string }[];
  types: { id: string; name: string; categoryId: string | null }[];
  branches: { id: string; name: string }[];
  members: { id: string; name: string | null; email: string }[];
};

export type ContractFormValues = {
  title?: string; categoryId?: string | null; typeId?: string | null; branchId?: string | null; ownerId?: string | null; department?: string | null;
  counterpartyName?: string; value?: string | null; currency?: string; taxTreatment?: string | null; startDate?: Date | null; effectiveDate?: Date | null;
  expirationDate?: Date | null; renewalDate?: Date | null; noticePeriodDays?: number | null; renewalType?: string; renewalTermMonths?: number | null; paymentTerms?: string | null;
  billingFrequency?: string | null; governingLaw?: string | null; governingJurisdiction?: string | null; language?: string | null; riskLevel?: string;
  confidentiality?: string; description?: string | null; body?: string | null; tags?: string[]; notes?: string | null;
};

const field = (name: string, label: string, value: string | number | null | undefined, extra: { type?: string; required?: boolean; placeholder?: string; hint?: string; disabled?: boolean } = {}) => (
  <div className="space-y-1.5">
    <Label htmlFor={name} required={extra.required}>{label}</Label>
    <Input id={name} name={name} type={extra.type ?? "text"} defaultValue={value ?? ""} required={extra.required} placeholder={extra.placeholder} disabled={extra.disabled} />
    {extra.hint ? <p className="text-xs text-muted-foreground">{extra.hint}</p> : null}
  </div>
);

/**
 * Contract fields shared by create and edit. Financial fields are disabled
 * for users without contracts.view_financials; the server ignores them for
 * those users regardless.
 */
export function ContractFormFields({ values, options, baseCurrency, canViewFinancials, currentUserId }: { values: ContractFormValues; options: Options; baseCurrency: string; canViewFinancials: boolean; currentUserId: string }) {
  const select = (name: string, label: string, value: string | null | undefined, items: { value: string; label: string }[], empty?: string) => (
    <div className="space-y-1.5">
      <Label htmlFor={name}>{label}</Label>
      <select id={name} name={name} defaultValue={value ?? ""} className={SELECT_CLASS}>
        {empty !== undefined ? <option value="">{empty}</option> : null}
        {items.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
      </select>
    </div>
  );
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader><CardTitle>Contract</CardTitle><CardDescription>What the contract is, who it is with, and who owns it internally.</CardDescription></CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">{field("title", "Title", values.title, { required: true })}</div>
          {field("counterpartyName", "Counterparty", values.counterpartyName, { required: true, hint: "The main other party. Add further parties after saving." })}
          {select("ownerId", "Internal owner", values.ownerId ?? currentUserId, options.members.map((member) => ({ value: member.id, label: member.name ?? member.email })))}
          {select("categoryId", "Category", values.categoryId, options.categories.map((category) => ({ value: category.id, label: category.name })), "Uncategorized")}
          {select("typeId", "Contract type", values.typeId, options.types.map((type) => ({ value: type.id, label: type.name })), "Not specified")}
          {field("department", "Department", values.department)}
          {select("branchId", "Branch", values.branchId, options.branches.map((branch) => ({ value: branch.id, label: branch.name })), "Organization-wide")}
          {field("tags", "Tags", values.tags?.join(", "), { placeholder: "lease, fleet, priority", hint: "Separate tags with commas." })}
          {select("language", "Language", values.language ?? "en", [{ value: "en", label: "English" }, { value: "fr", label: "French" }, { value: "de", label: "German" }, { value: "es", label: "Spanish" }, { value: "pt", label: "Portuguese" }, { value: "nl", label: "Dutch" }, { value: "it", label: "Italian" }])}
          <div className="space-y-1.5 sm:col-span-2"><Label htmlFor="description">Description</Label><Textarea id="description" name="description" rows={3} defaultValue={values.description ?? ""} /></div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Dates and renewal</CardTitle><CardDescription>Expiry and renewal dates drive the dashboard and alerts.</CardDescription></CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-3">
          {field("startDate", "Start date", dayInput(values.startDate), { type: "date" })}
          {field("effectiveDate", "Effective date", dayInput(values.effectiveDate), { type: "date" })}
          {field("expirationDate", "Expiration date", dayInput(values.expirationDate), { type: "date" })}
          {select("renewalType", "Renewal type", values.renewalType ?? "FIXED_TERM", ["FIXED_TERM", "EVERGREEN", "AUTO_RENEWAL", "MANUAL_RENEWAL", "NO_RENEWAL"].map((value) => ({ value, label: humanize(value) })))}
          {field("renewalDate", "Renewal date", dayInput(values.renewalDate), { type: "date" })}
          {field("noticePeriodDays", "Notice period (days)", values.noticePeriodDays, { type: "number" })}
          {field("renewalTermMonths", "Renewal term (months)", values.renewalTermMonths, { type: "number" })}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Commercial terms</CardTitle><CardDescription>{canViewFinancials ? "Contract value and payment terms." : "Financial terms are hidden for your role."}</CardDescription></CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-3">
          {field("value", "Contract value", canViewFinancials ? values.value : null, { placeholder: "0.00", disabled: !canViewFinancials })}
          {select("currency", "Currency", values.currency ?? baseCurrency, [...new Set([values.currency ?? baseCurrency, baseCurrency, ...SUPPORTED_CURRENCIES])].map((code) => ({ value: code, label: code })))}
          {field("taxTreatment", "Tax treatment", canViewFinancials ? values.taxTreatment : null, { disabled: !canViewFinancials, placeholder: "e.g. Standard-rated VAT" })}
          {field("paymentTerms", "Payment terms", canViewFinancials ? values.paymentTerms : null, { disabled: !canViewFinancials, placeholder: "e.g. Net 30" })}
          {field("billingFrequency", "Billing frequency", canViewFinancials ? values.billingFrequency : null, { disabled: !canViewFinancials, placeholder: "e.g. Monthly" })}
          {field("governingLaw", "Governing law", values.governingLaw, { placeholder: "e.g. Laws of Ghana" })}
          {field("governingJurisdiction", "Governing jurisdiction", values.governingJurisdiction, { placeholder: "e.g. Courts of Accra" })}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Risk and confidentiality</CardTitle><CardDescription>Confidential and restricted contracts are visible only to the creator, owner, and people, roles, or departments you grant access to. Risk is your organization&apos;s own classification, not a legal assessment.</CardDescription></CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          {select("riskLevel", "Risk classification", values.riskLevel ?? "LOW", ["LOW", "MEDIUM", "HIGH", "CRITICAL"].map((value) => ({ value, label: humanize(value) })))}
          {select("confidentiality", "Confidentiality", values.confidentiality ?? "STANDARD", [{ value: "STANDARD", label: "Standard" }, { value: "CONFIDENTIAL", label: "Confidential" }, { value: "RESTRICTED", label: "Restricted" }])}
          <div className="space-y-1.5 sm:col-span-2"><Label htmlFor="notes">Internal notes</Label><Textarea id="notes" name="notes" rows={3} defaultValue={values.notes ?? ""} /></div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Contract text</CardTitle><CardDescription>Optional drafted text. Signed originals belong in Documents.</CardDescription></CardHeader>
        <CardContent><Textarea id="body" name="body" rows={10} defaultValue={values.body ?? ""} className="font-mono text-sm" aria-label="Contract text" /></CardContent>
      </Card>
    </div>
  );
}
