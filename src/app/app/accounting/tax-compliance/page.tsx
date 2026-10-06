import Link from "next/link";
import { cookies } from "next/headers";
import { CheckCircle2, Info, Landmark, Lock, Plus, TriangleAlert } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/feedback/empty-state";
import { EntityDialog } from "@/components/forms/entity-dialog";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { requireModuleAccess } from "@/lib/auth/module-access";
import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import { db } from "@/lib/db";
import { createOrganizationFormatter } from "@/lib/org-format";
import { cn } from "@/lib/utils";
import { listContacts } from "@/modules/accounting/service";
import { TAX_FLASH_COOKIE } from "@/modules/tax/flash";
import { listJurisdictionPacks, packKeyForJurisdiction } from "@/modules/tax/packs";
import { getTaxConfiguration } from "@/modules/tax/service";
import { US_STATE_BASE_RATE_REFERENCE, US_STATES } from "@/modules/tax/packs/united-states";
import {
  createCategoryAction,
  createExemptionAction,
  createJurisdictionAction,
  createRateAction,
  createRateVersionAction,
  createRuleAction,
  provisionPackAction,
  saveRegistrationAction,
  toggleRuleAction,
} from "./actions";

export const metadata = { title: "Tax and compliance" };

const SECTIONS = [
  { key: "overview", label: "Overview" },
  { key: "rates", label: "Rates" },
  { key: "rules", label: "Rules" },
  { key: "registrations", label: "Registrations and nexus" },
  { key: "exemptions", label: "Customer exemptions" },
  { key: "jurisdictions", label: "Jurisdictions" },
  { key: "categories", label: "Categories" },
] as const;
type SectionKey = (typeof SECTIONS)[number]["key"];

const SELECT = "h-10 w-full rounded-md border bg-background px-3 text-sm";
const humanize = (value: string) => value.toLowerCase().split("_").map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join(" ");

