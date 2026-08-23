CREATE TYPE "AccountingTaxTreatment" AS ENUM ('STANDARD', 'ZERO_RATED', 'EXEMPT', 'RELIEVED', 'OUT_OF_SCOPE');
CREATE TYPE "AccountingTaxDirection" AS ENUM ('OUTPUT', 'INPUT', 'ADJUSTMENT');
CREATE TYPE "AccountingTaxPeriodStatus" AS ENUM ('OPEN', 'LOCKED', 'FILED');

ALTER TABLE "AccountingInvoice"
  ADD COLUMN "taxableAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN "vatAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN "nhilAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN "getfundAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN "taxCodeId" TEXT;

UPDATE "AccountingInvoice" SET "taxableAmount" = "amount";

ALTER TABLE "ProcurementSupplierInvoice"
  ADD COLUMN "taxableAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN "vatAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN "nhilAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN "getfundAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN "taxCodeId" TEXT;

UPDATE "ProcurementSupplierInvoice" SET "taxableAmount" = "totalAmount";

CREATE TABLE "AccountingTaxCode" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "jurisdiction" TEXT NOT NULL,
  "treatment" "AccountingTaxTreatment" NOT NULL,
  "vatRate" DECIMAL(7,4) NOT NULL DEFAULT 0,
  "nhilRate" DECIMAL(7,4) NOT NULL DEFAULT 0,
  "getfundRate" DECIMAL(7,4) NOT NULL DEFAULT 0,
  "effectiveFrom" TIMESTAMP(3) NOT NULL,
  "effectiveTo" TIMESTAMP(3),
  "active" BOOLEAN NOT NULL DEFAULT true,
  "isSystem" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AccountingTaxCode_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AccountingTaxTransaction" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "taxCodeId" TEXT,
  "direction" "AccountingTaxDirection" NOT NULL,
  "transactionDate" TIMESTAMP(3) NOT NULL,
  "sourceType" TEXT NOT NULL,
  "sourceId" TEXT NOT NULL,
  "documentNumber" TEXT,
  "counterparty" TEXT,
  "taxableAmount" DECIMAL(14,2) NOT NULL,
  "vatAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "nhilAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "getfundAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AccountingTaxTransaction_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AccountingTaxPeriod" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "startDate" TIMESTAMP(3) NOT NULL,
  "endDate" TIMESTAMP(3) NOT NULL,
  "filingDueDate" TIMESTAMP(3) NOT NULL,
  "jurisdiction" TEXT NOT NULL,
  "status" "AccountingTaxPeriodStatus" NOT NULL DEFAULT 'OPEN',
  "lockedAt" TIMESTAMP(3),
  "filedAt" TIMESTAMP(3),
  "filingReference" TEXT,
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AccountingTaxPeriod_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AccountingTaxCode_organizationId_code_effectiveFrom_key" ON "AccountingTaxCode"("organizationId", "code", "effectiveFrom");
CREATE INDEX "AccountingTaxCode_organizationId_active_effectiveFrom_idx" ON "AccountingTaxCode"("organizationId", "active", "effectiveFrom");
CREATE UNIQUE INDEX "AccountingTaxTransaction_organizationId_sourceType_sourceId_direction_key" ON "AccountingTaxTransaction"("organizationId", "sourceType", "sourceId", "direction");
CREATE INDEX "AccountingTaxTransaction_organizationId_transactionDate_direction_idx" ON "AccountingTaxTransaction"("organizationId", "transactionDate", "direction");
CREATE INDEX "AccountingTaxTransaction_taxCodeId_idx" ON "AccountingTaxTransaction"("taxCodeId");
CREATE UNIQUE INDEX "AccountingTaxPeriod_organizationId_startDate_endDate_jurisdiction_key" ON "AccountingTaxPeriod"("organizationId", "startDate", "endDate", "jurisdiction");
CREATE INDEX "AccountingTaxPeriod_organizationId_status_startDate_idx" ON "AccountingTaxPeriod"("organizationId", "status", "startDate");
CREATE INDEX "AccountingInvoice_taxCodeId_idx" ON "AccountingInvoice"("taxCodeId");
CREATE INDEX "ProcurementSupplierInvoice_taxCodeId_idx" ON "ProcurementSupplierInvoice"("taxCodeId");

ALTER TABLE "AccountingTaxCode" ADD CONSTRAINT "AccountingTaxCode_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AccountingTaxTransaction" ADD CONSTRAINT "AccountingTaxTransaction_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AccountingTaxTransaction" ADD CONSTRAINT "AccountingTaxTransaction_taxCodeId_fkey" FOREIGN KEY ("taxCodeId") REFERENCES "AccountingTaxCode"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AccountingTaxPeriod" ADD CONSTRAINT "AccountingTaxPeriod_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AccountingInvoice" ADD CONSTRAINT "AccountingInvoice_taxCodeId_fkey" FOREIGN KEY ("taxCodeId") REFERENCES "AccountingTaxCode"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ProcurementSupplierInvoice" ADD CONSTRAINT "ProcurementSupplierInvoice_taxCodeId_fkey" FOREIGN KEY ("taxCodeId") REFERENCES "AccountingTaxCode"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
