-- Complete the property-level Hotel settings used by operational workflows.
ALTER TABLE "HotelSettings"
  ADD COLUMN "reservationPrefix" TEXT NOT NULL DEFAULT 'RSV',
  ADD COLUMN "folioPrefix" TEXT NOT NULL DEFAULT 'FOL',
  ADD COLUMN "receiptPrefix" TEXT NOT NULL DEFAULT 'HRC',
  ADD COLUMN "orderPrefix" TEXT NOT NULL DEFAULT 'ORD',
  ADD COLUMN "autoCreateCheckoutTask" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "housekeepingDueHours" INTEGER NOT NULL DEFAULT 4,
  ADD COLUMN "requireHousekeepingInspection" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "HotelSettings"
  ADD CONSTRAINT "HotelSettings_housekeepingDueHours_check"
  CHECK ("housekeepingDueHours" >= 1 AND "housekeepingDueHours" <= 168);
