-- CreateEnum
CREATE TYPE "FleetMechanicStatus" AS ENUM ('ACTIVE', 'INACTIVE');

-- AlterEnum
-- Additive only; not referenced elsewhere in this transaction, so it can
-- coexist with the CREATE TABLE statements below (a new enum value just
-- can't be USED in the same transaction that adds it).
ALTER TYPE "FleetMaintenanceEventType" ADD VALUE 'REPAIR_SCHEDULED';

-- AlterTable
ALTER TABLE "FleetMaintenanceRequest" ADD COLUMN "mechanicId" TEXT;
ALTER TABLE "FleetMaintenanceRequest" ADD COLUMN "scheduledRepairAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "FleetMechanic" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "branchId" TEXT,
    "userId" TEXT,
    "name" TEXT NOT NULL,
    "businessName" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "location" TEXT,
    "specialty" TEXT,
    "status" "FleetMechanicStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FleetMechanic_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FleetMaintenanceAttachment" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "fileAssetId" TEXT NOT NULL,
    "uploadedById" TEXT,
    "caption" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FleetMaintenanceAttachment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "FleetMechanic_organizationId_userId_key" ON "FleetMechanic"("organizationId", "userId");

-- CreateIndex
CREATE INDEX "FleetMechanic_organizationId_idx" ON "FleetMechanic"("organizationId");

-- CreateIndex
CREATE INDEX "FleetMechanic_branchId_idx" ON "FleetMechanic"("branchId");

-- CreateIndex
CREATE INDEX "FleetMaintenanceAttachment_organizationId_idx" ON "FleetMaintenanceAttachment"("organizationId");

-- CreateIndex
CREATE INDEX "FleetMaintenanceAttachment_requestId_idx" ON "FleetMaintenanceAttachment"("requestId");

-- CreateIndex
CREATE INDEX "FleetMaintenanceRequest_mechanicId_idx" ON "FleetMaintenanceRequest"("mechanicId");

-- AddForeignKey
ALTER TABLE "FleetMechanic" ADD CONSTRAINT "FleetMechanic_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FleetMechanic" ADD CONSTRAINT "FleetMechanic_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FleetMechanic" ADD CONSTRAINT "FleetMechanic_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FleetMaintenanceAttachment" ADD CONSTRAINT "FleetMaintenanceAttachment_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FleetMaintenanceAttachment" ADD CONSTRAINT "FleetMaintenanceAttachment_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "FleetMaintenanceRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FleetMaintenanceAttachment" ADD CONSTRAINT "FleetMaintenanceAttachment_fileAssetId_fkey" FOREIGN KEY ("fileAssetId") REFERENCES "FileAsset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FleetMaintenanceAttachment" ADD CONSTRAINT "FleetMaintenanceAttachment_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FleetMaintenanceRequest" ADD CONSTRAINT "FleetMaintenanceRequest_mechanicId_fkey" FOREIGN KEY ("mechanicId") REFERENCES "FleetMechanic"("id") ON DELETE SET NULL ON UPDATE CASCADE;
