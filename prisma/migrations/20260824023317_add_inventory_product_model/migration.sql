-- CreateEnum
CREATE TYPE "InventoryProductType" AS ENUM ('GOODS', 'SERVICE');

-- AlterTable
ALTER TABLE "InventoryItem" ADD COLUMN     "isPosAvailable" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "isPurchasable" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "productType" "InventoryProductType" NOT NULL DEFAULT 'GOODS',
ADD COLUMN     "salesPrice" DECIMAL(12,2) NOT NULL DEFAULT 0,
ADD COLUMN     "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "taxCodeId" TEXT,
ADD COLUMN     "trackInventory" BOOLEAN NOT NULL DEFAULT true;

-- CreateIndex
CREATE INDEX "InventoryItem_taxCodeId_idx" ON "InventoryItem"("taxCodeId");

-- AddForeignKey
ALTER TABLE "InventoryItem" ADD CONSTRAINT "InventoryItem_taxCodeId_fkey" FOREIGN KEY ("taxCodeId") REFERENCES "AccountingTaxCode"("id") ON DELETE SET NULL ON UPDATE CASCADE;
