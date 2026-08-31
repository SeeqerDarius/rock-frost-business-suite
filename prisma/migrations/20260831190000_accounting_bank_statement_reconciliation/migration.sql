-- CreateEnum
CREATE TYPE "AccountingBankStatementLineStatus" AS ENUM ('UNMATCHED', 'MATCHED', 'IGNORED');

-- CreateTable
CREATE TABLE "AccountingBankStatementLine" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "reconciliationId" TEXT NOT NULL,
    "sequenceInFile" INTEGER NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "description" TEXT NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "status" "AccountingBankStatementLineStatus" NOT NULL DEFAULT 'UNMATCHED',
    "matchedJournalLineId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AccountingBankStatementLine_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AccountingBankStatementLine_matchedJournalLineId_key" ON "AccountingBankStatementLine"("matchedJournalLineId");

-- CreateIndex
CREATE INDEX "AccountingBankStatementLine_organizationId_reconciliationI_idx" ON "AccountingBankStatementLine"("organizationId", "reconciliationId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "AccountingBankStatementLine_reconciliationId_sequenceInFi_key" ON "AccountingBankStatementLine"("reconciliationId", "sequenceInFile");

-- AddForeignKey
ALTER TABLE "AccountingBankStatementLine" ADD CONSTRAINT "AccountingBankStatementLine_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountingBankStatementLine" ADD CONSTRAINT "AccountingBankStatementLine_reconciliationId_fkey" FOREIGN KEY ("reconciliationId") REFERENCES "AccountingReconciliation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountingBankStatementLine" ADD CONSTRAINT "AccountingBankStatementLine_matchedJournalLineId_fkey" FOREIGN KEY ("matchedJournalLineId") REFERENCES "AccountingJournalLine"("id") ON DELETE SET NULL ON UPDATE CASCADE;
