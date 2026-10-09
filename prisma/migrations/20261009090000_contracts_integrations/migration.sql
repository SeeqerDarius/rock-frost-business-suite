-- CreateEnum
CREATE TYPE "ContractBillingDirection" AS ENUM ('RECEIVABLE', 'PAYABLE');

-- CreateEnum
CREATE TYPE "ContractBillingStatus" AS ENUM ('PLANNED', 'INVOICED', 'CANCELLED');

-- AlterTable
ALTER TABLE "ContractSettings" ADD COLUMN     "riskValueThresholds" JSONB,
ADD COLUMN     "riskWeights" JSONB;

-- CreateTable
CREATE TABLE "ContractBillingLine" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "direction" "ContractBillingDirection" NOT NULL,
    "dueDate" TIMESTAMP(3) NOT NULL,
    "amount" DECIMAL(16,2) NOT NULL,
    "currency" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "status" "ContractBillingStatus" NOT NULL DEFAULT 'PLANNED',
    "invoiceId" TEXT,
    "billId" TEXT,
    "linkedAt" TIMESTAMP(3),
    "linkedById" TEXT,
    "cancelledAt" TIMESTAMP(3),
    "cancelReason" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ContractBillingLine_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ContractBillingLine_organizationId_status_dueDate_idx" ON "ContractBillingLine"("organizationId", "status", "dueDate");

-- CreateIndex
CREATE INDEX "ContractBillingLine_contractId_dueDate_idx" ON "ContractBillingLine"("contractId", "dueDate");

-- AddForeignKey
ALTER TABLE "ContractBillingLine" ADD CONSTRAINT "ContractBillingLine_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContractBillingLine" ADD CONSTRAINT "ContractBillingLine_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "Contract"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Integrity guards.
ALTER TABLE "ContractBillingLine" ADD CONSTRAINT "ContractBillingLine_amount_check" CHECK ("amount" > 0);
ALTER TABLE "ContractBillingLine" ADD CONSTRAINT "ContractBillingLine_currency_check" CHECK ("currency" ~ '^[A-Z]{3}$');
ALTER TABLE "ContractBillingLine" ADD CONSTRAINT "ContractBillingLine_document_check" CHECK (
  ("direction" = 'RECEIVABLE' AND "billId" IS NULL) OR ("direction" = 'PAYABLE' AND "invoiceId" IS NULL)
);
ALTER TABLE "ContractBillingLine" ADD CONSTRAINT "ContractBillingLine_invoiced_check" CHECK (
  "status" <> 'INVOICED' OR "invoiceId" IS NOT NULL OR "billId" IS NOT NULL
);
