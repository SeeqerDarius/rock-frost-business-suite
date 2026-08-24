-- AlterTable
ALTER TABLE "PosSale" ADD COLUMN     "clientRequestId" TEXT,
ADD COLUMN     "occurredAt" TIMESTAMP(3);

-- CreateIndex
CREATE UNIQUE INDEX "PosSale_organizationId_clientRequestId_key" ON "PosSale"("organizationId", "clientRequestId");
