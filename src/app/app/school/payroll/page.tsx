import { Banknote, Info, Plus } from "lucide-react";
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
import { formatMoney } from "@/components/school/format";
import { requireModuleAccess } from "@/lib/auth/module-access";
import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import { listSchoolPayrollAdjustments } from "@/modules/school/service";
import { createPayrollAdjustmentAction } from "../actions";

/** Free-text `type` values, offered as a list so entries stay consistent across periods. */
const ADJUSTMENT_TYPES = ["Teaching allowance", "Substitute cover", "Overtime", "Examination duty", "Transport allowance", "Deduction", "Bonus", "Other"];

export default async function SchoolPayrollPage({ searchParams }: { searchParams: Promise<{ saved?: string; error?: string }> }) {
  const [tenant, query] = await Promise.all([requireModuleAccess("school"), searchParams]);
  const canManage = hasPermission(tenant, PERMISSIONS.SCHOOL_PAYROLL_MANAGE);
  const adjustments = await listSchoolPayrollAdjustments(tenant.organizationId);

  // Group by pay period so the page reads like a payroll run rather than a flat log.
  const periods = [...new Set(adjustments.map((adjustment) => adjustment.period))]
    .sort((a, b) => b.localeCompare(a))
    .map((period) => ({ period, rows: adjustments.filter((adjustment) => adjustment.period === period) }));

  const newAdjustmentDialog = (
    <EntityDialog
      trigger={<Button size="sm"><Plus />Add payroll input</Button>}
      title="Add a school payroll input"
      description="These inputs are collected here and processed by the Payroll module. Adding one does not pay anybody."
      action={createPayrollAdjustmentAction}
      submitLabel="Add payroll input"
    >
      <TextField
        id="payroll-employee"
        name="employeeId"
        label="HR employee ID"
        required
        maxLength={200}
        hint="Copy this from the employee's record in the HR module. School payroll inputs are not yet linked to HR, so this value is stored as typed and is not verified."
      />
      <TextField id="payroll-period" name="period" label="Pay period" type="month" required hint="The month this input belongs to." />
      <SelectField id="payroll-type" name="type" label="Type" required placeholder="Select a type…" options={ADJUSTMENT_TYPES.map((type) => ({ value: type, label: type }))} />
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
        actions={canManage ? newAdjustmentDialog : undefined}
      />

      <FormFeedback saved={query.saved} error={query.error} savedMessage="The payroll input has been recorded and is waiting for the Payroll module to process it." />
      {!canManage ? <ReadOnlyNotice>Your role can review School payroll inputs but cannot add them.</ReadOnlyNotice> : null}

      <Alert>
        <Info />
        <AlertTitle>These inputs are processed by the Payroll module</AlertTitle>
        <AlertDescription>
          This page only collects education-specific amounts such as substitute cover and teaching allowances. Final salary calculation, statutory deductions, and payslips remain owned by the Payroll module.
        </AlertDescription>
      </Alert>

      {adjustments.length === 0 ? (
        <EmptyState
          icon={Banknote}
          title="No school payroll inputs yet"
          description="Add education-specific inputs such as substitute cover or examination duty for the Payroll module to process."
          action={canManage ? newAdjustmentDialog : undefined}
        />
      ) : (
        periods.map(({ period, rows }) => {
          const total = rows.reduce((sum, row) => sum + Number(row.amount), 0);
          const pending = rows.filter((row) => !row.processedAt).length;
          return (
            <SectionCard
              key={period}
              title={period}
              description={`${rows.length} input${rows.length === 1 ? "" : "s"} · ${formatMoney(total)} total`}
              actions={pending > 0 ? <Badge variant="secondary">{pending} pending</Badge> : <Badge>All processed</Badge>}
            >
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Employee ID</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead>Amount</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell className="font-mono text-xs">{row.employeeId}</TableCell>
                      <TableCell className="text-muted-foreground">{row.type}</TableCell>
                      <TableCell className="font-medium">{row.description}</TableCell>
                      <TableCell className="tabular-nums">{formatMoney(row.amount)}</TableCell>
                      <TableCell>{row.processedAt ? <Badge>Processed</Badge> : <Badge variant="secondary">Pending</Badge>}</TableCell>
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
