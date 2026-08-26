-- CreateEnum
CREATE TYPE "SmsMessageStatus" AS ENUM ('SENT', 'FAILED');

-- CreateTable
CREATE TABLE "SmsMessage" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "to" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "relatedType" TEXT,
    "relatedId" TEXT,
    "status" "SmsMessageStatus" NOT NULL,
    "providerResponse" JSONB,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SmsMessage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SmsMessage_organizationId_purpose_createdAt_idx" ON "SmsMessage"("organizationId", "purpose", "createdAt");

-- CreateIndex
CREATE INDEX "SmsMessage_relatedType_relatedId_idx" ON "SmsMessage"("relatedType", "relatedId");

-- AddForeignKey
ALTER TABLE "SmsMessage" ADD CONSTRAINT "SmsMessage_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
