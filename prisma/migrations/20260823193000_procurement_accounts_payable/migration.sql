ALTER TYPE "ProcurementSupplierInvoiceStatus" ADD VALUE IF NOT EXISTS 'PARTIALLY_PAID';
ALTER TYPE "ProcurementSupplierInvoiceStatus" ADD VALUE IF NOT EXISTS 'PAID';

ALTER TABLE "ProcurementSupplierInvoice"
  ADD COLUMN "dueDate" TIMESTAMP(3),
  ADD COLUMN "amountPaid" DECIMAL(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN "paidAt" TIMESTAMP(3);

CREATE TABLE "ProcurementSupplierPayment" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "invoiceId" TEXT NOT NULL,
  "accountId" TEXT,
  "paymentMethod" TEXT NOT NULL,
  "amount" DECIMAL(12,2) NOT NULL,
  "paymentDate" TIMESTAMP(3) NOT NULL,
  "reference" TEXT,
  "notes" TEXT,
  "createdById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ProcurementSupplierPayment_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ProcurementSupplierPayment_positive_amount" CHECK ("amount" > 0)
);

CREATE INDEX "ProcurementSupplierPayment_organizationId_paymentDate_idx" ON "ProcurementSupplierPayment"("organizationId", "paymentDate");
CREATE INDEX "ProcurementSupplierPayment_invoiceId_createdAt_idx" ON "ProcurementSupplierPayment"("invoiceId", "createdAt");
CREATE INDEX "ProcurementSupplierPayment_accountId_idx" ON "ProcurementSupplierPayment"("accountId");

ALTER TABLE "ProcurementSupplierPayment" ADD CONSTRAINT "ProcurementSupplierPayment_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProcurementSupplierPayment" ADD CONSTRAINT "ProcurementSupplierPayment_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "ProcurementSupplierInvoice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ProcurementSupplierPayment" ADD CONSTRAINT "ProcurementSupplierPayment_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "AccountingAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ProcurementSupplierPayment" ADD CONSTRAINT "ProcurementSupplierPayment_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
