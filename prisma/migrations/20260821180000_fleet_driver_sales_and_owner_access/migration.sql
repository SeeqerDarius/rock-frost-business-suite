CREATE TYPE "FleetSalesTargetPeriod" AS ENUM ('DAILY', 'WEEKLY');
CREATE TYPE "FleetDriverSubmissionType" AS ENUM ('DAILY_SALES', 'WEEKLY_SALES', 'WORK_AND_PAY');

ALTER TABLE "FleetVehicle"
  ADD COLUMN "salesTargetPeriod" "FleetSalesTargetPeriod",
  ADD COLUMN "salesTargetAmount" DECIMAL(12,2);

ALTER TABLE "FleetVehicle"
  ADD CONSTRAINT "FleetVehicle_sales_target_complete_check"
  CHECK (
    ("salesTargetPeriod" IS NULL AND "salesTargetAmount" IS NULL)
    OR
    ("salesTargetPeriod" IS NOT NULL AND "salesTargetAmount" > 0)
  );

ALTER TABLE "FleetDriverPaymentSubmission"
  ADD COLUMN "submissionType" "FleetDriverSubmissionType" NOT NULL DEFAULT 'WEEKLY_SALES',
  ADD COLUMN "periodStart" TIMESTAMP(3),
  ADD COLUMN "periodEnd" TIMESTAMP(3),
  ADD COLUMN "expectedAmount" DECIMAL(12,2);

UPDATE "FleetDriverPaymentSubmission"
SET
  "submissionType" = CASE
    WHEN "contractId" IS NOT NULL THEN 'WORK_AND_PAY'::"FleetDriverSubmissionType"
    ELSE 'WEEKLY_SALES'::"FleetDriverSubmissionType"
  END,
  "periodStart" = "paymentDate",
  "periodEnd" = "paymentDate",
  "expectedAmount" = CASE
    WHEN "contractId" IS NOT NULL THEN (
      SELECT contract."weeklyPaymentAmount"
      FROM "FleetWorkAndPayContract" contract
      WHERE contract."id" = "FleetDriverPaymentSubmission"."contractId"
    )
    ELSE (
      SELECT vehicle."salesTargetAmount"
      FROM "FleetVehicle" vehicle
      WHERE vehicle."id" = "FleetDriverPaymentSubmission"."vehicleId"
    )
  END;

ALTER TABLE "FleetDriverPaymentSubmission"
  ALTER COLUMN "periodStart" SET NOT NULL,
  ALTER COLUMN "periodEnd" SET NOT NULL,
  ADD CONSTRAINT "FleetDriverPaymentSubmission_period_check" CHECK ("periodEnd" >= "periodStart"),
  ADD CONSTRAINT "FleetDriverPaymentSubmission_vehicle_fkey"
    FOREIGN KEY ("vehicleId") REFERENCES "FleetVehicle"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "FleetDriverPaymentSubmission_contract_fkey"
    FOREIGN KEY ("contractId") REFERENCES "FleetWorkAndPayContract"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "FleetDriverPaymentSubmission_org_vehicle_type_period_idx"
  ON "FleetDriverPaymentSubmission"("organizationId", "vehicleId", "submissionType", "periodStart");

CREATE UNIQUE INDEX "FleetDriverPaymentSubmission_active_period_key"
  ON "FleetDriverPaymentSubmission"(
    "organizationId", "driverId", "vehicleId", "submissionType", "periodStart", "periodEnd"
  )
  WHERE "status" IN ('PENDING', 'APPROVED');

CREATE TABLE "FleetVehicleOwnershipHistory" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "vehicleId" TEXT NOT NULL,
  "previousOwnerId" TEXT,
  "previousOwnerName" TEXT,
  "newOwnerId" TEXT,
  "newOwnerName" TEXT,
  "changedById" TEXT,
  "changedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "FleetVehicleOwnershipHistory_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "FleetVehicleOwnershipHistory_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "FleetVehicleOwnershipHistory_vehicleId_fkey"
    FOREIGN KEY ("vehicleId") REFERENCES "FleetVehicle"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "FleetVehicleOwnershipHistory_organizationId_changedAt_idx"
  ON "FleetVehicleOwnershipHistory"("organizationId", "changedAt");
CREATE INDEX "FleetVehicleOwnershipHistory_vehicleId_changedAt_idx"
  ON "FleetVehicleOwnershipHistory"("vehicleId", "changedAt");
CREATE INDEX "FleetVehicleOwnershipHistory_newOwnerId_idx"
  ON "FleetVehicleOwnershipHistory"("newOwnerId");

DELETE FROM "RolePermission" rp
USING "Role" r, "Permission" p
WHERE rp."roleId" = r."id"
  AND rp."permissionId" = p."id"
  AND r."organizationId" IS NULL
  AND r."isSystem" = TRUE
  AND r."name" = 'Driver'
  AND p."key" = 'fleet.view';
