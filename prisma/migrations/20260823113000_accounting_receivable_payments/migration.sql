CREATE TABLE "AccountingReceivablePayment" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "invoiceId" TEXT NOT NULL,
  "accountId" TEXT NOT NULL,
  "paymentMethod" TEXT NOT NULL,
  "amount" DECIMAL(12,2) NOT NULL,
  "paymentDate" TIMESTAMP(3) NOT NULL,
  "reference" TEXT,
  "notes" TEXT,
  "createdById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AccountingReceivablePayment_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AccountingReceivablePayment_positive_amount" CHECK ("amount" > 0)
);

CREATE INDEX "AccountingReceivablePayment_organizationId_paymentDate_idx" ON "AccountingReceivablePayment"("organizationId", "paymentDate");
CREATE INDEX "AccountingReceivablePayment_invoiceId_paymentDate_idx" ON "AccountingReceivablePayment"("invoiceId", "paymentDate");
CREATE INDEX "AccountingReceivablePayment_accountId_idx" ON "AccountingReceivablePayment"("accountId");

ALTER TABLE "AccountingReceivablePayment" ADD CONSTRAINT "AccountingReceivablePayment_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AccountingReceivablePayment" ADD CONSTRAINT "AccountingReceivablePayment_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "AccountingInvoice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AccountingReceivablePayment" ADD CONSTRAINT "AccountingReceivablePayment_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "AccountingAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AccountingReceivablePayment" ADD CONSTRAINT "AccountingReceivablePayment_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
