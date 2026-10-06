-- International tax engine core (additive, backward compatible).
-- Existing documents keep their legacy AccountingTaxCode components; taxAmount
-- is backfilled as their total for consistent display.

-- CreateEnum
CREATE TYPE "TaxJurisdictionLevel" AS ENUM ('SUPRANATIONAL', 'COUNTRY', 'STATE', 'COUNTY', 'CITY', 'DISTRICT');

-- CreateEnum
CREATE TYPE "TaxKind" AS ENUM ('VAT', 'GST', 'SALES', 'USE', 'LEVY', 'EXCISE', 'WITHHOLDING', 'PAYROLL', 'INCOME', 'OTHER');

-- CreateEnum
CREATE TYPE "TaxTreatment" AS ENUM ('STANDARD', 'REDUCED', 'ZERO_RATED', 'EXEMPT', 'REVERSE_CHARGE', 'OUT_OF_SCOPE');

-- CreateEnum
CREATE TYPE "TaxRegistrationStatus" AS ENUM ('NOT_REGISTERED', 'MONITORING', 'REGISTERED', 'DEREGISTERED');

-- CreateEnum
CREATE TYPE "TaxFilingFrequency" AS ENUM ('MONTHLY', 'QUARTERLY', 'SEMI_ANNUAL', 'ANNUAL');

-- CreateEnum
CREATE TYPE "TaxExemptionType" AS ENUM ('RESALE', 'GOVERNMENT', 'NON_PROFIT', 'DIPLOMATIC', 'EXPORT', 'OTHER');

-- CreateEnum
CREATE TYPE "TaxDocumentType" AS ENUM ('INVOICE', 'BILL', 'CREDIT_NOTE');

-- AlterTable
ALTER TABLE "AccountingInvoice" ADD COLUMN     "taxAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
ADD COLUMN     "taxRuleId" TEXT,
ADD COLUMN     "taxTreatment" "TaxTreatment";

-- AlterTable
ALTER TABLE "AccountingBill" ADD COLUMN     "taxAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
ADD COLUMN     "taxRuleId" TEXT,
ADD COLUMN     "taxTreatment" "TaxTreatment";

