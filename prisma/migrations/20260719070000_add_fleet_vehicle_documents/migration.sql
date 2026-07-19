-- CreateEnum
CREATE TYPE "FleetDocumentRenewalStatus" AS ENUM ('READY', 'DUE', 'CLEAR');

-- AlterTable
ALTER TABLE "FleetVehicle" ADD COLUMN     "nextServiceDueAt" TIMESTAMP(3),
ADD COLUMN     "serviceNotes" TEXT;

-- CreateTable
CREATE TABLE "FleetVehicleDocument" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "branchId" TEXT,
    "vehicleId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "policyNumber" TEXT NOT NULL,
    "insuranceExpiresAt" TIMESTAMP(3) NOT NULL,
    "roadworthyExpiresAt" TIMESTAMP(3) NOT NULL,
    "renewalStatus" "FleetDocumentRenewalStatus" NOT NULL DEFAULT 'CLEAR',
    "alerts" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FleetVehicleDocument_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "FleetVehicleDocument_organizationId_idx" ON "FleetVehicleDocument"("organizationId");

-- CreateIndex
CREATE INDEX "FleetVehicleDocument_branchId_idx" ON "FleetVehicleDocument"("branchId");

-- CreateIndex
CREATE INDEX "FleetVehicleDocument_vehicleId_idx" ON "FleetVehicleDocument"("vehicleId");

-- AddForeignKey
ALTER TABLE "FleetVehicleDocument" ADD CONSTRAINT "FleetVehicleDocument_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FleetVehicleDocument" ADD CONSTRAINT "FleetVehicleDocument_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FleetVehicleDocument" ADD CONSTRAINT "FleetVehicleDocument_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "FleetVehicle"("id") ON DELETE CASCADE ON UPDATE CASCADE;

