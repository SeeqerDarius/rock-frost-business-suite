import { Banknote, Info, Plus, Link2 } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/feedback/empty-state";
import { EntityDialog } from "@/components/forms/entity-dialog";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { FormFeedback, ReadOnlyNotice } from "@/components/school/form-feedback";
import { FieldGrid, SelectField, TextField } from "@/components/school/form-fields";
import { SectionCard } from "@/components/school/section-card";
import { createOrganizationFormatter } from "@/lib/org-format";
import { requireModuleAccess } from "@/lib/auth/module-access";
import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import { listSchoolPayrollAdjustments } from "@/modules/school/service";
import { listSchoolPayrollEligibleEmployees, listSchoolPayrollLinkCandidates } from "@/modules/hr/service";
import { createPayrollAdjustmentAction, assignPayrollInputEmployeeAction } from "../actions";
import { schoolPlanGate } from "@/components/school/plan-gate";

/** Free-text `type` values, offered as a list so entries stay consistent across periods. */
const ADJUSTMENT_TYPES = ["Teaching allowance", "Substitute cover", "Overtime", "Examination duty", "Transport allowance", "Bonus", "Other"];

export default async function SchoolPayrollPage({ searchParams }: { searchParams: Promise<{ saved?: string; linked?: string; error?: string }> }) {
  const [tenant, query] = await Promise.all([requireModuleAccess("school"), searchParams]);
  // Plan gate. Navigation already hides this page when the plan does
  // not include it, but a hidden link is not a boundary.
  const gate = await schoolPlanGate(tenant.organizationId, "school.payroll", "School Payroll", "Education-specific payroll inputs for workload, substitutes, and allowances.");
  if (gate) return gate;
  const money = createOrganizationFormatter(tenant.organization).money;
  const canManage = hasPermission(tenant, PERMISSIONS.SCHOOL_PAYROLL_MANAGE);
  const [adjustments, eligibleEmployees, linkCandidates] = await Promise.all([
    listSchoolPayrollAdjustments(tenant.organizationId),
    listSchoolPayrollEligibleEmployees(tenant.organizationId),
    listSchoolPayrollLinkCandidates(tenant.organizationId),
  ]);

  // Group by pay period so the page reads like a payroll run rather than a flat log.
  const periods = [...new Set(adjustments.map((adjustment) => adjustment.period))]
    .sort((a, b) => b.localeCompare(a))
    .map((period) => ({ period, rows: adjustments.filter((adjustment) => adjustment.period === period) }));
  const eligibleEmployeeIds = new Set(eligibleEmployees.map((employee) => employee.id));
  const canAddPayrollInput = canManage && eligibleEmployees.length > 0;

  const newAdjustmentDialog = (
    <EntityDialog
      trigger={<Button size="sm"><Plus />Add payroll input</Button>}
      title="Add a school payroll input"
      description="These inputs are collected here and processed by the Payroll module. Adding one does not pay anybody."
      action={createPayrollAdjustmentAction}
      submitLabel="Add payroll input"
    >
      <SelectField
        id="payroll-employee"
        name="employeeId"
        label="HR employee"
        required
        hint="Only active, payroll-eligible HR employees are listed. Add compensation in Payroll before processing this employee's run."
        emptyHint="Create or activate a payroll-eligible employee in HR and set up their Payroll compensation first."
        options={eligibleEmployees.map((employee) => ({ value: employee.id, label: `${employee.fullName} (${employee.employeeNumber})` }))}
      />
      <TextField id="payroll-period" name="period" label="Pay period" type="month" required hint="The month this input belongs to." />
      <SelectField id="payroll-type" name="type" label="Type" required placeholder="Select a type…" options={ADJUSTMENT_TYPES.map((type) => ({ value: type, label: type }))} />
      <SelectField id="payroll-category" name="category" label="Treatment" required placeholder="Select earning or deduction…" options={[{ value: "EARNING", label: "Earning added to gross pay" }, { value: "DEDUCTION", label: "Deduction from take-home pay" }]} />
      <FieldGrid>
        <TextField id="payroll-description" name="description" label="Description" required maxLength={200} />
        <TextField id="payroll-amount" name="amount" label="Amount" type="number" step="0.01" min="0.01" required />
      </FieldGrid>
    </EntityDialog>
  );

  return (
    <div className="mx-auto max-w-screen-2xl space-y-6">
      <PageHeader
        title="School Payroll"
        description="Education-specific payroll inputs for workload, substitutes, and allowances."
        actions={canAddPayrollInput ? newAdjustmentDialog : undefined}
      />

      <FormFeedback saved={query.saved ?? query.linked} error={query.error} savedMessage={query.linked ? "The payroll input is linked to its HR employee." : "The payroll input has been recorded and will be included in its matching full-month Payroll run."} />
      {!canManage ? <ReadOnlyNotice>Your role can review School payroll inputs but cannot add them.</ReadOnlyNotice> : null}
      {canManage && eligibleEmployees.length === 0 ? (
        <Alert>
          <Info />
          <AlertTitle>Prepare payroll in HR and Payroll first</AlertTitle>
          <AlertDescription>Create an active, payroll-eligible HR employee and set up their Payroll compensation before recording School payroll inputs.</AlertDescription>
        </Alert>
      ) : null}

      <Alert>
        <Info />
        <AlertTitle>These inputs are processed by the Payroll module</AlertTitle>
        <AlertDescription>
          This page records HR-linked education-specific earnings and deductions. Payroll includes eligible inputs in the matching full-calendar-month run, applies the organization&apos;s configured default tax rate to gross pay, and subtracts deductions from take-home pay. Final salary calculation, statutory deductions, and payslips remain owned by the Payroll module.
        </AlertDescription>
      </Alert>

      {adjustments.length === 0 ? (
        <EmptyState
          icon={Banknote}
          title="No school payroll inputs yet"
          description="Add education-specific inputs such as substitute cover or examination duty for the Payroll module to process."
          action={canAddPayrollInput ? newAdjustmentDialog : undefined}
        />
      ) : (
        periods.map(({ period, rows }) => {
          const total = rows.reduce((sum, row) => sum + Number(row.amount), 0);
          const pending = rows.filter((row) => !row.processedAt).length;
          return (
            <SectionCard
              key={period}
              title={period}
              description={`${rows.length} input${rows.length === 1 ? "" : "s"} · ${money(total)} total`}
              actions={pending > 0 ? <Badge variant="secondary">{pending} pending</Badge> : <Badge>All processed</Badge>}
            >
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Employee</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead>Amount</TableHead>
                    <TableHead>Status</TableHead>
                    {canManage ? <TableHead><span className="sr-only">Actions</span></TableHead> : null}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell>
                        {row.employee ? <span className="font-medium">{row.employee.fullName}<span className="block text-xs text-muted-foreground">{row.employee.employeeNumber}</span></span> : <span className="text-destructive">Unlinked legacy ID: {row.legacyEmployeeId ?? "unknown"}</span>}
                      </TableCell>
                      <TableCell><span>{row.type}</span><Badge variant="outline" className="ml-2">{row.category === "DEDUCTION" ? "Deduction" : "Earning"}</Badge></TableCell>
                      <TableCell className="font-medium">{row.description}</TableCell>
                      <TableCell className="tabular-nums">{money(row.amount)}</TableCell>
                      <TableCell>{row.processedAt ? <div className="space-y-1"><Badge>Processed</Badge>{row.payrollRunId ? <a className="block text-xs text-primary underline-offset-4 hover:underline" href="/app/payroll/runs">View Payroll runs</a> : null}</div> : <Badge variant="secondary">Pending</Badge>}</TableCell>
                      {canManage ? <TableCell className="text-right">
                        {(!row.employeeId || !eligibleEmployeeIds.has(row.employeeId)) && !row.processedAt ? (
                          <EntityDialog
                            trigger={<Button size="sm" variant="outline"><Link2 />{row.employeeId ? "Update employee" : "Link HR employee"}</Button>}
                            title="Link payroll input to HR"
                            description="Choose the HR employee this input belongs to. Its amount, treatment, type, and period will be kept."
                            action={assignPayrollInputEmployeeAction}
                            submitLabel="Save employee link"
                          >
                            <input type="hidden" name="adjustmentId" value={row.id} />
                            <SelectField id={`legacy-payroll-employee-${row.id}`} name="employeeId" label="HR employee" required options={linkCandidates.map((employee) => ({ value: employee.id, label: `${employee.fullName} (${employee.employeeNumber})` }))} emptyHint="Create an HR employee before linking this input." />
                          </EntityDialog>
                        ) : null}
                      </TableCell> : null}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </SectionCard>
          );
        })
      )}
    </div>
  );
}
