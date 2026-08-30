-- AlterEnum
-- Additive only; none of these values are used elsewhere in this
-- transaction (a new enum value can't be USED in the same transaction that
-- adds it - only the separate backfill migration references them).
ALTER TYPE "FleetMaintenanceProgressStatus" ADD VALUE 'AWAITING_OWNER_APPROVAL';
ALTER TYPE "FleetMaintenanceProgressStatus" ADD VALUE 'ASSIGNED';
ALTER TYPE "FleetMaintenanceProgressStatus" ADD VALUE 'SCHEDULED';
ALTER TYPE "FleetMaintenanceProgressStatus" ADD VALUE 'ON_HOLD';
ALTER TYPE "FleetMaintenanceProgressStatus" ADD VALUE 'VERIFIED';
ALTER TYPE "FleetMaintenanceProgressStatus" ADD VALUE 'REJECTED';

-- AlterEnum
ALTER TYPE "FleetMaintenanceEventType" ADD VALUE 'REPAIR_HELD';
ALTER TYPE "FleetMaintenanceEventType" ADD VALUE 'REPAIR_RESUMED';
ALTER TYPE "FleetMaintenanceEventType" ADD VALUE 'REPAIR_WITHDRAWN';
