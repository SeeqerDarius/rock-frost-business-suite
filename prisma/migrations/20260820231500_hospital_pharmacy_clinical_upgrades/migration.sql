-- AlterEnum
ALTER TYPE "PharmacyDispensingStatus" ADD VALUE 'PENDING_APPROVAL';
ALTER TYPE "PharmacyDispensingStatus" ADD VALUE 'REJECTED';

-- CreateEnum
CREATE TYPE "PharmacyStockMovementType" AS ENUM ('COUNT_ADJUSTMENT', 'ADJUSTMENT', 'WRITE_OFF', 'SUPPLIER_RETURN', 'PATIENT_RETURN');

-- AlterTable
ALTER TABLE "PharmacyBatch" ADD COLUMN     "barcode" TEXT;

-- AlterTable
ALTER TABLE "PharmacyDispensing" ADD COLUMN     "makerCheckerEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "pendingLines" JSONB,
ADD COLUMN     "approvedById" TEXT,
ADD COLUMN     "approvedAt" TIMESTAMP(3),
ADD COLUMN     "rejectedById" TEXT,
ADD COLUMN     "rejectedAt" TIMESTAMP(3),
ADD COLUMN     "rejectionReason" TEXT;

-- AlterTable
ALTER TABLE "PharmacySettings" ADD COLUMN     "controlledDispenseMakerCheckerEnabled" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "HospitalSettings" ADD COLUMN     "labImagingMakerCheckerEnforced" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "HospitalLabResult" ADD COLUMN     "rejectedById" TEXT,
ADD COLUMN     "rejectedAt" TIMESTAMP(3),
ADD COLUMN     "rejectionReason" TEXT;

-- AlterTable
ALTER TABLE "HospitalImagingFinding" ADD COLUMN     "rejectedById" TEXT,
ADD COLUMN     "rejectedAt" TIMESTAMP(3),
ADD COLUMN     "rejectionReason" TEXT;

-- CreateIndex
CREATE INDEX "PharmacyBatch_organizationId_barcode_idx" ON "PharmacyBatch"("organizationId", "barcode");

-- CreateTable
CREATE TABLE "PharmacyStockMovement" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "type" "PharmacyStockMovementType" NOT NULL,
    "quantityDelta" INTEGER NOT NULL,
    "quantityBefore" INTEGER NOT NULL,
    "quantityAfter" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "reference" TEXT,
    "recordedById" TEXT NOT NULL,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PharmacyStockMovement_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PharmacyStockMovement_organizationId_recordedAt_idx" ON "PharmacyStockMovement"("organizationId", "recordedAt");

-- CreateIndex
CREATE INDEX "PharmacyStockMovement_batchId_idx" ON "PharmacyStockMovement"("batchId");

-- AddForeignKey
ALTER TABLE "PharmacyStockMovement" ADD CONSTRAINT "PharmacyStockMovement_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PharmacyStockMovement" ADD CONSTRAINT "PharmacyStockMovement_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "PharmacyBatch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
