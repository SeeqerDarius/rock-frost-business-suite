-- CreateTable
CREATE TABLE "ModulePricingPlan" (
    "id" TEXT NOT NULL,
    "moduleKey" TEXT NOT NULL,
    "monthlyGhs" DECIMAL(18,2) NOT NULL,
    "annualGhs" DECIMAL(18,2) NOT NULL,
    "includedSeats" INTEGER NOT NULL,
    "additionalSeatGhs" DECIMAL(18,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ModulePricingPlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PricingBundle" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "monthlyGhs" DECIMAL(18,2) NOT NULL,
    "moduleKeys" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PricingBundle_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ModulePricingPlan_moduleKey_key" ON "ModulePricingPlan"("moduleKey");

-- CreateIndex
CREATE UNIQUE INDEX "PricingBundle_key_key" ON "PricingBundle"("key");
