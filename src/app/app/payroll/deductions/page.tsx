import Link from "next/link";
import { cookies } from "next/headers";
import { Info, Lock, Plus, Scale } from "lucide-react";
import type { PayrollDeductionRule } from "@prisma/client";
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
import { cn } from "@/lib/utils";
import { FILING_STATUSES, listDeductionRules, US_FEDERAL_TEMPLATE } from "@/modules/payroll/deduction-rules";
import { PAYROLL_FLASH_COOKIE } from "@/modules/payroll/flash";
import { getSettings } from "@/modules/payroll/service";
import { bracketsToText } from "@/modules/payroll/statutory";
import { applyUsTemplateAction, confirmDeductionRuleAction, saveDeductionRuleAction, setDeductionModeAction, toggleDeductionRuleAction } from "./actions";

const KIND_LABEL: Record<string, string> = { EMPLOYEE_WITHHOLDING: "Income tax withheld", EMPLOYEE_CONTRIBUTION: "Employee contribution", EMPLOYER_CONTRIBUTION: "Employer contribution" };
const selectClass = "h-10 w-full rounded-md border bg-background px-3 text-sm";

function figures(rule: PayrollDeductionRule) {
  if (rule.method === "BRACKETS") {
    const count = Array.isArray(rule.brackets) ? rule.brackets.length : 0;
    return count ? `${count} brackets${rule.annualAllowance ? `, allowance ${rule.annualAllowance.toString()}` : ""}` : "Brackets not entered";
  }
  const parts = [rule.rate ? `${rule.rate.toString()}%` : "Rate not entered"];
  if (rule.wageBase) parts.push(`up to ${rule.wageBase.toString()} a year`);
  if (rule.wageFloor) parts.push(`above ${rule.wageFloor.toString()} a year`);
  return parts.join(", ");
}

