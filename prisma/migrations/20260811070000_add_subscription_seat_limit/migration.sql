ALTER TABLE "Subscription" ADD COLUMN "seatLimit" INTEGER;

ALTER TABLE "Subscription"
ADD CONSTRAINT "Subscription_seatLimit_check"
CHECK ("seatLimit" IS NULL OR "seatLimit" > 0);
