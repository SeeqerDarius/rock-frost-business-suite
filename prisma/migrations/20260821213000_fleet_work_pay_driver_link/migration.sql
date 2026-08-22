ALTER TABLE "FleetWorkAndPayContract"
ADD COLUMN "driverId" TEXT;

UPDATE "FleetWorkAndPayContract" AS contract
SET "driverId" = vehicle."assignedDriverId"
FROM "FleetVehicle" AS vehicle
JOIN "FleetDriver" AS driver
  ON driver."id" = vehicle."assignedDriverId"
  AND driver."organizationId" = vehicle."organizationId"
WHERE contract."vehicleId" = vehicle."id"
  AND contract."organizationId" = vehicle."organizationId";

CREATE INDEX "FleetWorkAndPayContract_driverId_idx"
ON "FleetWorkAndPayContract"("driverId");

ALTER TABLE "FleetWorkAndPayContract"
ADD CONSTRAINT "FleetWorkAndPayContract_driverId_fkey"
FOREIGN KEY ("driverId") REFERENCES "FleetDriver"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