function RuleFields({ rule, taxYear, liabilities, expenses }: { rule?: PayrollDeductionRule; taxYear: number; liabilities: { code: string; name: string }[]; expenses: { code: string; name: string }[] }) {
  const id = (name: string) => `${name}-${rule?.id ?? "new"}`;
  return (
    <div className="space-y-4">
      {rule ? <input type="hidden" name="ruleId" value={rule.id} /> : null}
      <input type="hidden" name="taxYear" value={rule?.taxYear ?? taxYear} />
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5"><Label htmlFor={id("code")} required>Code</Label><Input id={id("code")} name="code" defaultValue={rule?.code} readOnly={!!rule} required placeholder="e.g. PENSION-EE" /></div>
        <div className="space-y-1.5"><Label htmlFor={id("name")} required>Name</Label><Input id={id("name")} name="name" defaultValue={rule?.name} required /></div>
        <div className="space-y-1.5"><Label htmlFor={id("kind")} required>Type</Label>
          <select id={id("kind")} name="kind" defaultValue={rule?.kind ?? "EMPLOYEE_CONTRIBUTION"} className={selectClass}>{Object.entries(KIND_LABEL).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
        </div>
        <div className="space-y-1.5"><Label htmlFor={id("method")} required>Method</Label>
          <select id={id("method")} name="method" defaultValue={rule?.method ?? "PERCENTAGE"} className={selectClass}><option value="PERCENTAGE">Percentage of wages</option><option value="BRACKETS">Progressive brackets (annualized)</option></select>
        </div>
      </div>
      <fieldset className="grid gap-4 rounded-md border p-3 sm:grid-cols-3">
        <legend className="px-1 text-xs text-muted-foreground">Percentage method</legend>
        <div className="space-y-1.5"><Label htmlFor={id("rate")}>Rate (%)</Label><Input id={id("rate")} name="rate" type="number" step="0.0001" min="0" max="100" defaultValue={rule?.rate?.toString()} /></div>
        <div className="space-y-1.5"><Label htmlFor={id("wageBase")}>Annual wage base (cap)</Label><Input id={id("wageBase")} name="wageBase" type="number" step="0.01" min="0" defaultValue={rule?.wageBase?.toString()} /></div>
        <div className="space-y-1.5"><Label htmlFor={id("wageFloor")}>Applies above (annual)</Label><Input id={id("wageFloor")} name="wageFloor" type="number" step="0.01" min="0" defaultValue={rule?.wageFloor?.toString()} /></div>
      </fieldset>
      <fieldset className="grid gap-4 rounded-md border p-3 sm:grid-cols-2">
        <legend className="px-1 text-xs text-muted-foreground">Brackets method</legend>
        <div className="space-y-1.5"><Label htmlFor={id("brackets")}>Annual brackets (one per line: starting amount: rate)</Label>
          <textarea id={id("brackets")} name="brackets" rows={6} defaultValue={bracketsToText(rule?.brackets)} placeholder={"0: 0\n10000: 10\n40000: 20"} className="w-full rounded-md border bg-background px-3 py-2 font-mono text-sm" />
        </div>
        <div className="space-y-1.5"><Label htmlFor={id("annualAllowance")}>Annual allowance subtracted first</Label><Input id={id("annualAllowance")} name="annualAllowance" type="number" step="0.01" min="0" defaultValue={rule?.annualAllowance?.toString()} /></div>
      </fieldset>
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="space-y-1.5"><Label htmlFor={id("filingStatus")}>Filing status</Label>
          <select id={id("filingStatus")} name="filingStatus" defaultValue={rule?.filingStatus ?? ""} className={selectClass}><option value="">All employees</option>{FILING_STATUSES.map((status) => <option key={status.value} value={status.value}>{status.label}</option>)}</select>
        </div>
        <div className="space-y-1.5"><Label htmlFor={id("liability")} required>Liability account</Label>
          <select id={id("liability")} name="liabilityAccountCode" defaultValue={rule?.liabilityAccountCode ?? ""} required className={selectClass}><option value="" disabled>Choose</option>{liabilities.map((account) => <option key={account.code} value={account.code}>{account.code} {account.name}</option>)}</select>
        </div>
        <div className="space-y-1.5"><Label htmlFor={id("expense")}>Expense account (employer only)</Label>
          <select id={id("expense")} name="expenseAccountCode" defaultValue={rule?.expenseAccountCode ?? ""} className={selectClass}><option value="">None</option>{expenses.map((account) => <option key={account.code} value={account.code}>{account.code} {account.name}</option>)}</select>
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-[1fr_6rem]">
        <div className="space-y-1.5"><Label htmlFor={id("source")}>Source (publication and year)</Label><Input id={id("source")} name="sourceReference" defaultValue={rule?.sourceReference ?? ""} /></div>
        <div className="space-y-1.5"><Label htmlFor={id("sort")}>Order</Label><Input id={id("sort")} name="sortOrder" type="number" defaultValue={rule?.sortOrder ?? 0} /></div>
      </div>
      {rule?.confirmedAt ? <p className="text-xs text-amber-700 dark:text-amber-400">Saving changes clears the confirmation. Confirm the rule again before the next run.</p> : null}
    </div>
  );
}

export default async function PayrollDeductionsPage({ searchParams }: { searchParams: Promise<{ saved?: string; error?: string; year?: string }> }) {
  const params = await searchParams;
  const tenant = await requireModuleAccess("payroll");
  if (!hasPermission(tenant, PERMISSIONS.PAYROLL_SETTINGS_MANAGE)) {
    return (
      <div className="space-y-6">
        <PageHeader title="Deductions" description="Statutory payroll deductions and employer contributions." />
        <EmptyState icon={Lock} title="You don't have access to this page" description="Deduction rules are limited to roles with Payroll settings permission." />
      </div>
    );
  }

  const currentYear = new Date().getUTCFullYear();
  const taxYear = params.year && /^\d{4}$/.test(params.year) ? Number(params.year) : currentYear;
  const [settings, allRules, accounts] = await Promise.all([
    getSettings(tenant.organizationId),
    listDeductionRules(tenant.organizationId),
    db.accountingAccount.findMany({ where: { organizationId: tenant.organizationId, type: { in: ["LIABILITY", "EXPENSE"] } }, select: { code: true, name: true, type: true }, orderBy: { code: "asc" } }),
  ]);
  const rules = allRules.filter((rule) => rule.taxYear === taxYear);
  const years = [...new Set([currentYear, currentYear + 1, ...allRules.map((rule) => rule.taxYear)])].sort((a, b) => b - a);
  const liabilities = accounts.filter((account) => account.type === "LIABILITY");
  const expenses = accounts.filter((account) => account.type === "EXPENSE");
  const flash = params.error === "1" ? (await cookies()).get(PAYROLL_FLASH_COOKIE)?.value : params.error === "forbidden" ? "Changing deduction rules requires Payroll settings permission." : null;
  const templateApplied = rules.some((rule) => rule.templateKey?.startsWith("US_"));
  const needsConfirmation = rules.filter((rule) => rule.active && !rule.confirmedAt).length;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <PageHeader title="Deductions" description="Statutory payroll deductions and employer contributions, configured per tax year." />
        <EntityDialog trigger={<Button size="sm"><Plus />New rule</Button>} title={`New deduction rule for ${taxYear}`} action={saveDeductionRuleAction} submitLabel="Save rule" contentClassName="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
          <RuleFields taxYear={taxYear} liabilities={liabilities} expenses={expenses} />
        </EntityDialog>
      </div>

      {params.saved ? <div role="status" className="rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-700 dark:text-emerald-400">Saved.</div> : null}
      {flash ? <div role="alert" className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">{flash}</div> : null}

      <Alert>
        <Info />
        <AlertTitle>Working figures you confirm</AlertTitle>
        <AlertDescription>Rock Frost calculates deductions from the rules and figures you enter or confirm here. It does not file returns, make deposits, or decide which rules apply to your business. Check every figure against the current official publication each year, and ask a payroll professional when unsure.</AlertDescription>
      </Alert>

      <Card>
        <CardHeader>
          <CardTitle>Deduction method</CardTitle>
          <CardDescription>The flat rate applies the single tax rate from Payroll Settings. Deduction rules apply every confirmed, active rule for the pay date&apos;s tax year, with year-to-date wage caps and thresholds. Changing the method affects runs processed from now on.</CardDescription>
        </CardHeader>
        <CardContent>
          <form action={setDeductionModeAction} className="flex flex-wrap items-center gap-4 text-sm">
            <label className="flex items-center gap-2"><input type="radio" name="mode" value="FLAT_RATE" defaultChecked={settings.deductionMode === "FLAT_RATE"} className="size-4" />Flat rate ({(Number(settings.defaultTaxRate) * 100).toFixed(2)}%)</label>
            <label className="flex items-center gap-2"><input type="radio" name="mode" value="RULES" defaultChecked={settings.deductionMode === "RULES"} className="size-4" />Deduction rules</label>
            <Button type="submit" size="sm" variant="outline">Save method</Button>
          </form>
        </CardContent>
      </Card>

      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="text-muted-foreground">Tax year:</span>
        {years.map((year) => <Link key={year} href={`/app/payroll/deductions?year=${year}`} className={cn("rounded-md border px-2.5 py-1", year === taxYear ? "border-primary bg-primary/10 font-medium" : "hover:bg-muted")}>{year}</Link>)}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>United States federal template</CardTitle>
          <CardDescription>
            Creates unconfirmed {taxYear} rules for federal income tax withholding (single, married filing jointly, head of household), Social Security and Medicare (employee and employer), Additional Medicare, FUTA, and a state unemployment placeholder, with their ledger accounts. Only rates fixed in the Internal Revenue Code are filled in. You enter the Social Security wage base announced by the Social Security Administration, the withholding brackets and standard allowance for each filing status from IRS Publication 15-T, and your state unemployment rate and wage base, then confirm each rule. Withholding uses an annualized bracket method from those figures; it does not model every Form W-4 adjustment, so record any extra withholding an employee requests on their compensation.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {templateApplied ? <p className="text-sm text-muted-foreground">Applied for {taxYear}. {US_FEDERAL_TEMPLATE.length} template rules; edit and confirm them below.</p> : (
            <form action={applyUsTemplateAction}><input type="hidden" name="taxYear" value={taxYear} /><Button type="submit" size="sm">Add US federal rules for {taxYear}</Button></form>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Rules for {taxYear}</CardTitle>
          <CardDescription>{needsConfirmation ? `${needsConfirmation} active rule${needsConfirmation === 1 ? "" : "s"} need confirmation before a run can use deduction rules for ${taxYear}.` : "Runs with a pay date in this year use every confirmed, active rule."}</CardDescription>
        </CardHeader>
        <CardContent>
          {rules.length === 0 ? <EmptyState icon={Scale} title={`No rules for ${taxYear}`} description="Add a rule or apply a template." /> : (
            <Table>
              <TableHeader>
                <TableRow><TableHead>Rule</TableHead><TableHead>Type</TableHead><TableHead>Figures</TableHead><TableHead>Accounts</TableHead><TableHead>Status</TableHead><TableHead /></TableRow>
              </TableHeader>
              <TableBody>
                {rules.map((rule) => (
                  <TableRow key={rule.id} className={rule.active ? undefined : "opacity-60"}>
                    <TableCell>
                      <p className="font-medium">{rule.name}</p>
                      <p className="text-xs text-muted-foreground">{rule.code}{rule.filingStatus ? ` · ${FILING_STATUSES.find((status) => status.value === rule.filingStatus)?.label ?? rule.filingStatus}` : ""}</p>
                      {rule.sourceReference ? <p className="max-w-md text-xs text-muted-foreground">{rule.sourceReference}</p> : null}
                    </TableCell>
                    <TableCell className="text-sm">{KIND_LABEL[rule.kind]}</TableCell>
                    <TableCell className="text-sm">{figures(rule)}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{rule.liabilityAccountCode}{rule.expenseAccountCode ? ` / ${rule.expenseAccountCode}` : ""}</TableCell>
                    <TableCell>{!rule.active ? <Badge variant="outline">Inactive</Badge> : rule.confirmedAt ? <Badge variant="secondary">Confirmed {rule.confirmedAt.toISOString().slice(0, 10)}</Badge> : <Badge variant="destructive">Needs confirmation</Badge>}</TableCell>
                    <TableCell className="space-x-1 whitespace-nowrap text-right">
                      <EntityDialog trigger={<Button size="sm" variant="ghost">Edit</Button>} title={`Edit ${rule.code} (${rule.taxYear})`} action={saveDeductionRuleAction} submitLabel="Save changes" contentClassName="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
                        <RuleFields rule={rule} taxYear={taxYear} liabilities={liabilities} expenses={expenses} />
                      </EntityDialog>
                      {rule.active && !rule.confirmedAt ? (
                        <EntityDialog trigger={<Button size="sm" variant="outline">Confirm</Button>} title={`Confirm ${rule.code} for ${rule.taxYear}`} action={confirmDeductionRuleAction} submitLabel="Confirm rule">
                          <input type="hidden" name="ruleId" value={rule.id} />
                          <input type="hidden" name="taxYear" value={rule.taxYear} />
                          <p className="text-sm">{rule.name}: {figures(rule)}.</p>
                          <label className="flex items-start gap-2 text-sm"><input type="checkbox" name="attested" required className="mt-0.5 size-4" />I have checked these figures against the current official publication for {rule.taxYear}, and I am responsible for applying the right rules to our employees.</label>
                        </EntityDialog>
                      ) : null}
                      <form action={toggleDeductionRuleAction} className="inline">
                        <input type="hidden" name="ruleId" value={rule.id} />
                        <input type="hidden" name="taxYear" value={rule.taxYear} />
                        <input type="hidden" name="active" value={rule.active ? "false" : "true"} />
                        <Button type="submit" size="sm" variant="ghost">{rule.active ? "Deactivate" : "Activate"}</Button>
                      </form>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
