-- CreateEnum
CREATE TYPE "VatNumberCheckStatus" AS ENUM ('VALID', 'INVALID', 'UNAVAILABLE');

-- CreateTable
CREATE TABLE "VatNumberCheck" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "contactId" TEXT,
    "countryCode" TEXT NOT NULL,
    "vatNumber" TEXT NOT NULL,
    "level" TEXT NOT NULL,
    "status" "VatNumberCheckStatus" NOT NULL,
    "provider" TEXT NOT NULL,
    "registeredName" TEXT,
    "registeredAddress" TEXT,
    "consultationNumber" TEXT,
    "message" TEXT NOT NULL,
    "checkedById" TEXT,
    "checkedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VatNumberCheck_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "VatNumberCheck_organizationId_contactId_checkedAt_idx" ON "VatNumberCheck"("organizationId", "contactId", "checkedAt");

-- AddForeignKey
ALTER TABLE "VatNumberCheck" ADD CONSTRAINT "VatNumberCheck_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VatNumberCheck" ADD CONSTRAINT "VatNumberCheck_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "AccountingContact"("id") ON DELETE SET NULL ON UPDATE CASCADE;

