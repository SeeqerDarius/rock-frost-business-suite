-- Plan tiers: Basic / Pro / Platinum / Enterprise, per module subscription.
--
-- Hand-written rather than `prisma migrate dev`-generated for the same reason
-- the two migrations before it were: an auto-diff against this schema also
-- surfaces substantial pre-existing, unrelated drift (renamed indexes and
-- constraints, a few `updatedAt` default changes across Accounting/Fleet/HR)
-- that is not this change's to fix. This file contains only its own objects.

CREATE TYPE "PlanTier" AS ENUM ('BASIC', 'PRO', 'PLATINUM', 'ENTERPRISE');

-- New agreements default to BASIC: over-granting silently is worse than
-- making an operator choose.
ALTER TABLE "Subscription" ADD COLUMN "tier" "PlanTier" NOT NULL DEFAULT 'BASIC';

-- THE GRANDFATHERING STEP. Every row that existed before this migration
-- describes a customer who bought unrestricted access, because tiers did not
-- exist when they bought it. Leaving them on the BASIC default would silently
-- withdraw features they are using and paying for today. PLATINUM is the top
-- non-negotiated tier, so this preserves exactly what they have.
--
-- This runs once, against rows that predate the column. Rows created after
-- this migration keep the BASIC default until an operator sets a tier, so
-- tiers only ever restrict an agreement created from here on.
UPDATE "Subscription" SET "tier" = 'PLATINUM';

-- Per-tier pricing. ModulePricingPlan keeps its single headline price (read by
-- every existing quote, checkout, and public price), and this table adds the
-- other rungs beside it. Seeded idempotently by prisma/seed-data.ts.
CREATE TABLE "ModuleTierPrice" (
    "id" TEXT NOT NULL,
    "moduleKey" TEXT NOT NULL,
    "tier" "PlanTier" NOT NULL,
    "monthlyGhs" DECIMAL(18,2) NOT NULL,
    "annualGhs" DECIMAL(18,2) NOT NULL,
    "includedSeats" INTEGER NOT NULL,
    "additionalSeatGhs" DECIMAL(18,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ModuleTierPrice_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ModuleTierPrice_moduleKey_tier_key" ON "ModuleTierPrice"("moduleKey", "tier");
CREATE INDEX "ModuleTierPrice_moduleKey_idx" ON "ModuleTierPrice"("moduleKey");
