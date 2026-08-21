CREATE TYPE "InventoryCountStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'APPROVED', 'REJECTED', 'POSTED');

ALTER TABLE "InventoryItem" ADD COLUMN "barcode" TEXT;

CREATE TABLE "InventoryCount" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "warehouseId" TEXT NOT NULL,
  "countNumber" TEXT NOT NULL,
  "countDate" TIMESTAMP(3) NOT NULL,
  "status" "InventoryCountStatus" NOT NULL DEFAULT 'DRAFT',
  "notes" TEXT,
  "createdById" TEXT,
  "submittedAt" TIMESTAMP(3),
  "approvedById" TEXT,
  "approvedAt" TIMESTAMP(3),
  "rejectedById" TEXT,
  "rejectedAt" TIMESTAMP(3),
  "rejectionReason" TEXT,
  "postedById" TEXT,
  "postedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "InventoryCount_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "InventoryCountLine" (
  "id" TEXT NOT NULL,
  "countId" TEXT NOT NULL,
  "itemId" TEXT NOT NULL,
  "expectedQuantity" INTEGER NOT NULL,
  "countedQuantity" INTEGER,
  "variance" INTEGER,
  "notes" TEXT,
  CONSTRAINT "InventoryCountLine_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "InventoryItem_organizationId_barcode_key" ON "InventoryItem"("organizationId", "barcode");
CREATE UNIQUE INDEX "InventoryCount_organizationId_countNumber_key" ON "InventoryCount"("organizationId", "countNumber");
CREATE INDEX "InventoryCount_organizationId_status_countDate_idx" ON "InventoryCount"("organizationId", "status", "countDate");
CREATE INDEX "InventoryCount_warehouseId_idx" ON "InventoryCount"("warehouseId");
CREATE UNIQUE INDEX "InventoryCountLine_countId_itemId_key" ON "InventoryCountLine"("countId", "itemId");
CREATE INDEX "InventoryCountLine_itemId_idx" ON "InventoryCountLine"("itemId");

ALTER TABLE "InventoryCount" ADD CONSTRAINT "InventoryCount_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "InventoryCount" ADD CONSTRAINT "InventoryCount_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "InventoryWarehouse"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "InventoryCountLine" ADD CONSTRAINT "InventoryCountLine_countId_fkey" FOREIGN KEY ("countId") REFERENCES "InventoryCount"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "InventoryCountLine" ADD CONSTRAINT "InventoryCountLine_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "InventoryItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
