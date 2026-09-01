-- AlterTable
-- Forward-only: only affects a row INSERTed after this migration with no
-- explicit currency supplied. No existing Organization row is touched.
ALTER TABLE "Organization" ALTER COLUMN "currency" SET DEFAULT 'GHS';

-- CreateEnum
CREATE TYPE "AccountingWithholdingCategory" AS ENUM ('GOODS', 'SERVICES', 'RENT');

-- AlterTable
ALTER TABLE "AccountingTaxCode" ADD COLUMN "withholdingRate" DECIMAL(7,4) NOT NULL DEFAULT 0;
ALTER TABLE "AccountingTaxCode" ADD COLUMN "withholdingCategory" "AccountingWithholdingCategory";

-- AlterTable
ALTER TABLE "AccountingPayablePayment" ADD COLUMN "withholdingTaxAmount" DECIMAL(12,2) NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "AccountingInvoice" ADD COLUMN "taxInclusive" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "AccountingBill" ADD COLUMN "taxInclusive" BOOLEAN NOT NULL DEFAULT false;
