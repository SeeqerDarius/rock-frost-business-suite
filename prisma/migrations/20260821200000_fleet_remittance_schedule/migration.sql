ALTER TABLE "FleetWorkAndPayContract"
ADD COLUMN "paymentSchedule" "FleetSalesTargetPeriod" NOT NULL DEFAULT 'WEEKLY',
ADD COLUMN "scheduledPaymentAmount" DECIMAL(12,2),
ADD COLUMN "remainingPaymentPeriods" INTEGER;

UPDATE "FleetWorkAndPayContract"
SET "scheduledPaymentAmount" = "weeklyPaymentAmount"
WHERE "scheduledPaymentAmount" IS NULL;

UPDATE "FleetWorkAndPayContract"
SET "remainingPaymentPeriods" = "remainingDurationWeeks"
WHERE "remainingPaymentPeriods" IS NULL;

ALTER TABLE "FleetWorkAndPayContract"
ALTER COLUMN "scheduledPaymentAmount" SET NOT NULL,
ADD CONSTRAINT "FleetWorkAndPayContract_scheduled_payment_positive_check"
  CHECK ("scheduledPaymentAmount" > 0),
ADD CONSTRAINT "FleetWorkAndPayContract_remaining_periods_positive_check"
  CHECK ("remainingPaymentPeriods" IS NULL OR "remainingPaymentPeriods" > 0);
