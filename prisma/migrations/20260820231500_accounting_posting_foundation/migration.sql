CREATE TYPE "AccountingPeriodStatus" AS ENUM ('OPEN', 'CLOSED');
CREATE TYPE "AccountingJournalStatus" AS ENUM ('POSTED', 'REVERSED');

ALTER TABLE "AccountingJournalEntry"
  ADD COLUMN "postingPurpose" TEXT,
  ADD COLUMN "postingNumber" TEXT,
  ADD COLUMN "status" "AccountingJournalStatus" NOT NULL DEFAULT 'POSTED',
  ADD COLUMN "reversalOfId" TEXT;

WITH numbered AS (
  SELECT "id", ROW_NUMBER() OVER (PARTITION BY "organizationId" ORDER BY "createdAt", "id") AS sequence
  FROM "AccountingJournalEntry"
)
UPDATE "AccountingJournalEntry" AS entry
SET "postingNumber" = 'JRN-' || LPAD(numbered.sequence::TEXT, 8, '0')
FROM numbered
WHERE entry."id" = numbered."id";

ALTER TABLE "AccountingJournalEntry" ALTER COLUMN "postingNumber" SET NOT NULL;

CREATE TABLE "AccountingPeriod" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "startDate" TIMESTAMP(3) NOT NULL,
  "endDate" TIMESTAMP(3) NOT NULL,
  "status" "AccountingPeriodStatus" NOT NULL DEFAULT 'OPEN',
  "closedById" TEXT,
  "closedAt" TIMESTAMP(3),
  "reopenedById" TEXT,
  "reopenedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AccountingPeriod_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AccountingJournalEntry_organizationId_postingNumber_key" ON "AccountingJournalEntry"("organizationId", "postingNumber");
CREATE UNIQUE INDEX "AccountingJournalEntry_organizationId_sourceType_sourceId_postingPurpose_key" ON "AccountingJournalEntry"("organizationId", "sourceType", "sourceId", "postingPurpose");
CREATE UNIQUE INDEX "AccountingJournalEntry_reversalOfId_key" ON "AccountingJournalEntry"("reversalOfId");
CREATE UNIQUE INDEX "AccountingPeriod_organizationId_startDate_endDate_key" ON "AccountingPeriod"("organizationId", "startDate", "endDate");
CREATE INDEX "AccountingPeriod_organizationId_status_startDate_endDate_idx" ON "AccountingPeriod"("organizationId", "status", "startDate", "endDate");

ALTER TABLE "AccountingJournalEntry" ADD CONSTRAINT "AccountingJournalEntry_reversalOfId_fkey" FOREIGN KEY ("reversalOfId") REFERENCES "AccountingJournalEntry"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AccountingPeriod" ADD CONSTRAINT "AccountingPeriod_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
