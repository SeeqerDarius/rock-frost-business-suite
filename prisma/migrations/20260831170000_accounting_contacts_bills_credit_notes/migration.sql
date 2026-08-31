-- CreateEnum
CREATE TYPE "AccountingContactType" AS ENUM ('CUSTOMER', 'SUPPLIER', 'BOTH');

-- CreateEnum
CREATE TYPE "AccountingBillStatus" AS ENUM ('DRAFT', 'APPROVED', 'PARTIALLY_PAID', 'PAID', 'VOID');

-- CreateEnum
CREATE TYPE "AccountingCreditNoteStatus" AS ENUM ('DRAFT', 'APPLIED', 'REFUNDED', 'VOID');

-- AlterTable
ALTER TABLE "AccountingInvoice" ADD COLUMN "contactId" TEXT;
ALTER TABLE "AccountingInvoice" ADD COLUMN "amountCredited" DECIMAL(12,2) NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "AccountingInvoiceLine" (
    "id" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "quantity" DECIMAL(12,2) NOT NULL DEFAULT 1,
    "unitPrice" DECIMAL(12,2) NOT NULL,
    "lineTotal" DECIMAL(12,2) NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "AccountingInvoiceLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AccountingContact" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "branchId" TEXT,
    "type" "AccountingContactType" NOT NULL DEFAULT 'CUSTOMER',
    "name" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "address" TEXT,
    "taxIdentificationNumber" TEXT,
    "fleetOwnerId" TEXT,
    "procurementVendorId" TEXT,
    "crmContactId" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AccountingContact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AccountingBill" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "branchId" TEXT,
    "billNumber" TEXT NOT NULL,
    "contactId" TEXT,
    "supplierName" TEXT NOT NULL,
    "supplierEmail" TEXT,
    "description" TEXT,
    "expenseAccountId" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "taxableAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "vatAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "nhilAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "getfundAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "taxCodeId" TEXT,
    "amountPaid" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "billDate" TIMESTAMP(3) NOT NULL,
    "dueDate" TIMESTAMP(3) NOT NULL,
    "status" "AccountingBillStatus" NOT NULL DEFAULT 'DRAFT',
    "paidAt" TIMESTAMP(3),
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AccountingBill_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AccountingBillLine" (
    "id" TEXT NOT NULL,
    "billId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "quantity" DECIMAL(12,2) NOT NULL DEFAULT 1,
    "unitPrice" DECIMAL(12,2) NOT NULL,
    "lineTotal" DECIMAL(12,2) NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "AccountingBillLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AccountingPayablePayment" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "billId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "paymentMethod" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "paymentDate" TIMESTAMP(3) NOT NULL,
    "reference" TEXT,
    "notes" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AccountingPayablePayment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AccountingCreditNote" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "branchId" TEXT,
    "creditNoteNumber" TEXT NOT NULL,
    "contactId" TEXT,
    "customerName" TEXT NOT NULL,
    "customerEmail" TEXT,
    "description" TEXT,
    "amount" DECIMAL(12,2) NOT NULL,
    "taxableAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "vatAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "nhilAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "getfundAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "taxCodeId" TEXT,
    "invoiceId" TEXT,
    "issueDate" TIMESTAMP(3) NOT NULL,
    "status" "AccountingCreditNoteStatus" NOT NULL DEFAULT 'DRAFT',
    "settledAt" TIMESTAMP(3),
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AccountingCreditNote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AccountingCreditNoteLine" (
    "id" TEXT NOT NULL,
    "creditNoteId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "quantity" DECIMAL(12,2) NOT NULL DEFAULT 1,
    "unitPrice" DECIMAL(12,2) NOT NULL,
    "lineTotal" DECIMAL(12,2) NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "AccountingCreditNoteLine_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AccountingInvoiceLine_invoiceId_idx" ON "AccountingInvoiceLine"("invoiceId");

-- CreateIndex
CREATE INDEX "AccountingContact_organizationId_idx" ON "AccountingContact"("organizationId");

-- CreateIndex
CREATE INDEX "AccountingContact_branchId_idx" ON "AccountingContact"("branchId");

-- CreateIndex
CREATE INDEX "AccountingContact_email_idx" ON "AccountingContact"("email");

-- CreateIndex
CREATE UNIQUE INDEX "AccountingBill_organizationId_billNumber_key" ON "AccountingBill"("organizationId", "billNumber");

-- CreateIndex
CREATE INDEX "AccountingBill_organizationId_status_idx" ON "AccountingBill"("organizationId", "status");

-- CreateIndex
CREATE INDEX "AccountingBill_branchId_idx" ON "AccountingBill"("branchId");

-- CreateIndex
CREATE INDEX "AccountingBill_taxCodeId_idx" ON "AccountingBill"("taxCodeId");

-- CreateIndex
CREATE INDEX "AccountingBill_contactId_idx" ON "AccountingBill"("contactId");

-- CreateIndex
CREATE INDEX "AccountingBill_expenseAccountId_idx" ON "AccountingBill"("expenseAccountId");

-- CreateIndex
CREATE INDEX "AccountingBillLine_billId_idx" ON "AccountingBillLine"("billId");

-- CreateIndex
CREATE INDEX "AccountingPayablePayment_organizationId_paymentDate_idx" ON "AccountingPayablePayment"("organizationId", "paymentDate");

-- CreateIndex
CREATE INDEX "AccountingPayablePayment_billId_paymentDate_idx" ON "AccountingPayablePayment"("billId", "paymentDate");

-- CreateIndex
CREATE INDEX "AccountingPayablePayment_accountId_idx" ON "AccountingPayablePayment"("accountId");

-- CreateIndex
CREATE UNIQUE INDEX "AccountingCreditNote_organizationId_creditNoteNumber_key" ON "AccountingCreditNote"("organizationId", "creditNoteNumber");

-- CreateIndex
CREATE INDEX "AccountingCreditNote_organizationId_status_idx" ON "AccountingCreditNote"("organizationId", "status");

-- CreateIndex
CREATE INDEX "AccountingCreditNote_branchId_idx" ON "AccountingCreditNote"("branchId");

-- CreateIndex
CREATE INDEX "AccountingCreditNote_contactId_idx" ON "AccountingCreditNote"("contactId");

-- CreateIndex
CREATE INDEX "AccountingCreditNote_invoiceId_idx" ON "AccountingCreditNote"("invoiceId");

-- CreateIndex
CREATE INDEX "AccountingCreditNote_taxCodeId_idx" ON "AccountingCreditNote"("taxCodeId");

-- CreateIndex
CREATE INDEX "AccountingCreditNoteLine_creditNoteId_idx" ON "AccountingCreditNoteLine"("creditNoteId");

-- CreateIndex
CREATE INDEX "AccountingInvoice_contactId_idx" ON "AccountingInvoice"("contactId");

-- AddForeignKey
ALTER TABLE "AccountingInvoice" ADD CONSTRAINT "AccountingInvoice_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "AccountingContact"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountingInvoiceLine" ADD CONSTRAINT "AccountingInvoiceLine_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "AccountingInvoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountingContact" ADD CONSTRAINT "AccountingContact_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountingContact" ADD CONSTRAINT "AccountingContact_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountingContact" ADD CONSTRAINT "AccountingContact_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountingBill" ADD CONSTRAINT "AccountingBill_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountingBill" ADD CONSTRAINT "AccountingBill_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountingBill" ADD CONSTRAINT "AccountingBill_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "AccountingContact"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountingBill" ADD CONSTRAINT "AccountingBill_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountingBill" ADD CONSTRAINT "AccountingBill_taxCodeId_fkey" FOREIGN KEY ("taxCodeId") REFERENCES "AccountingTaxCode"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountingBill" ADD CONSTRAINT "AccountingBill_expenseAccountId_fkey" FOREIGN KEY ("expenseAccountId") REFERENCES "AccountingAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountingBillLine" ADD CONSTRAINT "AccountingBillLine_billId_fkey" FOREIGN KEY ("billId") REFERENCES "AccountingBill"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountingPayablePayment" ADD CONSTRAINT "AccountingPayablePayment_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountingPayablePayment" ADD CONSTRAINT "AccountingPayablePayment_billId_fkey" FOREIGN KEY ("billId") REFERENCES "AccountingBill"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountingPayablePayment" ADD CONSTRAINT "AccountingPayablePayment_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "AccountingAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountingPayablePayment" ADD CONSTRAINT "AccountingPayablePayment_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountingCreditNote" ADD CONSTRAINT "AccountingCreditNote_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountingCreditNote" ADD CONSTRAINT "AccountingCreditNote_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountingCreditNote" ADD CONSTRAINT "AccountingCreditNote_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "AccountingContact"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountingCreditNote" ADD CONSTRAINT "AccountingCreditNote_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "AccountingInvoice"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountingCreditNote" ADD CONSTRAINT "AccountingCreditNote_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountingCreditNote" ADD CONSTRAINT "AccountingCreditNote_taxCodeId_fkey" FOREIGN KEY ("taxCodeId") REFERENCES "AccountingTaxCode"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountingCreditNoteLine" ADD CONSTRAINT "AccountingCreditNoteLine_creditNoteId_fkey" FOREIGN KEY ("creditNoteId") REFERENCES "AccountingCreditNote"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill: one AccountingInvoiceLine per existing invoice, so every
-- pre-Track-7 invoice has real line data instead of only a header total.
-- unitPrice/lineTotal use taxableAmount (the pre-tax base), matching how a
-- newly-created invoice's taxableAmount is always the sum of its own
-- lines' lineTotal - this keeps old and new invoices internally consistent
-- under the same "header total = sum of lines" invariant.
INSERT INTO "AccountingInvoiceLine" ("id", "invoiceId", "description", "quantity", "unitPrice", "lineTotal", "sortOrder")
SELECT
  'invln_' || substr(md5(random()::text || clock_timestamp()::text || i.id), 1, 20),
  i.id,
  COALESCE(NULLIF(TRIM(i.description), ''), 'Invoice ' || i."invoiceNumber"),
  1,
  i."taxableAmount",
  i."taxableAmount",
  0
FROM "AccountingInvoice" i;
