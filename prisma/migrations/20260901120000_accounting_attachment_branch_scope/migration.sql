-- AddColumn
ALTER TABLE "AccountingAttachment" ADD COLUMN "branchId" TEXT;

-- CreateIndex
CREATE INDEX "AccountingAttachment_branchId_idx" ON "AccountingAttachment"("branchId");

-- AddForeignKey
ALTER TABLE "AccountingAttachment" ADD CONSTRAINT "AccountingAttachment_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;