-- CreateTable
CREATE TABLE "TaxJurisdiction" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "level" "TaxJurisdictionLevel" NOT NULL,
    "countryCode" TEXT,
    "parentId" TEXT,
    "packKey" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TaxJurisdiction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaxAuthority" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "jurisdictionId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "website" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TaxAuthority_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaxCategory" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TaxCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaxRate" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "jurisdictionId" TEXT NOT NULL,
    "authorityId" TEXT,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "taxKind" "TaxKind" NOT NULL,
    "rate" DECIMAL(9,6) NOT NULL,
    "compound" BOOLEAN NOT NULL DEFAULT false,
    "recoverable" BOOLEAN NOT NULL DEFAULT true,
    "effectiveFrom" TIMESTAMP(3) NOT NULL,
    "effectiveTo" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 1,
    "supersedesId" TEXT,
    "sourceReference" TEXT,
    "outputAccountCode" TEXT,
    "inputAccountCode" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TaxRate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaxRule" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "jurisdictionId" TEXT NOT NULL,
    "categoryId" TEXT,
    "treatment" "TaxTreatment" NOT NULL DEFAULT 'STANDARD',
    "rateCodes" TEXT[],
    "effectiveFrom" TIMESTAMP(3) NOT NULL,
    "effectiveTo" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 1,
    "supersedesId" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sourceReference" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TaxRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaxRegistration" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "jurisdictionId" TEXT NOT NULL,
    "registrationNumber" TEXT,
    "status" "TaxRegistrationStatus" NOT NULL DEFAULT 'NOT_REGISTERED',
    "collectionEnabled" BOOLEAN NOT NULL DEFAULT false,
    "filingFrequency" "TaxFilingFrequency",
    "effectiveFrom" TIMESTAMP(3),
    "effectiveTo" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TaxRegistration_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaxExemption" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "jurisdictionId" TEXT,
    "exemptionType" "TaxExemptionType" NOT NULL,
    "certificateNumber" TEXT,
    "reason" TEXT,
    "validFrom" TIMESTAMP(3) NOT NULL,
    "validTo" TIMESTAMP(3),
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TaxExemption_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DocumentTaxLine" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "documentType" "TaxDocumentType" NOT NULL,
    "documentId" TEXT NOT NULL,
    "taxRateId" TEXT,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "taxKind" "TaxKind" NOT NULL,
    "jurisdictionCode" TEXT NOT NULL,
    "jurisdictionLevel" TEXT,
    "authorityName" TEXT,
    "rate" DECIMAL(9,6) NOT NULL,
    "compound" BOOLEAN NOT NULL DEFAULT false,
    "recoverable" BOOLEAN NOT NULL DEFAULT true,
    "treatment" "TaxTreatment" NOT NULL,
    "taxableAmount" DECIMAL(14,2) NOT NULL,
    "taxAmount" DECIMAL(14,2) NOT NULL,
    "selfAssessedAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "outputAccountCode" TEXT,
    "inputAccountCode" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DocumentTaxLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaxLedgerEntry" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "direction" "AccountingTaxDirection" NOT NULL,
    "sourceType" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "documentNumber" TEXT,
    "counterparty" TEXT,
    "contactId" TEXT,
    "transactionDate" TIMESTAMP(3) NOT NULL,
    "jurisdictionCode" TEXT NOT NULL,
    "jurisdictionLevel" TEXT,
    "authorityName" TEXT,
    "taxKind" "TaxKind" NOT NULL,
    "rateCode" TEXT NOT NULL,
    "rate" DECIMAL(9,6) NOT NULL,
    "treatment" "TaxTreatment" NOT NULL,
    "taxableAmount" DECIMAL(14,2) NOT NULL,
    "taxAmount" DECIMAL(14,2) NOT NULL,
    "selfAssessedAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "customerExempt" BOOLEAN NOT NULL DEFAULT false,
    "currency" TEXT,
    "exchangeRate" DECIMAL(20,10),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TaxLedgerEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TaxJurisdiction_organizationId_level_idx" ON "TaxJurisdiction"("organizationId", "level");

