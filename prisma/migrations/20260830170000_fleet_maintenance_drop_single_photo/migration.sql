-- Pure schema cleanup: every historical single photo was already copied into
-- its own FleetMaintenanceAttachment row by the 20260830150100 backfill, so
-- no further data transformation is needed here - only every reader had to
-- be rewritten first (done in this same phase, before this migration runs).

-- DropForeignKey
ALTER TABLE "FleetMaintenanceRequest" DROP CONSTRAINT "FleetMaintenanceRequest_photoAssetId_fkey";

-- DropIndex
DROP INDEX "FleetMaintenanceRequest_photoAssetId_idx";

-- AlterTable
ALTER TABLE "FleetMaintenanceRequest" DROP COLUMN "photoAssetId";
