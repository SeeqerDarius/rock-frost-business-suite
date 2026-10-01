import { Prisma } from "@prisma/client";
import { Lock, Plus, Receipt, Send, Layers } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/feedback/empty-state";
import { EntityDialog } from "@/components/forms/entity-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { FormFeedback } from "@/components/school/form-feedback";
import { FieldGrid, SelectField, TextField } from "@/components/school/form-fields";
import { PrerequisiteNotice, SectionCard } from "@/components/school/section-card";
import { RecordSearch } from "@/components/school/record-search";
import { StatusBadge } from "@/components/school/status-badge";
import { formatDate, formatMoney, humanizeStatus } from "@/components/school/format";
import { requireModuleAccess } from "@/lib/auth/module-access";
import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import { getSchoolAcademicSetup, getSchoolFeeInvoiceSummary, listSchoolCampuses, listSchoolFeeInvoicePage, listSchoolFeeStructures, listSchoolStudentChoices } from "@/modules/school/service";
import { RecordPagination } from "@/components/school/record-pagination";
import Link from "next/link";
import { createFeeInvoiceAction, createFeeStructureAction, issueFeeStructureAction, recordFeePaymentAction, retrySchoolFeePostingAction } from "../actions";

const PATH = "/app/school/fees";
const PAYMENT_METHODS = ["CASH", "CARD", "MOBILE_MONEY", "BANK_TRANSFER", "ONLINE", "OTHER"] as const;
const INVOICE_STATUSES = ["DRAFT", "ISSUED", "PART_PAID", "PAID", "VOID"] as const;

