import { Lock, Plus } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/feedback/empty-state";
import { EntityDialog } from "@/components/forms/entity-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { requireModuleAccess } from "@/lib/auth/module-access";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { db } from "@/lib/db";
import { zonedDateParts } from "@/lib/org-format";
import { formatContractNumber, resolveRiskWeights, resolveValueThresholds, RISK_FACTORS } from "@/modules/contracts/rules";
import { actorFromTenant, getContractFormOptions, getContractSettings } from "@/modules/contracts/service";
import { listApprovalRules } from "@/modules/contracts/lifecycle";
import { createApprovalRuleAction, createCategoryAction, createTypeAction, setApprovalRuleActiveAction, updateContractSettingsAction, updateRiskSettingsAction } from "../actions";
import { ContractsFlash, humanize, SELECT_CLASS } from "../_components/shared";

export const metadata = { title: "Contract settings" };

export default async function ContractSettingsPage({ searchParams }: { searchParams: Promise<{ saved?: string; error?: string }> }) {
  const tenant = await requireModuleAccess("contracts");
  const actor = actorFromTenant(tenant);
  if (!actor.permissions.includes(PERMISSIONS.CONTRACTS_MANAGE_SETTINGS)) {
    return <EmptyState icon={Lock} title="You can't manage Contract settings" description="Contract settings require the contracts.manage_settings permission." />;
  }
  const params = await searchParams;
  const [settings, categories, types, rules, options] = await Promise.all([
    getContractSettings(tenant.organizationId),
    db.contractCategory.findMany({ where: { organizationId: tenant.organizationId }, orderBy: { name: "asc" } }),
    db.contractType.findMany({ where: { organizationId: tenant.organizationId }, include: { category: { select: { name: true } } }, orderBy: { name: "asc" } }),
    listApprovalRules(actor),
    getContractFormOptions(tenant.organizationId),
  ]);
  const memberName = (id: string) => { const member = options.members.find((candidate) => candidate.id === id); return member ? member.name ?? member.email : "Former member"; };
  const approverName = (step: { approverUserId: string | null; approverRoleId: string | null }) => (step.approverUserId ? memberName(step.approverUserId) : `Role: ${options.roles.find((role) => role.id === step.approverRoleId)?.name ?? "Unknown role"}`);
  const ruleConditions = (rule: (typeof rules)[number]) => [
    rule.minValue ? `value of ${rule.currency} ${rule.minValue.toFixed(2)} or more` : rule.currency ? `in ${rule.currency}` : null,
    rule.categoryId ? `category ${categories.find((category) => category.id === rule.categoryId)?.name ?? "removed"}` : null,
    rule.typeId ? `type ${types.find((type) => type.id === rule.typeId)?.name ?? "removed"}` : null,
    rule.department ? `department ${rule.department}` : null,
    rule.minRiskLevel ? `${humanize(rule.minRiskLevel).toLowerCase()} risk or higher` : null,
    rule.jurisdiction ? `jurisdiction ${rule.jurisdiction}` : null,
    rule.branchId ? `branch ${options.branches.find((branch) => branch.id === rule.branchId)?.name ?? "removed"}` : null,
  ].filter(Boolean).join(", ") || "every contract";
  const riskWeights = resolveRiskWeights(settings.riskWeights);
  const valueThresholds = resolveValueThresholds(settings.riskValueThresholds);
  const stepExamples = ["Legal review", "Finance approval", "Director sign-off", "Board approval", "Final sign-off"];
  const today = zonedDateParts(new Date(), tenant.organization.timezone ?? "UTC");
  const example = formatContractNumber(settings.numberFormat, settings.numberPrefix, { year: Number(today.year), month: Number(today.month) }, settings.nextSequence);

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <PageHeader title="Contract settings" description="Numbering, categories and types, alerts, approval rules, risk scoring, and who may open confidential contracts." />
      <ContractsFlash saved={params.saved} error={params.error} savedMessage="Settings saved and recorded in the audit log." />

      <Card>
        <CardHeader><CardTitle>Numbering, alerts, and confidentiality</CardTitle><CardDescription>Contract numbers are unique within your organization. Next number: <span className="font-mono">{example}</span></CardDescription></CardHeader>
        <CardContent>
          <form action={updateContractSettingsAction} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-1.5"><Label htmlFor="numberPrefix" required>Prefix</Label><Input id="numberPrefix" name="numberPrefix" defaultValue={settings.numberPrefix} required maxLength={12} /></div>
              <div className="space-y-1.5 sm:col-span-2"><Label htmlFor="numberFormat" required>Number format</Label><Input id="numberFormat" name="numberFormat" defaultValue={settings.numberFormat} required className="font-mono" /><p className="text-xs text-muted-foreground">Tokens: {"{PREFIX}"}, {"{YYYY}"}, {"{YY}"}, {"{MM}"}, {"{SEQ:6}"} (sequence padded to 6 digits).</p></div>
            </div>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="resetSequenceYearly" defaultChecked={settings.resetSequenceYearly} className="size-4" />Restart the sequence each year when the format includes the year</label>
            <div className="space-y-1.5"><Label htmlFor="expiryAlertDays" required>Expiry alerts (days before expiration)</Label><Input id="expiryAlertDays" name="expiryAlertDays" defaultValue={settings.expiryAlertDays.join(", ")} required /><p className="text-xs text-muted-foreground">Comma-separated, for example 180, 90, 60, 30, 14, 7.</p></div>
            <label className="flex items-start gap-2 rounded-md border p-3 text-sm">
              <input type="checkbox" name="confidentialAdminAccess" defaultChecked={settings.confidentialAdminAccess} className="mt-0.5 size-4" />
              <span><span className="font-medium">Users with confidential-contract permission may open all confidential contracts</span><span className="block text-xs text-muted-foreground">Off by default: confidential contracts are then visible only to their creator, owner, and explicit grants. Restricted contracts always require an explicit grant.</span></span>
            </label>
            <div className="space-y-1.5"><Label htmlFor="obligationReminderDays" required>Obligation and milestone reminders (days before due)</Label><Input id="obligationReminderDays" name="obligationReminderDays" defaultValue={settings.obligationReminderDays.join(", ")} required /><p className="text-xs text-muted-foreground">Comma-separated, for example 14, 7, 1. Use 0 for a reminder on the due date. Overdue items get one more reminder.</p></div>
            <label className="flex items-start gap-2 rounded-md border p-3 text-sm">
              <input type="checkbox" name="allowSelfApproval" defaultChecked={settings.allowSelfApproval} className="mt-0.5 size-4" />
              <span><span className="font-medium">Allow people to approve contracts and apply amendments they submitted</span><span className="block text-xs text-muted-foreground">Off by default, so a second person always reviews. Turn on only for very small teams.</span></span>
            </label>
            <Button type="submit">Save settings</Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3">
          <div><CardTitle>Approval rules</CardTitle><CardDescription>A draft contract that matches a rule must be approved, step by step, before it can be activated. The first active rule by priority (lowest number first) applies. Value thresholds apply only to contracts in the same currency. Contracts matching no rule can be activated directly.</CardDescription></div>
          <EntityDialog trigger={<Button size="sm"><Plus />Add rule</Button>} title="New approval rule" description="Leave a condition blank to match any value." action={createApprovalRuleAction} contentClassName="sm:max-w-2xl">
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="space-y-1.5 sm:col-span-2"><Label htmlFor="rule-name" required>Name</Label><Input id="rule-name" name="name" required placeholder="For example: High-value supplier contracts" /></div>
              <div className="space-y-1.5"><Label htmlFor="rule-priority">Priority</Label><Input id="rule-priority" name="priority" type="number" min={1} max={10000} defaultValue={100} /></div>
              <div className="space-y-1.5"><Label htmlFor="rule-min">Value at least</Label><Input id="rule-min" name="minValue" inputMode="decimal" /></div>
              <div className="space-y-1.5"><Label htmlFor="rule-currency">Currency</Label><Input id="rule-currency" name="currency" maxLength={3} placeholder={tenant.organization.currency ?? "GHS"} /></div>
              <div className="space-y-1.5"><Label htmlFor="rule-risk">Risk at least</Label><select id="rule-risk" name="minRiskLevel" className={SELECT_CLASS} defaultValue=""><option value="">Any</option>{["LOW", "MEDIUM", "HIGH", "CRITICAL"].map((level) => <option key={level} value={level}>{humanize(level)}</option>)}</select></div>
              <div className="space-y-1.5"><Label htmlFor="rule-category">Category</Label><select id="rule-category" name="categoryId" className={SELECT_CLASS} defaultValue=""><option value="">Any</option>{categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></div>
              <div className="space-y-1.5"><Label htmlFor="rule-type">Type</Label><select id="rule-type" name="typeId" className={SELECT_CLASS} defaultValue=""><option value="">Any</option>{types.map((type) => <option key={type.id} value={type.id}>{type.name}</option>)}</select></div>
              <div className="space-y-1.5"><Label htmlFor="rule-branch">Branch</Label><select id="rule-branch" name="branchId" className={SELECT_CLASS} defaultValue=""><option value="">Any</option>{options.branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}</select></div>
              <div className="space-y-1.5"><Label htmlFor="rule-department">Department</Label><Input id="rule-department" name="department" /></div>
              <div className="space-y-1.5 sm:col-span-2"><Label htmlFor="rule-jurisdiction">Governing jurisdiction</Label><Input id="rule-jurisdiction" name="jurisdiction" /></div>
            </div>
            <fieldset className="space-y-2">
              <legend className="text-sm font-medium">Approval steps, in order</legend>
              {[1, 2, 3, 4, 5].map((index) => (
                <div key={index} className="grid gap-2 sm:grid-cols-2">
                  <Input name={`step${index}_name`} aria-label={`Step ${index} name`} placeholder={`Step ${index}, for example ${stepExamples[index - 1]}`} />
                  <select name={`step${index}_approver`} aria-label={`Step ${index} approver`} className={SELECT_CLASS} defaultValue="">
                    <option value="">No step</option>
                    <optgroup label="People">{options.members.map((member) => <option key={member.id} value={`user:${member.id}`}>{member.name ?? member.email}</option>)}</optgroup>
                    <optgroup label="Roles">{options.roles.map((role) => <option key={role.id} value={`role:${role.id}`}>{role.name}</option>)}</optgroup>
                  </select>
                </div>
              ))}
              <p className="text-xs text-muted-foreground">A role step can be decided by any active member holding that role and the contract approval permission.</p>
            </fieldset>
          </EntityDialog>
        </CardHeader>
        <CardContent>
          {rules.length === 0 ? <p className="text-sm text-muted-foreground">No approval rules. Every contract can be activated directly.</p> : (
            <ul className="space-y-3">{rules.map((rule) => (
              <li key={rule.id} className={`rounded-lg border p-3 text-sm ${rule.active ? "" : "opacity-60"}`}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div><span className="font-medium">{rule.name}</span> <span className="text-muted-foreground">· priority {rule.priority}</span>{rule.active ? null : <Badge variant="outline" className="ml-2">Inactive</Badge>}</div>
                  <form action={setApprovalRuleActiveAction}><input type="hidden" name="ruleId" value={rule.id} /><input type="hidden" name="active" value={rule.active ? "false" : "true"} /><Button type="submit" size="sm" variant="ghost">{rule.active ? "Deactivate" : "Activate"}</Button></form>
                </div>
                <p className="mt-1 text-muted-foreground">Applies to {ruleConditions(rule)}.</p>
                <ol className="mt-2 flex flex-wrap gap-2">{rule.steps.map((step) => <li key={step.id}><Badge variant="secondary">{step.stepOrder}. {step.name}: {approverName(step)}</Badge></li>)}</ol>
              </li>
            ))}</ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Calculated risk</CardTitle><CardDescription>Each contract gets a 0 to 100 score from the factors below: under 20 is low, 20 to 44 medium, 45 to 69 high, and 70 or more critical. The score is guidance shown next to the risk level people assign; it never changes that level.</CardDescription></CardHeader>
        <CardContent>
          <form action={updateRiskSettingsAction} className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              {(Object.keys(RISK_FACTORS) as (keyof typeof RISK_FACTORS)[]).map((key) => (
                <div key={key} className="flex items-center justify-between gap-3 rounded-md border p-2">
                  <Label htmlFor={`weight-${key}`} className="text-sm font-normal">{RISK_FACTORS[key].label}</Label>
                  <Input id={`weight-${key}`} name={`weight_${key}`} type="number" min={0} max={50} required defaultValue={riskWeights[key]} className="w-20" />
                </div>
              ))}
            </div>
            <div className="space-y-1.5"><Label htmlFor="thresholds">High-value thresholds</Label><Input id="thresholds" name="thresholds" defaultValue={Object.entries(valueThresholds).map(([currency, amount]) => `${currency}=${amount}`).join(", ")} placeholder={`${tenant.organization.currency ?? "GHS"}=500000, USD=50000`} /><p className="text-xs text-muted-foreground">Points from 0 to 50 per factor. A contract counts as high value only against the threshold for its own currency.</p></div>
            <Button type="submit">Save risk settings</Button>
          </form>
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader className="flex flex-row items-start justify-between gap-3">
            <div><CardTitle>Categories</CardTitle><CardDescription>For example Customer, Supplier, Employment, Lease.</CardDescription></div>
            <EntityDialog trigger={<Button size="sm" variant="outline"><Plus />Add</Button>} title="New category" action={createCategoryAction}>
              <div className="space-y-1.5"><Label htmlFor="cat-code" required>Code</Label><Input id="cat-code" name="code" required /></div>
              <div className="space-y-1.5"><Label htmlFor="cat-name" required>Name</Label><Input id="cat-name" name="name" required /></div>
            </EntityDialog>
          </CardHeader>
          <CardContent>{categories.length ? <ul className="space-y-1 text-sm">{categories.map((category) => <li key={category.id} className="flex justify-between border-b py-1"><span>{category.name}</span><span className="font-mono text-xs text-muted-foreground">{category.code}</span></li>)}</ul> : <p className="text-sm text-muted-foreground">No categories yet.</p>}</CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-start justify-between gap-3">
            <div><CardTitle>Contract types</CardTitle><CardDescription>For example NDA, Master Services Agreement, Vehicle Lease.</CardDescription></div>
            <EntityDialog trigger={<Button size="sm" variant="outline"><Plus />Add</Button>} title="New contract type" action={createTypeAction}>
              <div className="space-y-1.5"><Label htmlFor="type-code" required>Code</Label><Input id="type-code" name="code" required /></div>
              <div className="space-y-1.5"><Label htmlFor="type-name" required>Name</Label><Input id="type-name" name="name" required /></div>
              <div className="space-y-1.5"><Label htmlFor="type-category">Category</Label><select id="type-category" name="categoryId" className={SELECT_CLASS}><option value="">None</option>{categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></div>
            </EntityDialog>
          </CardHeader>
          <CardContent>{types.length ? <ul className="space-y-1 text-sm">{types.map((type) => <li key={type.id} className="flex justify-between gap-2 border-b py-1"><span>{type.name}</span><span className="flex items-center gap-2 text-xs text-muted-foreground">{type.category ? <Badge variant="outline">{type.category.name}</Badge> : null}<span className="font-mono">{type.code}</span></span></li>)}</ul> : <p className="text-sm text-muted-foreground">No types yet.</p>}</CardContent>
        </Card>
      </div>
    </div>
  );
}
