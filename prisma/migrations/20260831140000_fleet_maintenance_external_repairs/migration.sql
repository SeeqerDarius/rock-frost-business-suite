-- AlterEnum
-- Additive only; not referenced elsewhere in this transaction, so it can
-- coexist with the other DDL below (a new enum value just can't be USED in
-- the same transaction that adds it - no DML in this migration touches
-- either new value).
ALTER TYPE "FleetMaintenanceEventType" ADD VALUE 'ESTIMATE_RECORDED';
ALTER TYPE "FleetMaintenanceEventType" ADD VALUE 'EXPENSE_CORRECTED';

-- CreateEnum
CREATE TYPE "FleetMaintenanceAttachmentKind" AS ENUM ('FAULT_REPORT', 'ESTIMATE', 'INVOICE', 'COMPLETION_EVIDENCE');

-- AlterTable
ALTER TABLE "FleetMaintenanceAttachment" ADD COLUMN "kind" "FleetMaintenanceAttachmentKind" NOT NULL DEFAULT 'FAULT_REPORT';

-- AlterTable
ALTER TABLE "FleetMaintenanceRequest" ADD COLUMN "estimatedCost" DECIMAL(12,2);
ALTER TABLE "FleetMaintenanceRequest" ADD COLUMN "estimateNote" TEXT;
ALTER TABLE "FleetMaintenanceRequest" ADD COLUMN "invoiceReference" TEXT;

-- AlterTable
ALTER TABLE "FleetPayment" ADD COLUMN "maintenanceRequestId" TEXT;

-- CreateIndex
CREATE INDEX "FleetPayment_maintenanceRequestId_idx" ON "FleetPayment"("maintenanceRequestId");

-- AddForeignKey
ALTER TABLE "FleetPayment" ADD CONSTRAINT "FleetPayment_maintenanceRequestId_fkey" FOREIGN KEY ("maintenanceRequestId") REFERENCES "FleetMaintenanceRequest"("id") ON DELETE SET NULL ON UPDATE CASCADE;
