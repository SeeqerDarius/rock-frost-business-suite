CREATE TYPE "PromotionTargetType" AS ENUM ('MODULE', 'BUNDLE');
CREATE TYPE "PromotionBillingCycle" AS ENUM ('MONTHLY', 'ANNUAL');

CREATE TABLE "PricingPromotion" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "targetType" "PromotionTargetType" NOT NULL,
    "targetKey" TEXT NOT NULL,
    "billingCycle" "PromotionBillingCycle" NOT NULL,
    "amountGhs" DECIMAL(18,2) NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "PricingPromotion_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "PricingPromotion_amountGhs_check" CHECK ("amountGhs" > 0),
    CONSTRAINT "PricingPromotion_window_check" CHECK ("endsAt" > "startsAt")
);

CREATE INDEX "PricingPromotion_targetType_targetKey_billingCycle_active_startsAt_endsAt_idx"
ON "PricingPromotion"("targetType", "targetKey", "billingCycle", "active", "startsAt", "endsAt");
