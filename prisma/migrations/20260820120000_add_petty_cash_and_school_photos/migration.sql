-- CreateEnum
CREATE TYPE "AccountingPettyCashFundStatus" AS ENUM ('ACTIVE', 'CLOSED');

-- CreateEnum
CREATE TYPE "AccountingPettyCashTransactionType" AS ENUM ('FUNDING', 'EXPENSE', 'REPLENISHMENT');

-- CreateTable
-- Imprest-system petty cash: a dedicated AccountingAccount (liquidityType
-- CASH) backs the fund, so its balance is always derived from the same
-- journal-line ledger as every other account rather than tracked
-- separately.
CREATE TABLE "AccountingPettyCashFund" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "custodianName" TEXT NOT NULL,
    "floatAmount" DECIMAL(12,2) NOT NULL,
    "status" "AccountingPettyCashFundStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedAt" TIMESTAMP(3),

    CONSTRAINT "AccountingPettyCashFund_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AccountingPettyCashTransaction" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "fundId" TEXT NOT NULL,
    "type" "AccountingPettyCashTransactionType" NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "description" TEXT NOT NULL,
    "expenseCategoryId" TEXT,
    "journalEntryId" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AccountingPettyCashTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AccountingPettyCashFund_accountId_key" ON "AccountingPettyCashFund"("accountId");

-- CreateIndex
CREATE UNIQUE INDEX "AccountingPettyCashFund_organizationId_name_key" ON "AccountingPettyCashFund"("organizationId", "name");

-- CreateIndex
CREATE INDEX "AccountingPettyCashFund_organizationId_status_idx" ON "AccountingPettyCashFund"("organizationId", "status");

-- CreateIndex
CREATE INDEX "AccountingPettyCashTransaction_organizationId_fundId_idx" ON "AccountingPettyCashTransaction"("organizationId", "fundId");

-- CreateIndex
CREATE INDEX "AccountingPettyCashTransaction_fundId_createdAt_idx" ON "AccountingPettyCashTransaction"("fundId", "createdAt");

-- AddForeignKey
ALTER TABLE "AccountingPettyCashFund" ADD CONSTRAINT "AccountingPettyCashFund_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountingPettyCashFund" ADD CONSTRAINT "AccountingPettyCashFund_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "AccountingAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountingPettyCashFund" ADD CONSTRAINT "AccountingPettyCashFund_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountingPettyCashTransaction" ADD CONSTRAINT "AccountingPettyCashTransaction_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountingPettyCashTransaction" ADD CONSTRAINT "AccountingPettyCashTransaction_fundId_fkey" FOREIGN KEY ("fundId") REFERENCES "AccountingPettyCashFund"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountingPettyCashTransaction" ADD CONSTRAINT "AccountingPettyCashTransaction_expenseCategoryId_fkey" FOREIGN KEY ("expenseCategoryId") REFERENCES "AccountingExpenseCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountingPettyCashTransaction" ADD CONSTRAINT "AccountingPettyCashTransaction_journalEntryId_fkey" FOREIGN KEY ("journalEntryId") REFERENCES "AccountingJournalEntry"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountingPettyCashTransaction" ADD CONSTRAINT "AccountingPettyCashTransaction_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AlterTable
-- Passport/profile photo, stored the same way as InventoryItem.imageData
-- (base64 data URL in a nullable Text column, served through an
-- authenticated streaming API route rather than a public file).
ALTER TABLE "SchoolStudent" ADD COLUMN "photoData" TEXT;

-- AlterTable
ALTER TABLE "SchoolGuardian" ADD COLUMN "photoData" TEXT;
