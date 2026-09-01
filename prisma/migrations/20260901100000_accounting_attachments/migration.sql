-- CreateEnum
CREATE TYPE "AccountingAttachmentEntityType" AS ENUM ('JOURNAL_ENTRY', 'INVOICE', 'BILL', 'CREDIT_NOTE', 'EXPENSE');

-- CreateTable
CREATE TABLE "AccountingAttachment" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "entityType" "AccountingAttachmentEntityType" NOT NULL,
    "entityId" TEXT NOT NULL,
    "fileAssetId" TEXT NOT NULL,
    "caption" TEXT,
    "uploadedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AccountingAttachment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AccountingAttachment_organizationId_entityType_entityId_idx" ON "AccountingAttachment"("organizationId", "entityType", "entityId");

-- AddForeignKey
ALTER TABLE "AccountingAttachment" ADD CONSTRAINT "AccountingAttachment_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountingAttachment" ADD CONSTRAINT "AccountingAttachment_fileAssetId_fkey" FOREIGN KEY ("fileAssetId") REFERENCES "FileAsset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountingAttachment" ADD CONSTRAINT "AccountingAttachment_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
