-- CreateEnum
CREATE TYPE "FleetPaymentPostingStatus" AS ENUM ('PENDING', 'POSTED', 'FAILED');

-- AlterTable
ALTER TABLE "FleetPayment" ADD COLUMN "receiptNumber" TEXT;
ALTER TABLE "FleetPayment" ADD COLUMN "postingStatus" "FleetPaymentPostingStatus" NOT NULL DEFAULT 'PENDING';

-- CreateIndex
CREATE INDEX "FleetPayment_organizationId_postingStatus_idx" ON "FleetPayment"("organizationId", "postingStatus");
