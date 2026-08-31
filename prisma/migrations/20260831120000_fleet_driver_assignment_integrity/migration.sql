-- CreateTable
CREATE TABLE "FleetVehicleDriverHistory" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "vehicleId" TEXT NOT NULL,
    "previousDriverId" TEXT,
    "previousDriverName" TEXT,
    "newDriverId" TEXT,
    "newDriverName" TEXT,
    "changedById" TEXT,
    "changedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FleetVehicleDriverHistory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "FleetVehicleDriverHistory_organizationId_changedAt_idx" ON "FleetVehicleDriverHistory"("organizationId", "changedAt");

-- CreateIndex
CREATE INDEX "FleetVehicleDriverHistory_vehicleId_changedAt_idx" ON "FleetVehicleDriverHistory"("vehicleId", "changedAt");

-- CreateIndex
CREATE INDEX "FleetVehicleDriverHistory_newDriverId_idx" ON "FleetVehicleDriverHistory"("newDriverId");

-- AddForeignKey
ALTER TABLE "FleetVehicleDriverHistory" ADD CONSTRAINT "FleetVehicleDriverHistory_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FleetVehicleDriverHistory" ADD CONSTRAINT "FleetVehicleDriverHistory_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "FleetVehicle"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- One active vehicle per driver. Prisma's schema DSL has no partial-index
-- syntax, so this constraint exists only here (documented next to
-- FleetVehicle.assignedDriverId's plain index in schema.prisma) - a plain
-- (organizationId, assignedDriverId) unique index would wrongly forbid every
-- vehicle from ever having assignedDriverId = NULL more than once, so the
-- WHERE clause restricting it to non-null values is required, not cosmetic.
--
-- Verified against production with a read-only query before writing this
-- migration: zero (organizationId, assignedDriverId) pairs currently repeat
-- across vehicles (only 3 vehicles org-wide have any driver assigned at
-- all), so this index applies cleanly with no pre-existing conflict to clean
-- up first.
CREATE UNIQUE INDEX "FleetVehicle_organizationId_assignedDriverId_active_key" ON "FleetVehicle"("organizationId", "assignedDriverId") WHERE "assignedDriverId" IS NOT NULL;
