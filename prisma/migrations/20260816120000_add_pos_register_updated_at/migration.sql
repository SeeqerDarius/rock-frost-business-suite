-- Additive, backward-compatible: adds an @updatedAt column PosRegister was
-- missing (every other model the offline sync optimistic-concurrency
-- scheme needs already had one). Existing rows backfill to the migration's
-- execution time, matching the standard Prisma @updatedAt migration
-- pattern; Prisma sets it automatically on every subsequent update.
ALTER TABLE "PosRegister" ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
