-- AlterEnum
-- Additive only; not referenced elsewhere in this transaction, so it can
-- coexist with the other DDL below (a new enum value just can't be USED in
-- the same transaction that adds it - no DML in this migration touches
-- either new value).
ALTER TYPE "AccountingJournalStatus" ADD VALUE 'PENDING_APPROVAL';
ALTER TYPE "AccountingJournalStatus" ADD VALUE 'REJECTED';

-- AlterTable
ALTER TABLE "AccountingJournalEntry" ADD COLUMN "submittedById" TEXT;
ALTER TABLE "AccountingJournalEntry" ADD COLUMN "approvedById" TEXT;
ALTER TABLE "AccountingJournalEntry" ADD COLUMN "approvedAt" TIMESTAMP(3);
ALTER TABLE "AccountingJournalEntry" ADD COLUMN "rejectedReason" TEXT;