export default async function TaxCompliancePage({ searchParams }: { searchParams: Promise<{ section?: string; saved?: string; error?: string }> }) {
  const tenant = await requireModuleAccess("accounting");
  if (!hasPermission(tenant, PERMISSIONS.ACCOUNTING_VIEW)) {
    return <EmptyState icon={Lock} title="You don't have access to this page" description="Tax and compliance settings are visible to roles with Accounting access." />;
  }
  const params = await searchParams;
  const section: SectionKey = (SECTIONS.find((item) => item.key === params.section)?.key ?? "overview") as SectionKey;
  const canManage = hasPermission(tenant, PERMISSIONS.ACCOUNTING_SETTINGS_MANAGE);
  const [config, organization, contacts] = await Promise.all([
    getTaxConfiguration(tenant.organizationId),
    db.organization.findUniqueOrThrow({ where: { id: tenant.organizationId }, select: { jurisdictionCode: true, country: true, currency: true, locale: true, timezone: true, dateFormat: true, numberFormat: true, pricesIncludeTax: true } }),
    listContacts(tenant.organizationId),
  ]);
  const format = createOrganizationFormatter(organization);
  const flash = params.error === "1" ? (await cookies()).get(TAX_FLASH_COOKIE)?.value : params.error === "confirm" ? "Confirm the rate change before saving." : params.error === "forbidden" ? "Changing tax configuration requires Accounting settings permission." : null;
  const suggestedPack = packKeyForJurisdiction(organization.jurisdictionCode);
  const packs = listJurisdictionPacks();
  const provisionedPacks = new Set(config.jurisdictions.map((jurisdiction) => jurisdiction.packKey).filter(Boolean));
  const latestRates = [...new Map(config.rates.map((rate) => [rate.code, rate])).values()];
  const today = new Date().toISOString().slice(0, 10);
  const dateOf = (value: Date | null) => (value ? format.date(value.toISOString().slice(0, 10) + "T12:00:00Z") : "Open");

  return (
    <div className="space-y-6">
      <PageHeader title="Tax and compliance" description="Configure the tax jurisdictions, registrations, rates, and rules your organization uses. Calculations follow your selected tax settings; confirm with your accountant what applies to your business." />

      {params.saved ? <Alert><CheckCircle2 /><AlertTitle>Saved</AlertTitle><AlertDescription>The change is recorded in the audit log. Existing documents keep the tax they were created with.</AlertDescription></Alert> : null}
      {flash ? <Alert variant="destructive"><TriangleAlert /><AlertTitle>Not saved</AlertTitle><AlertDescription>{flash}</AlertDescription></Alert> : null}

      <nav aria-label="Tax configuration sections" className="flex flex-wrap gap-1 border-b">
        {SECTIONS.map((item) => (
          <Link key={item.key} href={`?section=${item.key}`} aria-current={section === item.key ? "page" : undefined} className={cn("rounded-t-md px-3 py-2 text-sm", section === item.key ? "border-b-2 border-primary font-medium text-foreground" : "text-muted-foreground hover:text-foreground")}>{item.label}</Link>
        ))}
      </nav>

      {section === "overview" ? (
        <div className="grid gap-4 lg:grid-cols-3">
          <Card className="lg:col-span-2">
            <CardHeader><CardTitle>Jurisdiction packs</CardTitle><CardDescription>A pack seeds starting jurisdictions, authorities, categories, rates, and rules. Your configuration stays editable, and re-applying a pack never overwrites your changes.</CardDescription></CardHeader>
            <CardContent className="space-y-3">
              {packs.map((pack) => (
                <div key={pack.key} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3">
                  <div>
                    <p className="font-medium">{pack.name} <span className="text-xs text-muted-foreground">v{pack.version}</span> {pack.key === suggestedPack ? <Badge variant="secondary" className="ml-1">Your jurisdiction</Badge> : null} {pack.foundationOnly ? <Badge variant="outline" className="ml-1">Foundation</Badge> : null}</p>
                    <p className="text-sm text-muted-foreground">{pack.description}</p>
                  </div>
                  {provisionedPacks.has(pack.key) ? <Badge variant="outline">Applied</Badge> : canManage ? (
                    <form action={provisionPackAction}><input type="hidden" name="packKey" value={pack.key} /><Button size="sm" variant="outline">Apply pack</Button></form>
                  ) : null}
                </div>
              ))}
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>At a glance</CardTitle></CardHeader>
            <CardContent>
              <dl className="grid grid-cols-2 gap-3 text-sm">
                <div><dt className="text-muted-foreground">Organization jurisdiction</dt><dd className="font-medium">{organization.jurisdictionCode ?? "Not set"}</dd></div>
                <div><dt className="text-muted-foreground">Default pricing</dt><dd className="font-medium">{organization.pricesIncludeTax ? "Tax inclusive" : "Tax exclusive"}</dd></div>
                <div><dt className="text-muted-foreground">Jurisdictions</dt><dd className="font-medium tabular-nums">{config.jurisdictions.length}</dd></div>
                <div><dt className="text-muted-foreground">Active rules</dt><dd className="font-medium tabular-nums">{config.rules.filter((rule) => rule.active).length}</dd></div>
                <div><dt className="text-muted-foreground">Registrations</dt><dd className="font-medium tabular-nums">{config.registrations.filter((registration) => registration.status === "REGISTERED").length}</dd></div>
                <div><dt className="text-muted-foreground">Exemptions</dt><dd className="font-medium tabular-nums">{config.exemptions.length}</dd></div>
              </dl>
              <Alert className="mt-4"><Info /><AlertDescription>Change the organization jurisdiction and default pricing in <Link className="underline" href="/app/organization/settings/localization">localization settings</Link>. Legacy tax codes remain available on the <Link className="underline" href="/app/accounting/tax">Tax and VAT</Link> page.</AlertDescription></Alert>
            </CardContent>
          </Card>
        </div>
      ) : null}

      {section === "rates" ? (
        <Card>
          <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3">
            <div><CardTitle>Rates</CardTitle><CardDescription>Each rate is effective-dated. Changing a rate records a new version from a future date; earlier versions are never edited, so historical documents keep their original tax.</CardDescription></div>
            {canManage && config.jurisdictions.length ? (
              <EntityDialog trigger={<Button size="sm"><Plus />New rate</Button>} title="New tax rate" action={createRateAction} contentClassName="sm:max-w-xl">
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5"><Label htmlFor="rate-code" required>Code</Label><Input id="rate-code" name="code" required placeholder="US-GA" /></div>
                  <div className="space-y-1.5"><Label htmlFor="rate-name" required>Name</Label><Input id="rate-name" name="name" required /></div>
                  <div className="space-y-1.5"><Label htmlFor="rate-jurisdiction" required>Jurisdiction</Label><select id="rate-jurisdiction" name="jurisdictionCode" className={SELECT} required>{config.jurisdictions.map((j) => <option key={j.id} value={j.code}>{j.code} ({humanize(j.level)})</option>)}</select></div>
                  <div className="space-y-1.5"><Label htmlFor="rate-kind" required>Tax kind</Label><select id="rate-kind" name="taxKind" className={SELECT}>{["VAT", "GST", "SALES", "USE", "LEVY", "EXCISE", "OTHER"].map((kind) => <option key={kind} value={kind}>{humanize(kind)}</option>)}</select></div>
                  <div className="space-y-1.5"><Label htmlFor="rate-value" required>Rate (%)</Label><Input id="rate-value" name="rate" required inputMode="decimal" pattern="[0-9]+(\.[0-9]{1,6})?" /></div>
                  <div className="space-y-1.5"><Label htmlFor="rate-from" required>Effective from</Label><Input id="rate-from" name="effectiveFrom" type="date" defaultValue={today} required /></div>
                  <div className="space-y-1.5"><Label htmlFor="rate-output">Output account code</Label><Input id="rate-output" name="outputAccountCode" placeholder="Default by kind" /></div>
                  <div className="space-y-1.5"><Label htmlFor="rate-input">Input account code</Label><Input id="rate-input" name="inputAccountCode" placeholder="Default by kind" /></div>
                </div>
                <div className="space-y-1.5"><Label htmlFor="rate-source">Source or reference</Label><Input id="rate-source" name="sourceReference" placeholder="Statute, authority notice, or URL" /></div>
                <div className="flex flex-wrap gap-4 text-sm"><label className="flex items-center gap-2"><input type="checkbox" name="recoverable" defaultChecked className="size-4" />Recoverable as input tax</label><label className="flex items-center gap-2"><input type="checkbox" name="compound" className="size-4" />Compound (applies on top of other taxes)</label></div>
              </EntityDialog>
            ) : null}
          </CardHeader>
          <CardContent>
            {config.rates.length === 0 ? <EmptyState icon={Landmark} title="No rates yet" description="Apply your jurisdiction pack from the Overview or add a jurisdiction first." /> : (
              <Table>
                <TableHeader><TableRow><TableHead>Code</TableHead><TableHead>Jurisdiction</TableHead><TableHead>Kind</TableHead><TableHead className="text-right">Rate</TableHead><TableHead>Effective</TableHead><TableHead>Version</TableHead>{canManage ? <TableHead /> : null}</TableRow></TableHeader>
                <TableBody>
                  {config.rates.map((rate) => {
                    const isLatest = latestRates.some((latest) => latest.id === rate.id);
                    return (
                      <TableRow key={rate.id} className={isLatest ? "" : "text-muted-foreground"}>
                        <TableCell><div className="font-medium">{rate.code}</div><div className="text-xs text-muted-foreground">{rate.name}{rate.compound ? " · compound" : ""}{rate.recoverable ? "" : " · not recoverable"}</div></TableCell>
                        <TableCell>{rate.jurisdiction.code}</TableCell>
                        <TableCell>{humanize(rate.taxKind)}</TableCell>
                        <TableCell className="text-right tabular-nums">{format.number(rate.rate.toString(), { maximumFractionDigits: 6 })}%</TableCell>
                        <TableCell className="text-sm">{dateOf(rate.effectiveFrom)} to {dateOf(rate.effectiveTo)}</TableCell>
                        <TableCell>v{rate.version}{isLatest ? <Badge variant="secondary" className="ml-2">Current</Badge> : null}</TableCell>
                        {canManage ? (
                          <TableCell className="text-right">
                            {isLatest ? (
                              <EntityDialog trigger={<Button size="sm" variant="ghost">Change rate</Button>} title={`Change ${rate.code} from a date`} description="Creates a new version. Documents dated before the new date keep the current rate." action={createRateVersionAction} submitLabel="Record new rate">
                                <input type="hidden" name="code" value={rate.code} />
                                <div className="grid gap-3 sm:grid-cols-2">
                                  <div className="space-y-1.5"><Label htmlFor={`v-rate-${rate.id}`} required>New rate (%)</Label><Input id={`v-rate-${rate.id}`} name="rate" required inputMode="decimal" pattern="[0-9]+(\.[0-9]{1,6})?" defaultValue={rate.rate.toString()} /></div>
                                  <div className="space-y-1.5"><Label htmlFor={`v-from-${rate.id}`} required>Effective from</Label><Input id={`v-from-${rate.id}`} name="effectiveFrom" type="date" required /></div>
                                </div>
                                <div className="space-y-1.5"><Label htmlFor={`v-source-${rate.id}`}>Source or reference</Label><Input id={`v-source-${rate.id}`} name="sourceReference" /></div>
                                <Alert><TriangleAlert /><AlertDescription>This affects documents dated on or after the new date only. It cannot start on or before the current version&apos;s start date.<label className="mt-2 flex items-center gap-2 font-medium text-foreground"><input type="checkbox" name="confirm" className="size-4" required />I confirm this rate change</label></AlertDescription></Alert>
                              </EntityDialog>
                            ) : null}
                          </TableCell>
                        ) : null}
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      ) : null}

      {section === "rates" && suggestedPack === "US" ? (
        <Card>
          <CardHeader><CardTitle>Reference state base rates</CardTitle><CardDescription>Statewide base sales tax rates for reference when you add a state rate. Local county, city, and district rates are additional. Rates change; verify with the state department of revenue before use. Nothing here is applied automatically.</CardDescription></CardHeader>
          <CardContent>
            <div className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2 lg:grid-cols-3">
              {US_STATES.map((state) => {
                const reference = US_STATE_BASE_RATE_REFERENCE[state.code];
                return <div key={state.code} className="flex justify-between gap-3 border-b py-1"><span>{state.name}</span><span className="tabular-nums text-muted-foreground" title={reference?.note}>{reference ? `${format.number(reference.rate, { maximumFractionDigits: 3 })}%` : "-"}{reference?.note ? " *" : ""}</span></div>;
              })}
            </div>
            <p className="mt-3 text-xs text-muted-foreground">* See the note on hover. Record state and local rates you collect under Rates, and your registrations under Registrations and nexus.</p>
          </CardContent>
        </Card>
      ) : null}

      {section === "rules" ? (
        <Card>
          <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3">
            <div><CardTitle>Rules</CardTitle><CardDescription>A rule selects which rate components apply for a jurisdiction, category, and treatment. Invoices and bills choose a rule; the rates in effect on the document date are applied and stored with the document.</CardDescription></div>
            {canManage && latestRates.length ? (
              <EntityDialog trigger={<Button size="sm"><Plus />New rule</Button>} title="New tax rule" action={createRuleAction} contentClassName="sm:max-w-xl">
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5"><Label htmlFor="rule-code" required>Code</Label><Input id="rule-code" name="code" required /></div>
                  <div className="space-y-1.5"><Label htmlFor="rule-name" required>Name</Label><Input id="rule-name" name="name" required /></div>
                  <div className="space-y-1.5"><Label htmlFor="rule-jurisdiction" required>Jurisdiction</Label><select id="rule-jurisdiction" name="jurisdictionCode" className={SELECT}>{config.jurisdictions.map((j) => <option key={j.id} value={j.code}>{j.code}</option>)}</select></div>
                  <div className="space-y-1.5"><Label htmlFor="rule-treatment" required>Treatment</Label><select id="rule-treatment" name="treatment" className={SELECT}>{["STANDARD", "REDUCED", "ZERO_RATED", "EXEMPT", "REVERSE_CHARGE", "OUT_OF_SCOPE"].map((t) => <option key={t} value={t}>{humanize(t)}</option>)}</select></div>
                  <div className="space-y-1.5"><Label htmlFor="rule-category">Category</Label><select id="rule-category" name="categoryCode" className={SELECT}><option value="">Any</option>{config.categories.map((c) => <option key={c.id} value={c.code}>{c.name}</option>)}</select></div>
                  <div className="space-y-1.5"><Label htmlFor="rule-from" required>Effective from</Label><Input id="rule-from" name="effectiveFrom" type="date" defaultValue={today} required /></div>
                </div>
                <fieldset className="space-y-2"><legend className="text-sm font-medium">Rate components</legend><div className="grid max-h-48 gap-2 overflow-y-auto sm:grid-cols-2">{latestRates.map((rate) => <label key={rate.id} className="flex items-center gap-2 rounded-md border p-2 text-sm"><input type="checkbox" name="rateCodes" value={rate.code} className="size-4" />{rate.code} ({format.number(rate.rate.toString(), { maximumFractionDigits: 6 })}%)</label>)}</div></fieldset>
                <div className="space-y-1.5"><Label htmlFor="rule-source">Source or reference</Label><Input id="rule-source" name="sourceReference" /></div>
              </EntityDialog>
            ) : null}
          </CardHeader>
          <CardContent>
            {config.rules.length === 0 ? <EmptyState icon={Landmark} title="No rules yet" description="Rules appear here after you apply a pack or create one." /> : (
              <Table>
                <TableHeader><TableRow><TableHead>Rule</TableHead><TableHead>Jurisdiction</TableHead><TableHead>Treatment</TableHead><TableHead>Components</TableHead><TableHead>Effective</TableHead><TableHead>Status</TableHead>{canManage ? <TableHead /> : null}</TableRow></TableHeader>
                <TableBody>
                  {config.rules.map((rule) => (
                    <TableRow key={rule.id}>
                      <TableCell><div className="font-medium">{rule.code}</div><div className="text-xs text-muted-foreground">{rule.name}</div></TableCell>
                      <TableCell>{rule.jurisdiction.code}{rule.category ? <div className="text-xs text-muted-foreground">{rule.category.code}</div> : null}</TableCell>
                      <TableCell>{humanize(rule.treatment)}</TableCell>
                      <TableCell className="text-xs">{rule.rateCodes.join(", ")}</TableCell>
                      <TableCell className="text-sm">{dateOf(rule.effectiveFrom)} to {dateOf(rule.effectiveTo)}</TableCell>
                      <TableCell><Badge variant={rule.active ? "secondary" : "outline"}>{rule.active ? "Active" : "Inactive"}</Badge></TableCell>
                      {canManage ? <TableCell className="text-right"><form action={toggleRuleAction}><input type="hidden" name="ruleId" value={rule.id} /><input type="hidden" name="active" value={rule.active ? "false" : "true"} /><Button size="sm" variant="ghost">{rule.active ? "Deactivate" : "Activate"}</Button></form></TableCell> : null}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      ) : null}

      {section === "registrations" ? (
        <Card>
          <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3">
            <div><CardTitle>Registrations and nexus</CardTitle><CardDescription>Record where the organization is registered, monitoring nexus, or collecting tax. Rock Frost does not determine legal nexus. When collection is disabled for a jurisdiction, its components are not charged on new documents.</CardDescription></div>
            {canManage && config.jurisdictions.length ? (
              <EntityDialog trigger={<Button size="sm"><Plus />Record registration</Button>} title="Registration or nexus status" action={saveRegistrationAction} contentClassName="sm:max-w-xl">
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5"><Label htmlFor="reg-jurisdiction" required>Jurisdiction</Label><select id="reg-jurisdiction" name="jurisdictionCode" className={SELECT}>{config.jurisdictions.map((j) => <option key={j.id} value={j.code}>{j.code}: {j.name}</option>)}</select></div>
                  <div className="space-y-1.5"><Label htmlFor="reg-status" required>Status</Label><select id="reg-status" name="status" className={SELECT}>{["NOT_REGISTERED", "MONITORING", "REGISTERED", "DEREGISTERED"].map((s) => <option key={s} value={s}>{humanize(s)}</option>)}</select></div>
                  <div className="space-y-1.5"><Label htmlFor="reg-number">Registration number</Label><Input id="reg-number" name="registrationNumber" /></div>
                  <div className="space-y-1.5"><Label htmlFor="reg-frequency">Filing frequency</Label><select id="reg-frequency" name="filingFrequency" className={SELECT}><option value="">Not set</option>{["MONTHLY", "QUARTERLY", "SEMI_ANNUAL", "ANNUAL"].map((f) => <option key={f} value={f}>{humanize(f)}</option>)}</select></div>
                  <div className="space-y-1.5"><Label htmlFor="reg-from">Effective from</Label><Input id="reg-from" name="effectiveFrom" type="date" /></div>
                </div>
                <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="collectionEnabled" className="size-4" />Collect tax in this jurisdiction (requires Registered)</label>
                <div className="space-y-1.5"><Label htmlFor="reg-notes">Notes</Label><Input id="reg-notes" name="notes" /></div>
              </EntityDialog>
            ) : null}
          </CardHeader>
          <CardContent>
            {config.registrations.length === 0 ? <EmptyState icon={Landmark} title="No registrations recorded" description="Without a registration record, every configured component applies." /> : (
              <Table>
                <TableHeader><TableRow><TableHead>Jurisdiction</TableHead><TableHead>Status</TableHead><TableHead>Collection</TableHead><TableHead>Number</TableHead><TableHead>Filing</TableHead></TableRow></TableHeader>
                <TableBody>{config.registrations.map((registration) => (
                  <TableRow key={registration.id}>
                    <TableCell><div className="font-medium">{registration.jurisdiction.code}</div><div className="text-xs text-muted-foreground">{registration.jurisdiction.name}</div></TableCell>
                    <TableCell><Badge variant={registration.status === "REGISTERED" ? "secondary" : "outline"}>{humanize(registration.status)}</Badge></TableCell>
                    <TableCell>{registration.collectionEnabled ? "Enabled" : "Disabled"}</TableCell>
                    <TableCell className="font-mono text-xs">{registration.registrationNumber ?? "-"}</TableCell>
                    <TableCell>{registration.filingFrequency ? humanize(registration.filingFrequency) : "-"}</TableCell>
                  </TableRow>
                ))}</TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      ) : null}

      {section === "exemptions" ? (
        <Card>
          <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3">
            <div><CardTitle>Customer exemptions</CardTitle><CardDescription>Resale certificates and other exemptions. A valid exemption on the document date makes standard-rated sales to that customer exempt, and the exemption is recorded on the document for reporting.</CardDescription></div>
            {canManage && contacts.length ? (
              <EntityDialog trigger={<Button size="sm"><Plus />Record exemption</Button>} title="Customer exemption" action={createExemptionAction} contentClassName="sm:max-w-xl">
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5"><Label htmlFor="ex-contact" required>Customer</Label><select id="ex-contact" name="contactId" className={SELECT}>{contacts.filter((c) => c.type !== "SUPPLIER").map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
                  <div className="space-y-1.5"><Label htmlFor="ex-type" required>Type</Label><select id="ex-type" name="exemptionType" className={SELECT}>{["RESALE", "GOVERNMENT", "NON_PROFIT", "DIPLOMATIC", "EXPORT", "OTHER"].map((t) => <option key={t} value={t}>{humanize(t)}</option>)}</select></div>
                  <div className="space-y-1.5"><Label htmlFor="ex-jurisdiction">Jurisdiction</Label><select id="ex-jurisdiction" name="jurisdictionCode" className={SELECT}><option value="">All jurisdictions</option>{config.jurisdictions.map((j) => <option key={j.id} value={j.code}>{j.code}</option>)}</select></div>
                  <div className="space-y-1.5"><Label htmlFor="ex-cert">Certificate number</Label><Input id="ex-cert" name="certificateNumber" /></div>
                  <div className="space-y-1.5"><Label htmlFor="ex-from" required>Valid from</Label><Input id="ex-from" name="validFrom" type="date" defaultValue={today} required /></div>
                  <div className="space-y-1.5"><Label htmlFor="ex-to">Valid to</Label><Input id="ex-to" name="validTo" type="date" /></div>
                </div>
                <div className="space-y-1.5"><Label htmlFor="ex-reason">Reason</Label><Input id="ex-reason" name="reason" /></div>
              </EntityDialog>
            ) : null}
          </CardHeader>
          <CardContent>
            {config.exemptions.length === 0 ? <EmptyState icon={Landmark} title="No exemptions recorded" description="Add a customer exemption when you hold a valid certificate." /> : (
              <Table>
                <TableHeader><TableRow><TableHead>Customer</TableHead><TableHead>Type</TableHead><TableHead>Jurisdiction</TableHead><TableHead>Certificate</TableHead><TableHead>Valid</TableHead></TableRow></TableHeader>
                <TableBody>{config.exemptions.map((exemption) => (
                  <TableRow key={exemption.id}><TableCell className="font-medium">{exemption.contact.name}</TableCell><TableCell>{humanize(exemption.exemptionType)}</TableCell><TableCell>{exemption.jurisdiction?.code ?? "All"}</TableCell><TableCell className="font-mono text-xs">{exemption.certificateNumber ?? "-"}</TableCell><TableCell className="text-sm">{dateOf(exemption.validFrom)} to {dateOf(exemption.validTo)}</TableCell></TableRow>
                ))}</TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      ) : null}

      {section === "jurisdictions" ? (
        <Card>
          <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3">
            <div><CardTitle>Jurisdictions</CardTitle><CardDescription>Countries, states, counties, cities, and districts your organization deals with. Europe is modeled per country (EU-DE, EU-FR...), and countries outside the EU are separate jurisdictions.</CardDescription></div>
            {canManage ? (
              <EntityDialog trigger={<Button size="sm"><Plus />New jurisdiction</Button>} title="New jurisdiction" action={createJurisdictionAction}>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5"><Label htmlFor="j-code" required>Code</Label><Input id="j-code" name="code" required placeholder="US-GA-FULTON" /></div>
                  <div className="space-y-1.5"><Label htmlFor="j-name" required>Name</Label><Input id="j-name" name="name" required /></div>
                  <div className="space-y-1.5"><Label htmlFor="j-level" required>Level</Label><select id="j-level" name="level" className={SELECT}>{["COUNTRY", "STATE", "COUNTY", "CITY", "DISTRICT", "SUPRANATIONAL"].map((l) => <option key={l} value={l}>{humanize(l)}</option>)}</select></div>
                  <div className="space-y-1.5"><Label htmlFor="j-parent">Parent</Label><select id="j-parent" name="parentCode" className={SELECT}><option value="">None</option>{config.jurisdictions.map((j) => <option key={j.id} value={j.code}>{j.code}</option>)}</select></div>
                  <div className="space-y-1.5"><Label htmlFor="j-country">Country code</Label><Input id="j-country" name="countryCode" maxLength={2} placeholder="US" /></div>
                </div>
              </EntityDialog>
            ) : null}
          </CardHeader>
          <CardContent>
            {config.jurisdictions.length === 0 ? <EmptyState icon={Landmark} title="No jurisdictions yet" description="Apply your jurisdiction pack from the Overview to get started." /> : (
              <Table>
                <TableHeader><TableRow><TableHead>Code</TableHead><TableHead>Name</TableHead><TableHead>Level</TableHead><TableHead>Pack</TableHead></TableRow></TableHeader>
                <TableBody>{config.jurisdictions.map((j) => <TableRow key={j.id}><TableCell className="font-mono text-xs">{j.code}</TableCell><TableCell>{j.name}</TableCell><TableCell>{humanize(j.level)}</TableCell><TableCell>{j.packKey ?? "Custom"}</TableCell></TableRow>)}</TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      ) : null}

      {section === "categories" ? (
        <Card>
          <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3">
            <div><CardTitle>Product and service categories</CardTitle><CardDescription>Categories let rules treat goods and services differently, for example reduced-rate food or exempt services.</CardDescription></div>
            {canManage ? (
              <EntityDialog trigger={<Button size="sm"><Plus />New category</Button>} title="New tax category" action={createCategoryAction}>
                <div className="space-y-1.5"><Label htmlFor="c-code" required>Code</Label><Input id="c-code" name="code" required /></div>
                <div className="space-y-1.5"><Label htmlFor="c-name" required>Name</Label><Input id="c-name" name="name" required /></div>
                <div className="space-y-1.5"><Label htmlFor="c-desc">Description</Label><Input id="c-desc" name="description" /></div>
              </EntityDialog>
            ) : null}
          </CardHeader>
          <CardContent>
            {config.categories.length === 0 ? <EmptyState icon={Landmark} title="No categories yet" description="Categories are created with a pack or added here." /> : (
              <Table>
                <TableHeader><TableRow><TableHead>Code</TableHead><TableHead>Name</TableHead><TableHead>Description</TableHead></TableRow></TableHeader>
                <TableBody>{config.categories.map((c) => <TableRow key={c.id}><TableCell className="font-mono text-xs">{c.code}</TableCell><TableCell>{c.name}</TableCell><TableCell className="text-muted-foreground">{c.description ?? "-"}</TableCell></TableRow>)}</TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
