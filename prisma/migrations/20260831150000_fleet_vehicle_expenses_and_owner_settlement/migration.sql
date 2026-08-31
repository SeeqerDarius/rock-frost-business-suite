-- CreateEnum
CREATE TYPE "FleetVehicleExpenseType" AS ENUM ('FUEL', 'FINE', 'INSURANCE_PREMIUM', 'LICENSING', 'OTHER');

-- CreateTable
CREATE TABLE "FleetVehicleExpense" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "branchId" TEXT,
    "vehicleId" TEXT NOT NULL,
    "type" "FleetVehicleExpenseType" NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "note" TEXT,
    "receiptFileAssetId" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FleetVehicleExpense_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FleetOwnerAgreement" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "vehicleId" TEXT,
    "revenueSharePercent" DECIMAL(5,2),
    "managementFeeFlat" DECIMAL(12,2),
    "managementFeePercent" DECIMAL(5,2),
    "effectiveFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "effectiveTo" TIMESTAMP(3),
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FleetOwnerAgreement_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "FleetVehicleExpense_organizationId_date_idx" ON "FleetVehicleExpense"("organizationId", "date");

-- CreateIndex
CREATE INDEX "FleetVehicleExpense_branchId_idx" ON "FleetVehicleExpense"("branchId");

-- CreateIndex
CREATE INDEX "FleetVehicleExpense_vehicleId_idx" ON "FleetVehicleExpense"("vehicleId");

-- CreateIndex
CREATE INDEX "FleetVehicleExpense_receiptFileAssetId_idx" ON "FleetVehicleExpense"("receiptFileAssetId");

-- CreateIndex
CREATE INDEX "FleetOwnerAgreement_organizationId_idx" ON "FleetOwnerAgreement"("organizationId");

-- CreateIndex
CREATE INDEX "FleetOwnerAgreement_ownerId_effectiveFrom_idx" ON "FleetOwnerAgreement"("ownerId", "effectiveFrom");

-- CreateIndex
CREATE INDEX "FleetOwnerAgreement_vehicleId_idx" ON "FleetOwnerAgreement"("vehicleId");

-- AddForeignKey
ALTER TABLE "FleetVehicleExpense" ADD CONSTRAINT "FleetVehicleExpense_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FleetVehicleExpense" ADD CONSTRAINT "FleetVehicleExpense_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FleetVehicleExpense" ADD CONSTRAINT "FleetVehicleExpense_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "FleetVehicle"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FleetVehicleExpense" ADD CONSTRAINT "FleetVehicleExpense_receiptFileAssetId_fkey" FOREIGN KEY ("receiptFileAssetId") REFERENCES "FileAsset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FleetVehicleExpense" ADD CONSTRAINT "FleetVehicleExpense_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FleetOwnerAgreement" ADD CONSTRAINT "FleetOwnerAgreement_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FleetOwnerAgreement" ADD CONSTRAINT "FleetOwnerAgreement_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "FleetOwner"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FleetOwnerAgreement" ADD CONSTRAINT "FleetOwnerAgreement_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "FleetVehicle"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FleetOwnerAgreement" ADD CONSTRAINT "FleetOwnerAgreement_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
