import { Receipt, Plus } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/feedback/empty-state";
import { EntityDialog } from "@/components/forms/entity-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { SectionCard } from "@/components/school/section-card";
import { requireModuleAccess } from "@/lib/auth/module-access";
import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import { listHostelFeeStructures, listHostelFeeInvoices, listHostelBuildings } from "@/modules/hostel/service";
import { listSchoolStudents, getSchoolAcademicSetup } from "@/modules/school/service";
import { createFeeStructureAction, issueFeeStructureAction, createFeeInvoiceAction, recordFeePaymentAction } from "../actions";

const ERROR_MESSAGES: Record<string, string> = {
  forbidden: "You don't have permission to manage hostel fees.",
  invalid: "All required fields must be filled in correctly.",
  "not-found": "That fee structure, invoice, or student could not be found.",
  "state-payment-exceeds-balance": "That payment exceeds the invoice's outstanding balance.",
};

const STATUS_BADGE: Record<string, "default" | "outline" | "destructive" | "secondary"> = {
  DRAFT: "outline", ISSUED: "outline", PART_PAID: "secondary", PAID: "default", VOID: "destructive",
};

export default async function HostelFeesPage({ searchParams }: { searchParams: Promise<{ saved?: string; error?: string; issued?: string; skipped?: string }> }) {
  const { saved, error, issued, skipped } = await searchParams;
  const tenant = await requireModuleAccess("hostel");
  const canManage = hasPermission(tenant, PERMISSIONS.HOSTEL_FEES_MANAGE);
  const [structures, invoices, buildings, students, [academicYears]] = await Promise.all([
    listHostelFeeStructures(tenant.organizationId),
    listHostelFeeInvoices(tenant.organizationId),
    listHostelBuildings(tenant.organizationId),
    listSchoolStudents(tenant.organizationId),
    getSchoolAcademicSetup(tenant.organizationId),
  ]);

  const studentOptions = students.filter((s) => s.status === "ACTIVE").map((s) => ({ value: s.id, label: `${s.lastName}, ${s.firstName} (${s.admissionNumber})` }));

  return (
    <div className="space-y-6">
      <PageHeader title="Fees & Payments" description="Hostel fee structures, invoices, and payments." />

      {saved ? (
        <div className="rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-600 dark:text-emerald-400">
          Saved.{issued != null ? ` Issued ${issued} invoice${issued === "1" ? "" : "s"}${skipped && skipped !== "0" ? `, skipped ${skipped} already-issued` : ""}.` : ""}
        </div>
      ) : null}
      {error && ERROR_MESSAGES[error] ? <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">{ERROR_MESSAGES[error]}</div> : null}

      <SectionCard
        title="Fee structures"
        description="A standard fee amount for a building (or all buildings), issued to every currently-allocated student at once."
        actions={canManage ? (
          <EntityDialog trigger={<Button size="sm"><Plus />New structure</Button>} title="New hostel fee structure" action={createFeeStructureAction}>
            <div className="space-y-2"><Label htmlFor="name">Name</Label><Input id="name" name="name" placeholder="Term 1 hostel fee" required /></div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="buildingId">Building</Label>
                <select id="buildingId" name="buildingId" className="h-9 w-full rounded-md border bg-transparent px-3 text-sm" defaultValue="">
                  <option value="">All buildings</option>
                  {buildings.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                </select>
              </div>
              <div className="space-y-2"><Label htmlFor="amount">Amount</Label><Input id="amount" name="amount" type="number" step="0.01" required /></div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="academicYearId">Academic year</Label>
                <select id="academicYearId" name="academicYearId" className="h-9 w-full rounded-md border bg-transparent px-3 text-sm" required defaultValue="">
                  <option value="" disabled>Select an academic year</option>
                  {academicYears.map((y) => <option key={y.id} value={y.id}>{y.name}</option>)}
                </select>
              </div>
              <div className="space-y-2"><Label htmlFor="dueDate">Due date</Label><Input id="dueDate" name="dueDate" type="date" /></div>
            </div>
            <div className="space-y-2"><Label htmlFor="description">Description</Label><Textarea id="description" name="description" rows={2} /></div>
          </EntityDialog>
        ) : undefined}
      >
        {structures.length === 0 ? (
          <p className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">No fee structures yet.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Scope</TableHead>
                <TableHead>Amount</TableHead>
                <TableHead>Issued</TableHead>
                {canManage ? <TableHead /> : null}
              </TableRow>
            </TableHeader>
            <TableBody>
              {structures.map((structure) => (
                <TableRow key={structure.id}>
                  <TableCell className="font-medium">{structure.name}</TableCell>
                  <TableCell className="text-muted-foreground">{structure.building?.name ?? "All buildings"} · {structure.academicYear.name}</TableCell>
                  <TableCell className="text-muted-foreground">{Number(structure.amount).toFixed(2)}</TableCell>
                  <TableCell className="text-muted-foreground">{structure._count.invoices}</TableCell>
                  {canManage ? (
                    <TableCell className="text-right">
                      <form action={issueFeeStructureAction}>
                        <input type="hidden" name="feeStructureId" value={structure.id} />
                        <Button type="submit" size="sm" variant="ghost">Issue to allocated students</Button>
                      </form>
                    </TableCell>
                  ) : null}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </SectionCard>

      <SectionCard
        title="Invoices"
        description="Every hostel fee invoice, from structures or created directly."
        actions={canManage ? (
          <EntityDialog trigger={<Button size="sm" variant="outline"><Plus />Manual invoice</Button>} title="New hostel invoice" action={createFeeInvoiceAction} submitLabel="Create invoice">
            <div className="space-y-2">
              <Label htmlFor="studentId">Student</Label>
              <select id="studentId" name="studentId" className="h-9 w-full rounded-md border bg-transparent px-3 text-sm" required defaultValue="">
                <option value="" disabled>Select a student</option>
                {studentOptions.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="academicYearId">Academic year</Label>
              <select id="academicYearId" name="academicYearId" className="h-9 w-full rounded-md border bg-transparent px-3 text-sm" required defaultValue="">
                <option value="" disabled>Select an academic year</option>
                {academicYears.map((y) => <option key={y.id} value={y.id}>{y.name}</option>)}
              </select>
            </div>
            <div className="space-y-2"><Label htmlFor="description">Description</Label><Input id="description" name="description" required /></div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2"><Label htmlFor="amount">Amount</Label><Input id="amount" name="amount" type="number" step="0.01" required /></div>
              <div className="space-y-2"><Label htmlFor="discount">Discount</Label><Input id="discount" name="discount" type="number" step="0.01" defaultValue="0" /></div>
            </div>
            <div className="space-y-2"><Label htmlFor="dueDate">Due date</Label><Input id="dueDate" name="dueDate" type="date" /></div>
          </EntityDialog>
        ) : undefined}
      >
        {invoices.length === 0 ? (
          <EmptyState icon={Receipt} title="No hostel invoices yet" description="Issue a fee structure or create a manual invoice." />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Number</TableHead>
                <TableHead>Student</TableHead>
                <TableHead>Amount</TableHead>
                <TableHead>Status</TableHead>
                {canManage ? <TableHead /> : null}
              </TableRow>
            </TableHeader>
            <TableBody>
              {invoices.map((invoice) => {
                const paid = invoice.payments.filter((p) => !p.refundedAt).reduce((sum, p) => sum + Number(p.amount), 0);
                const due = Number(invoice.amount) - Number(invoice.discount) - paid;
                return (
                  <TableRow key={invoice.id}>
                    <TableCell className="font-mono text-xs">{invoice.invoiceNumber}</TableCell>
                    <TableCell className="font-medium">{invoice.student.firstName} {invoice.student.lastName}</TableCell>
                    <TableCell className="text-muted-foreground">{Number(invoice.amount).toFixed(2)}{due > 0 ? <span className="block text-xs">Due {due.toFixed(2)}</span> : null}</TableCell>
                    <TableCell><Badge variant={STATUS_BADGE[invoice.status]}>{invoice.status}</Badge></TableCell>
                    {canManage ? (
                      <TableCell className="text-right">
                        {invoice.status === "ISSUED" || invoice.status === "PART_PAID" ? (
                          <EntityDialog trigger={<Button size="sm" variant="ghost">Record payment</Button>} title={`Record payment for ${invoice.invoiceNumber}`} action={recordFeePaymentAction} submitLabel="Record payment">
                            <input type="hidden" name="invoiceId" value={invoice.id} />
                            <div className="space-y-2"><Label htmlFor={`amount-${invoice.id}`}>Amount</Label><Input id={`amount-${invoice.id}`} name="amount" type="number" step="0.01" defaultValue={due.toFixed(2)} required /></div>
                            <div className="space-y-2">
                              <Label htmlFor={`method-${invoice.id}`}>Method</Label>
                              <select id={`method-${invoice.id}`} name="method" className="h-9 w-full rounded-md border bg-transparent px-3 text-sm" defaultValue="CASH">
                                <option value="CASH">Cash</option>
                                <option value="CARD">Card</option>
                                <option value="MOBILE_MONEY">Mobile money</option>
                                <option value="BANK_TRANSFER">Bank transfer</option>
                                <option value="ONLINE">Online</option>
                                <option value="OTHER">Other</option>
                              </select>
                            </div>
                            <div className="space-y-2"><Label htmlFor={`reference-${invoice.id}`}>Reference</Label><Input id={`reference-${invoice.id}`} name="reference" /></div>
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
      </SectionCard>
    </div>
  );
}
