-- Multi-currency accounting documents (additive, backward compatible).
-- Every existing document becomes a base-currency document at rate 1, so
-- all existing totals, balances, and postings are unchanged.

-- AlterTable
ALTER TABLE "AccountingAccount" ADD COLUMN     "currency" TEXT;

-- AlterTable
ALTER TABLE "AccountingInvoice" ADD COLUMN     "baseAmount" DECIMAL(14,2),
ADD COLUMN     "baseAmountSettled" DECIMAL(14,2) NOT NULL DEFAULT 0,
ADD COLUMN     "currency" TEXT,
ADD COLUMN     "exchangeRate" DECIMAL(20,10) NOT NULL DEFAULT 1,
ADD COLUMN     "exchangeRateDate" TIMESTAMP(3),
ADD COLUMN     "exchangeRateSource" TEXT;

-- AlterTable
ALTER TABLE "AccountingContact" ADD COLUMN     "countryCode" TEXT,
ADD COLUMN     "currency" TEXT,
ADD COLUMN     "vatNumber" TEXT;

-- AlterTable
ALTER TABLE "AccountingBill" ADD COLUMN     "baseAmount" DECIMAL(14,2),
ADD COLUMN     "baseAmountSettled" DECIMAL(14,2) NOT NULL DEFAULT 0,
ADD COLUMN     "currency" TEXT,
ADD COLUMN     "exchangeRate" DECIMAL(20,10) NOT NULL DEFAULT 1,
ADD COLUMN     "exchangeRateDate" TIMESTAMP(3),
ADD COLUMN     "exchangeRateSource" TEXT;

-- AlterTable
ALTER TABLE "AccountingPayablePayment" ADD COLUMN     "baseAmount" DECIMAL(14,2),
ADD COLUMN     "currency" TEXT,
ADD COLUMN     "exchangeRate" DECIMAL(20,10) NOT NULL DEFAULT 1,
ADD COLUMN     "exchangeRateSource" TEXT,
ADD COLUMN     "realizedFxAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
ADD COLUMN     "settledBaseAmount" DECIMAL(14,2);

-- AlterTable
ALTER TABLE "AccountingCreditNote" ADD COLUMN     "baseAmount" DECIMAL(14,2),
ADD COLUMN     "currency" TEXT,
ADD COLUMN     "exchangeRate" DECIMAL(20,10) NOT NULL DEFAULT 1,
ADD COLUMN     "exchangeRateDate" TIMESTAMP(3),
ADD COLUMN     "exchangeRateSource" TEXT;

-- AlterTable
ALTER TABLE "AccountingTaxTransaction" ADD COLUMN     "currency" TEXT,
ADD COLUMN     "exchangeRate" DECIMAL(20,10);

-- AlterTable
ALTER TABLE "AccountingReceivablePayment" ADD COLUMN     "baseAmount" DECIMAL(14,2),
ADD COLUMN     "currency" TEXT,
ADD COLUMN     "exchangeRate" DECIMAL(20,10) NOT NULL DEFAULT 1,
ADD COLUMN     "exchangeRateSource" TEXT,
ADD COLUMN     "realizedFxAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
ADD COLUMN     "settledBaseAmount" DECIMAL(14,2);

-- AlterTable
ALTER TABLE "AccountingJournalLine" ADD COLUMN     "exchangeRate" DECIMAL(20,10),
ADD COLUMN     "transactionAmount" DECIMAL(14,2),
ADD COLUMN     "transactionCurrency" TEXT;


-- Integrity guards.
ALTER TABLE "AccountingInvoice" ADD CONSTRAINT "AccountingInvoice_exchangeRate_positive_check" CHECK ("exchangeRate" > 0);
ALTER TABLE "AccountingBill" ADD CONSTRAINT "AccountingBill_exchangeRate_positive_check" CHECK ("exchangeRate" > 0);
ALTER TABLE "AccountingCreditNote" ADD CONSTRAINT "AccountingCreditNote_exchangeRate_positive_check" CHECK ("exchangeRate" > 0);
ALTER TABLE "AccountingReceivablePayment" ADD CONSTRAINT "AccountingReceivablePayment_exchangeRate_positive_check" CHECK ("exchangeRate" > 0);
ALTER TABLE "AccountingPayablePayment" ADD CONSTRAINT "AccountingPayablePayment_exchangeRate_positive_check" CHECK ("exchangeRate" > 0);

-- Backfill: documents and payments are in the organization's base currency.
UPDATE "AccountingInvoice" d SET "currency" = o."currency", "baseAmount" = d."amount", "baseAmountSettled" = d."amountPaid" + d."amountCredited"
FROM "Organization" o WHERE o."id" = d."organizationId" AND d."currency" IS NULL;
UPDATE "AccountingBill" d SET "currency" = o."currency", "baseAmount" = d."amount", "baseAmountSettled" = d."amountPaid"
FROM "Organization" o WHERE o."id" = d."organizationId" AND d."currency" IS NULL;
UPDATE "AccountingCreditNote" d SET "currency" = o."currency", "baseAmount" = d."amount"
FROM "Organization" o WHERE o."id" = d."organizationId" AND d."currency" IS NULL;
UPDATE "AccountingReceivablePayment" p SET "currency" = o."currency", "baseAmount" = p."amount", "settledBaseAmount" = p."amount"
FROM "Organization" o WHERE o."id" = p."organizationId" AND p."currency" IS NULL;
UPDATE "AccountingPayablePayment" p SET "currency" = o."currency", "baseAmount" = p."amount", "settledBaseAmount" = p."amount"
FROM "Organization" o WHERE o."id" = p."organizationId" AND p."currency" IS NULL;

-- Indexes for currency-filtered reporting.
CREATE INDEX "AccountingInvoice_organizationId_currency_idx" ON "AccountingInvoice"("organizationId", "currency");
CREATE INDEX "AccountingBill_organizationId_currency_idx" ON "AccountingBill"("organizationId", "currency");