-- CreateIndex
CREATE UNIQUE INDEX "TaxJurisdiction_organizationId_code_key" ON "TaxJurisdiction"("organizationId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "TaxAuthority_organizationId_code_key" ON "TaxAuthority"("organizationId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "TaxCategory_organizationId_code_key" ON "TaxCategory"("organizationId", "code");

-- CreateIndex
CREATE INDEX "TaxRate_organizationId_code_effectiveFrom_idx" ON "TaxRate"("organizationId", "code", "effectiveFrom");

-- CreateIndex
CREATE UNIQUE INDEX "TaxRate_organizationId_code_version_key" ON "TaxRate"("organizationId", "code", "version");

-- CreateIndex
CREATE INDEX "TaxRule_organizationId_active_effectiveFrom_idx" ON "TaxRule"("organizationId", "active", "effectiveFrom");

-- CreateIndex
CREATE UNIQUE INDEX "TaxRule_organizationId_code_version_key" ON "TaxRule"("organizationId", "code", "version");

-- CreateIndex
CREATE UNIQUE INDEX "TaxRegistration_organizationId_jurisdictionId_key" ON "TaxRegistration"("organizationId", "jurisdictionId");

-- CreateIndex
CREATE INDEX "TaxExemption_organizationId_contactId_idx" ON "TaxExemption"("organizationId", "contactId");

-- CreateIndex
CREATE INDEX "DocumentTaxLine_organizationId_documentType_documentId_idx" ON "DocumentTaxLine"("organizationId", "documentType", "documentId");

-- CreateIndex
CREATE INDEX "TaxLedgerEntry_organizationId_transactionDate_idx" ON "TaxLedgerEntry"("organizationId", "transactionDate");

-- CreateIndex
CREATE INDEX "TaxLedgerEntry_organizationId_jurisdictionCode_transactionD_idx" ON "TaxLedgerEntry"("organizationId", "jurisdictionCode", "transactionDate");

-- CreateIndex
CREATE INDEX "TaxLedgerEntry_organizationId_sourceType_sourceId_idx" ON "TaxLedgerEntry"("organizationId", "sourceType", "sourceId");

-- AddForeignKey
ALTER TABLE "TaxJurisdiction" ADD CONSTRAINT "TaxJurisdiction_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaxJurisdiction" ADD CONSTRAINT "TaxJurisdiction_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "TaxJurisdiction"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaxAuthority" ADD CONSTRAINT "TaxAuthority_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaxAuthority" ADD CONSTRAINT "TaxAuthority_jurisdictionId_fkey" FOREIGN KEY ("jurisdictionId") REFERENCES "TaxJurisdiction"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaxCategory" ADD CONSTRAINT "TaxCategory_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaxRate" ADD CONSTRAINT "TaxRate_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaxRate" ADD CONSTRAINT "TaxRate_jurisdictionId_fkey" FOREIGN KEY ("jurisdictionId") REFERENCES "TaxJurisdiction"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaxRate" ADD CONSTRAINT "TaxRate_authorityId_fkey" FOREIGN KEY ("authorityId") REFERENCES "TaxAuthority"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaxRate" ADD CONSTRAINT "TaxRate_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaxRule" ADD CONSTRAINT "TaxRule_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaxRule" ADD CONSTRAINT "TaxRule_jurisdictionId_fkey" FOREIGN KEY ("jurisdictionId") REFERENCES "TaxJurisdiction"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaxRule" ADD CONSTRAINT "TaxRule_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "TaxCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaxRule" ADD CONSTRAINT "TaxRule_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaxRegistration" ADD CONSTRAINT "TaxRegistration_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaxRegistration" ADD CONSTRAINT "TaxRegistration_jurisdictionId_fkey" FOREIGN KEY ("jurisdictionId") REFERENCES "TaxJurisdiction"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaxExemption" ADD CONSTRAINT "TaxExemption_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaxExemption" ADD CONSTRAINT "TaxExemption_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "AccountingContact"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaxExemption" ADD CONSTRAINT "TaxExemption_jurisdictionId_fkey" FOREIGN KEY ("jurisdictionId") REFERENCES "TaxJurisdiction"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentTaxLine" ADD CONSTRAINT "DocumentTaxLine_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaxLedgerEntry" ADD CONSTRAINT "TaxLedgerEntry_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Integrity guards.
ALTER TABLE "TaxRate" ADD CONSTRAINT "TaxRate_rate_range_check" CHECK ("rate" >= 0 AND "rate" <= 100);
ALTER TABLE "TaxRate" ADD CONSTRAINT "TaxRate_effective_range_check" CHECK ("effectiveTo" IS NULL OR "effectiveTo" >= "effectiveFrom");
ALTER TABLE "TaxRule" ADD CONSTRAINT "TaxRule_effective_range_check" CHECK ("effectiveTo" IS NULL OR "effectiveTo" >= "effectiveFrom");
ALTER TABLE "TaxRate" ADD CONSTRAINT "TaxRate_version_positive_check" CHECK ("version" >= 1);
ALTER TABLE "TaxRule" ADD CONSTRAINT "TaxRule_version_positive_check" CHECK ("version" >= 1);

-- Backfill the display total for existing legacy-tax documents.
UPDATE "AccountingInvoice" SET "taxAmount" = "vatAmount" + "nhilAmount" + "getfundAmount";
UPDATE "AccountingBill" SET "taxAmount" = "vatAmount" + "nhilAmount" + "getfundAmount";