export default async function SchoolFeesPage({ searchParams }: { searchParams: Promise<{ saved?: string; error?: string; q?: string; status?: string; page?: string; issued?: string; skipped?: string; posting?: string; studentQ?: string }> }) {
  const [tenant, query] = await Promise.all([requireModuleAccess("school"), searchParams]);

  if (!hasPermission(tenant, PERMISSIONS.SCHOOL_FEES_MANAGE)) {
    return (
      <div className="mx-auto max-w-screen-2xl space-y-6">
        <PageHeader title="Fees & Payments" description="Student invoices, discounts, receipts, and arrears." />
        <EmptyState icon={Lock} title="Fees are restricted" description="Your role does not include School fee access. An organization administrator can grant the School fees permission." />
      </div>
    );
  }

  const statusFilter = INVOICE_STATUSES.find((status) => status === query.status);
  const requestedPage = query.page && /^\d{1,6}$/.test(query.page) ? Number(query.page) : 1;
  const [[years, classes], campuses, students, invoicePage, structures, totals] = await Promise.all([
    getSchoolAcademicSetup(tenant.organizationId),
    listSchoolCampuses(tenant.organizationId),
    listSchoolStudentChoices(tenant.organizationId, { query: query.studentQ }),
    listSchoolFeeInvoicePage(tenant.organizationId, { query: query.q, status: statusFilter, page: requestedPage }),
    listSchoolFeeStructures(tenant.organizationId),
    getSchoolFeeInvoiceSummary(tenant.organizationId),
  ]);
  const invoices = invoicePage.rows;

  const yearOptions = years.map((year) => ({ value: year.id, label: year.current ? `${year.name} (current)` : year.name }));
  const termOptions = years.flatMap((year) => year.terms.map((term) => ({ value: term.id, label: `${year.name} · ${term.name}${term.current ? " (current)" : ""}` })));
  const studentOptions = students.rows.map((student) => ({ value: student.id, label: `${student.lastName}, ${student.firstName} (${student.admissionNumber})` }));

  const paidOn = (invoice: (typeof invoices)[number]) => invoice.payments.filter((payment) => !payment.refundedAt).reduce((sum, payment) => sum.plus(payment.amount), new Prisma.Decimal(0));
  const balanceOf = (invoice: (typeof invoices)[number]) => invoice.amount.minus(invoice.discount).minus(paidOn(invoice));

  const visible = invoices;

  const newStructureDialog = (
    <EntityDialog
      trigger={<Button size="sm" variant="outline"><Layers />New fee structure</Button>}
      title="New fee structure"
      description="A fee structure is a standard charge you can issue to every actively enrolled student in one step."
      action={createFeeStructureAction}
      submitLabel="Create fee structure"
    >
      <TextField id="structure-name" name="name" label="Name" placeholder="Term 1 tuition" required maxLength={200} />
      <SelectField id="structure-campus" name="campusId" label="Campus" required options={campuses.map((campus) => ({ value: campus.id, label: campus.name }))} emptyHint="Create a campus first." />
      <SelectField id="structure-year" name="academicYearId" label="Academic year" required options={yearOptions} emptyHint="Create an academic year first." />
      <SelectField id="structure-term" name="termId" label="Term" options={termOptions} placeholder="All terms" hint="Optional. Leave as “All terms” for a whole-year charge." />
      <SelectField
        id="structure-class"
        name="classId"
        label="Class"
        options={classes.map((schoolClass) => ({ value: schoolClass.id, label: `${schoolClass.campus.name} · ${schoolClass.name}` }))}
        placeholder="All classes on the campus"
        hint="Optional. Restricts the charge to one class."
      />
      <FieldGrid>
        <TextField id="structure-amount" name="amount" label="Amount" type="number" step="0.01" min="0.01" required />
        <TextField id="structure-due" name="dueDate" label="Due date" type="date" hint="Optional." />
      </FieldGrid>
      <div className="space-y-1.5">
        <Label htmlFor="structure-description">Description</Label>
        <Textarea id="structure-description" name="description" rows={2} maxLength={5000} />
        <p className="text-xs leading-relaxed text-muted-foreground">Optional. Appears on the generated invoices instead of the name.</p>
      </div>
    </EntityDialog>
  );

  const newInvoiceDialog = (
    <EntityDialog
      trigger={<Button size="sm"><Plus />New invoice</Button>}
      title="New invoice"
      description="Charges one student. To bill a whole class or campus at once, use a fee structure instead."
      action={createFeeInvoiceAction}
      submitLabel="Issue invoice"
    >
      <SelectField id="invoice-student" name="studentId" label="Student" required options={studentOptions} emptyHint="Admit a student first." />
      <SelectField id="invoice-year" name="academicYearId" label="Academic year" required options={yearOptions} emptyHint="Create an academic year first." />
      <SelectField id="invoice-term" name="termId" label="Term" options={termOptions} placeholder="All terms" hint="Optional. Must belong to the academic year you selected." />
      <TextField id="invoice-description" name="description" label="Description" placeholder="Term 1 tuition" required maxLength={200} />
      <FieldGrid>
        <TextField id="invoice-amount" name="amount" label="Amount" type="number" step="0.01" min="0.01" required />
        <TextField id="invoice-discount" name="discount" label="Discount" type="number" step="0.01" min="0" defaultValue="0" hint="Cannot exceed the amount." />
      </FieldGrid>
      <TextField id="invoice-due" name="dueDate" label="Due date" type="date" hint="Optional." />
    </EntityDialog>
  );

  return (
    <div className="mx-auto max-w-screen-2xl space-y-6">
      <PageHeader
        title="Fees & Payments"
        description="Student invoices, discounts, receipts, and arrears."
        actions={<>{newInvoiceDialog}{campuses.length > 0 && years.length > 0 ? newStructureDialog : null}</>}
      />

      <FormFeedback
        saved={query.saved}
        error={query.error}
        savedMessage={query.issued !== undefined ? `${query.issued} invoice${query.issued === "1" ? " was" : "s were"} issued${query.skipped && query.skipped !== "0" ? `; ${query.skipped} already-billed student${query.skipped === "1" ? " was" : "s were"} skipped` : ""}.` : "The fee record is up to date."}
        stateMessage="Check the amounts: a discount cannot exceed the invoice amount, and a payment cannot exceed the outstanding balance."
      />
      <RecordSearch action={PATH} queryName="studentQ" label="Find a student for an invoice" placeholder="Name or admission number" defaultValue={query.studentQ} hiddenFilters={{ q: query.q, status: statusFilter, page: query.page }} resultSummary={`Showing ${students.rows.length} of ${students.total} students`} />
      {query.posting === "failed" ? <div role="status" className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">The fee payment was recorded and receipted, but its Accounting entry did not post. Use Retry posting beside that payment below.</div> : null}
      {query.posting === "complete" ? <div role="status" className="rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-700 dark:text-emerald-400">Accounting posting is up to date.</div> : null}
      {query.error === "posting-not-retryable" ? <div role="alert" className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">That payment is unavailable for posting. Refresh the fee list and check its current status.</div> : null}
      <PrerequisiteNotice
        items={[
          { satisfied: students.total > 0, label: "Admit a student", href: "/app/school/students" },
          { satisfied: years.length > 0, label: "Create an academic year", href: "/app/school/academic-periods" },
        ]}
      />

      {invoicePage.total > 0 ? (
        <dl className="grid gap-4 sm:grid-cols-3">
          {[
            { label: "Billed", value: totals.billed, hint: "Invoice amounts after discounts" },
            { label: "Collected", value: totals.collected, hint: "Payments received, excluding refunds" },
            { label: "Outstanding", value: totals.outstanding, hint: "Balance on open invoices" },
          ].map((tile) => (
            <Card key={tile.label}>
              <CardContent className="pt-6">
                <dt className="text-xs text-muted-foreground">{tile.label}</dt>
                <dd className="mt-1 text-2xl font-semibold tabular-nums">{formatMoney(tile.value)}</dd>
                <p className="mt-1 text-xs text-muted-foreground">{tile.hint}</p>
              </CardContent>
            </Card>
          ))}
        </dl>
      ) : null}

      {structures.length > 0 ? (
        <SectionCard title="Fee structures" description="Standard charges you can issue to every actively enrolled student in one step.">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead className="hidden md:table-cell">Applies to</TableHead>
                <TableHead>Amount</TableHead>
                <TableHead className="hidden lg:table-cell">Due</TableHead>
                <TableHead>Issued</TableHead>
                <TableHead><span className="sr-only">Actions</span></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {structures.map((structure) => (
                <TableRow key={structure.id}>
                  <TableCell>
                    <span className="font-medium">{structure.name}</span>
                    {!structure.active ? <Badge variant="outline" className="ml-2">Inactive</Badge> : null}
                  </TableCell>
                  <TableCell className="hidden text-muted-foreground md:table-cell">
                    {structure.campus.name} · {structure.academicYear.name}
                    {structure.term ? ` · ${structure.term.name}` : " · All terms"}
                    {structure.class ? ` · ${structure.class.name}` : " · All classes"}
                  </TableCell>
                  <TableCell className="tabular-nums">{formatMoney(structure.amount)}</TableCell>
                  <TableCell className="hidden text-muted-foreground lg:table-cell">{formatDate(structure.dueDate)}</TableCell>
                  <TableCell className="tabular-nums">{structure._count.invoices}</TableCell>
                  <TableCell className="text-right">
                    {structure.active ? (
                      <form action={issueFeeStructureAction}>
                        <input type="hidden" name="feeStructureId" value={structure.id} />
                        <Button type="submit" size="sm" variant="outline">
                          <Send />
                          Issue to students
                        </Button>
                      </form>
                    ) : null}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <p className="mt-3 text-xs text-muted-foreground">
            Issuing creates one invoice per actively enrolled student who has not already been invoiced for that structure, so it is safe to run again after new enrollments.
          </p>
        </SectionCard>
      ) : null}

      {invoicePage.total === 0 && !query.q?.trim() && !statusFilter ? (
        <EmptyState
          icon={Receipt}
          title="No fee invoices yet"
          description="Issue an invoice to a single student, or create a fee structure to bill a whole class or campus at once."
          action={students.total > 0 && years.length > 0 ? newInvoiceDialog : undefined}
        />
      ) : (
        <SectionCard title="Invoices" description={`${invoicePage.total} invoice${invoicePage.total === 1 ? "" : "s"}, newest first.`}>
          <div className="space-y-4">
            <RecordSearch
              action={PATH}
              label="Search invoices"
              placeholder="Invoice number, student, or description"
              defaultValue={query.q}
              hiddenFilters={{ studentQ: query.studentQ }}
              isFiltered={Boolean(query.q || statusFilter)}
              resultSummary={`Showing ${visible.length} of ${invoicePage.total}`}
              filters={
                <div className="w-40 space-y-1.5">
                  <Label htmlFor="invoice-status-filter">Status</Label>
                  <select
                    id="invoice-status-filter"
                    name="status"
                    defaultValue={statusFilter ?? ""}
                    className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 py-1 text-base outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 md:text-sm dark:bg-input/30"
                  >
                    <option value="">All statuses</option>
                    {INVOICE_STATUSES.map((status) => <option key={status} value={status}>{humanizeStatus(status)}</option>)}
                  </select>
                </div>
              }
            />

            {visible.length === 0 ? (
              <p className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">No invoices match this search.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Invoice</TableHead>
                    <TableHead>Student</TableHead>
                    <TableHead className="hidden lg:table-cell">Period</TableHead>
                    <TableHead>Charged</TableHead>
                    <TableHead className="hidden sm:table-cell">Paid</TableHead>
                    <TableHead>Balance</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead><span className="sr-only">Actions</span></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {visible.map((invoice) => {
                    const paid = paidOn(invoice);
                    const balance = balanceOf(invoice);
                    const isOpen = invoice.status === "ISSUED" || invoice.status === "PART_PAID";
                    return (
                      <TableRow key={invoice.id}>
                        <TableCell>
                          <span className="font-mono text-xs">{invoice.invoiceNumber}</span>
                          <span className="block text-xs text-muted-foreground">{invoice.description}</span>
                          {invoice.payments.map((payment) => (
                            <span key={payment.id} className="mt-1 flex flex-wrap items-center gap-2 text-xs">
                              <Link className="text-muted-foreground underline underline-offset-2" href={`/app/school/fees/receipt/${payment.id}`} target="_blank">Receipt {payment.receiptNumber}: {formatMoney(payment.amount)}</Link>
                              <Badge variant={payment.postingStatus === "FAILED" ? "destructive" : payment.postingStatus === "POSTED" ? "default" : "outline"}>
                                {payment.postingStatus === "NOT_REQUIRED" ? "Accounting inactive" : `Accounting ${humanizeStatus(payment.postingStatus)}`}
                              </Badge>
                              {!payment.refundedAt && payment.postingStatus !== "POSTED" ? (
                                <form action={retrySchoolFeePostingAction}>
                                  <input type="hidden" name="paymentId" value={payment.id} />
                                  <Button type="submit" size="xs" variant="outline">Retry posting</Button>
                                </form>
                              ) : null}
                            </span>
                          ))}
                        </TableCell>
                        <TableCell>
                          <span className="font-medium">{invoice.student.firstName} {invoice.student.lastName}</span>
                          <span className="block font-mono text-xs text-muted-foreground">{invoice.student.admissionNumber}</span>
                        </TableCell>
                        <TableCell className="hidden text-muted-foreground lg:table-cell">
                          {invoice.academicYear.name}{invoice.term ? ` · ${invoice.term.name}` : ""}
                          {invoice.dueDate ? <span className="block text-xs">Due {formatDate(invoice.dueDate)}</span> : null}
                        </TableCell>
                        <TableCell className="tabular-nums">
                          {formatMoney(invoice.amount.minus(invoice.discount))}
                          {invoice.discount.gt(0) ? <span className="block text-xs text-muted-foreground">after {formatMoney(invoice.discount)} discount</span> : null}
                        </TableCell>
                        <TableCell className="hidden tabular-nums sm:table-cell">{formatMoney(paid)}</TableCell>
                        <TableCell className="font-medium tabular-nums">{formatMoney(balance)}</TableCell>
                        <TableCell><StatusBadge status={invoice.status} /></TableCell>
                        <TableCell className="text-right">
                          {isOpen && balance.gt(0) ? (
                            <EntityDialog
                              trigger={<Button size="sm" variant="ghost">Record payment</Button>}
                              title={`Record a payment for ${invoice.invoiceNumber}`}
                              description={`${invoice.student.firstName} ${invoice.student.lastName} · Outstanding ${formatMoney(balance)}. A receipt number is generated automatically.`}
                              action={recordFeePaymentAction}
                              submitLabel="Record payment"
                            >
                              <input type="hidden" name="invoiceId" value={invoice.id} />
                              <TextField
                                id={`payment-amount-${invoice.id}`}
                                name="amount"
                                label="Amount"
                                type="number"
                                step="0.01"
                                min="0.01"
                                max={balance.toString()}
                                defaultValue={balance.toFixed(2)}
                                required
                                hint={`Cannot exceed the outstanding ${formatMoney(balance)}.`}
                              />
                              <SelectField
                                id={`payment-method-${invoice.id}`}
                                name="method"
                                label="Payment method"
                                required
                                defaultValue="CASH"
                                placeholder="Select a method…"
                                options={PAYMENT_METHODS.map((method) => ({ value: method, label: humanizeStatus(method) }))}
                              />
                              <TextField id={`payment-reference-${invoice.id}`} name="reference" label="Reference" maxLength={200} hint="Optional. Mobile money or bank transaction reference." />
                            </EntityDialog>
                          ) : null}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
            <RecordPagination path={PATH} page={invoicePage.page} pageCount={invoicePage.pageCount} filters={{ q: query.q, status: statusFilter, studentQ: query.studentQ }} label="Invoice list" />
          </div>
        </SectionCard>
      )}
    </div>
  );
}
