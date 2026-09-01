-- CreateEnum
CREATE TYPE "AccountingRecurringType" AS ENUM ('JOURNAL_ENTRY', 'INVOICE', 'BILL');

-- CreateEnum
CREATE TYPE "AccountingRecurringFrequency" AS ENUM ('WEEKLY', 'MONTHLY', 'QUARTERLY', 'YEARLY');

-- CreateTable
CREATE TABLE "AccountingRecurringTemplate" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "type" "AccountingRecurringType" NOT NULL,
    "name" TEXT NOT NULL,
    "frequency" "AccountingRecurringFrequency" NOT NULL,
    "nextRunDate" TIMESTAMP(3) NOT NULL,
    "payload" JSONB NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "lastGeneratedAt" TIMESTAMP(3),
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AccountingRecurringTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AccountingRecurringTemplate_organizationId_active_nextRun_idx" ON "AccountingRecurringTemplate"("organizationId", "active", "nextRunDate");

-- AddForeignKey
ALTER TABLE "AccountingRecurringTemplate" ADD CONSTRAINT "AccountingRecurringTemplate_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
