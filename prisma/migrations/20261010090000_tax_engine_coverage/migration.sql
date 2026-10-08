-- AlterEnum
ALTER TYPE "TaxDocumentType" ADD VALUE 'SUPPLIER_INVOICE';

-- AlterTable
ALTER TABLE "AccountingCreditNote" ADD COLUMN     "taxAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
ADD COLUMN     "taxRuleId" TEXT,
ADD COLUMN     "taxTreatment" "TaxTreatment";

-- AlterTable
ALTER TABLE "ProcurementSupplierInvoice" ADD COLUMN     "taxAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
ADD COLUMN     "taxRuleId" TEXT,
ADD COLUMN     "taxTreatment" "TaxTreatment";

