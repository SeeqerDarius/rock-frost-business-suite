-- Global localization foundation (additive, backward compatible).
-- Existing organizations keep their currency and an en-GH presentation
-- (locale stays NULL and is derived from the base currency).

-- CreateEnum
CREATE TYPE "AccountingBasis" AS ENUM ('ACCRUAL', 'CASH');

-- CreateEnum
CREATE TYPE "ExchangeRateSource" AS ENUM ('MANUAL', 'PROVIDER');

-- AlterTable
ALTER TABLE "Organization" ADD COLUMN     "accountingBasis" "AccountingBasis" NOT NULL DEFAULT 'ACCRUAL',
ADD COLUMN     "dateFormat" TEXT NOT NULL DEFAULT 'LOCALE',
ADD COLUMN     "fiscalYearStartMonth" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "jurisdictionCode" TEXT,
ADD COLUMN     "legalEntityType" TEXT,
ADD COLUMN     "legalName" TEXT,
ADD COLUMN     "locale" TEXT,
ADD COLUMN     "numberFormat" TEXT NOT NULL DEFAULT 'LOCALE',
ADD COLUMN     "postalCode" TEXT,
ADD COLUMN     "pricesIncludeTax" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "tradingName" TEXT,
ADD COLUMN     "vatRegistrationNumber" TEXT;

-- CreateTable
CREATE TABLE "ExchangeRate" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "fromCurrency" TEXT NOT NULL,
    "toCurrency" TEXT NOT NULL,
    "rate" DECIMAL(20,10) NOT NULL,
    "rateDate" DATE NOT NULL,
    "source" "ExchangeRateSource" NOT NULL DEFAULT 'MANUAL',
    "providerName" TEXT,
    "notes" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExchangeRate_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ExchangeRate_organizationId_fromCurrency_toCurrency_rateDat_idx" ON "ExchangeRate"("organizationId", "fromCurrency", "toCurrency", "rateDate");

-- CreateIndex
CREATE INDEX "ExchangeRate_organizationId_createdAt_idx" ON "ExchangeRate"("organizationId", "createdAt");

-- AddForeignKey
ALTER TABLE "ExchangeRate" ADD CONSTRAINT "ExchangeRate_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExchangeRate" ADD CONSTRAINT "ExchangeRate_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Integrity guards the application also enforces.
ALTER TABLE "Organization" ADD CONSTRAINT "Organization_fiscalYearStartMonth_check" CHECK ("fiscalYearStartMonth" BETWEEN 1 AND 12);
ALTER TABLE "ExchangeRate" ADD CONSTRAINT "ExchangeRate_rate_positive_check" CHECK ("rate" > 0);
ALTER TABLE "ExchangeRate" ADD CONSTRAINT "ExchangeRate_currency_codes_check" CHECK ("fromCurrency" ~ '^[A-Z]{3}$' AND "toCurrency" ~ '^[A-Z]{3}$' AND "fromCurrency" <> "toCurrency");

-- Backfill (data-preserving):
-- 1. Normalize the legacy free-text country name "Ghana" to its ISO code.
UPDATE "Organization" SET "country" = 'GH' WHERE upper(btrim("country")) = 'GHANA';
-- 2. Ghana organizations (explicit GH, or no country with the GHS default)
--    select the Ghana jurisdiction pack, matching the tax behavior they
--    already receive from ensureJurisdictionTaxCodes().
UPDATE "Organization" SET "jurisdictionCode" = 'GH'
WHERE "jurisdictionCode" IS NULL
  AND (upper(btrim("country")) = 'GH' OR ("country" IS NULL AND "currency" = 'GHS'));
-- 3. Ghana organizations still on the legacy UTC default move to
--    Africa/Accra. Accra is UTC+0 with no daylight saving, so every displayed
--    time and reporting boundary is unchanged; the zone is now explicit.
UPDATE "Organization" SET "timezone" = 'Africa/Accra'
WHERE "timezone" = 'UTC' AND "jurisdictionCode" = 'GH';
