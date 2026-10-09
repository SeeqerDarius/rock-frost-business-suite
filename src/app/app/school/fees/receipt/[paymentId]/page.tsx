import { notFound } from "next/navigation";
import { PrintSchoolFeeReceiptButton } from "./print-button";
import { requireModuleAccess } from "@/lib/auth/module-access";
import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import { formatDate, humanizeStatus } from "@/components/school/format";
import { createOrganizationFormatter } from "@/lib/org-format";
import { getSchoolFeePaymentReceipt } from "@/modules/school/service";

export default async function SchoolFeeReceiptPage({ params }: { params: Promise<{ paymentId: string }> }) {
  const [{ paymentId }, tenant] = await Promise.all([params, requireModuleAccess("school")]);
  const money = createOrganizationFormatter(tenant.organization).money;
  if (!hasPermission(tenant, PERMISSIONS.SCHOOL_FEES_MANAGE) && !hasPermission(tenant, PERMISSIONS.SCHOOL_STUDENT_FINANCE_VIEW)) notFound();
  const receipt = await getSchoolFeePaymentReceipt(tenant.organizationId, paymentId);
  if (!receipt) notFound();

  const organization = receipt.organization;
  const paidToward = receipt.invoice.amount.minus(receipt.invoice.discount);

  return (
    <main className="mx-auto max-w-xl space-y-6 print:max-w-none">
      <div className="flex justify-end print:hidden"><PrintSchoolFeeReceiptButton /></div>
      <article className="space-y-6 rounded-lg border bg-background p-8 print:rounded-none print:border-none print:p-0">
        <header className="space-y-1 text-center">
          <h1 className="text-lg font-semibold">{organization.name}</h1>
          <p className="text-xs text-muted-foreground">{[organization.address, organization.phone, organization.email].filter(Boolean).join(" · ") || "School fee payment receipt"}</p>
        </header>
        <section className="grid grid-cols-2 gap-3 border-y py-3 text-sm">
          <div><p className="text-xs text-muted-foreground">Receipt number</p><p className="font-medium">{receipt.receiptNumber}</p></div>
          <div className="text-right"><p className="text-xs text-muted-foreground">Received</p><p className="font-medium">{receipt.receivedAt.toLocaleString()}</p></div>
          <div><p className="text-xs text-muted-foreground">Student</p><p className="font-medium">{receipt.student.firstName} {receipt.student.lastName}</p><p className="font-mono text-xs text-muted-foreground">{receipt.student.admissionNumber}</p></div>
          <div className="text-right"><p className="text-xs text-muted-foreground">Campus</p><p className="font-medium">{receipt.student.campus.name}</p></div>
        </section>
        <section className="space-y-2 text-sm">
          <div className="flex justify-between gap-4"><span className="text-muted-foreground">Invoice</span><span>{receipt.invoice.invoiceNumber}</span></div>
          <div className="flex justify-between gap-4"><span className="text-muted-foreground">Charge</span><span className="text-right">{receipt.invoice.description}</span></div>
          <div className="flex justify-between gap-4"><span className="text-muted-foreground">Academic period</span><span>{receipt.invoice.academicYear.name}{receipt.invoice.term ? ` · ${receipt.invoice.term.name}` : ""}</span></div>
          <div className="flex justify-between gap-4"><span className="text-muted-foreground">Invoice total</span><span>{money(paidToward, organization.currency)}</span></div>
          {receipt.invoice.dueDate ? <div className="flex justify-between gap-4"><span className="text-muted-foreground">Due date</span><span>{formatDate(receipt.invoice.dueDate)}</span></div> : null}
        </section>
        <section className="space-y-2 border-t pt-4 text-sm">
          <div className="flex justify-between gap-4"><span className="text-muted-foreground">Payment method</span><span>{humanizeStatus(receipt.method)}</span></div>
          {receipt.reference ? <div className="flex justify-between gap-4"><span className="text-muted-foreground">Reference</span><span>{receipt.reference}</span></div> : null}
          <div className="flex justify-between gap-4 border-t pt-3 text-base font-semibold"><span>Amount received</span><span>{money(receipt.amount, organization.currency)}</span></div>
        </section>
        <p className="text-center text-xs text-muted-foreground">Keep this receipt for your records.</p>
      </article>
    </main>
  );
}
