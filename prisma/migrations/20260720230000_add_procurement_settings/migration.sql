-- CreateTable
CREATE TABLE "ProcurementSettings" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "defaultWarehouseId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProcurementSettings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ProcurementSettings_organizationId_key" ON "ProcurementSettings"("organizationId");

-- AddForeignKey
ALTER TABLE "ProcurementSettings" ADD CONSTRAINT "ProcurementSettings_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProcurementSettings" ADD CONSTRAINT "ProcurementSettings_defaultWarehouseId_fkey" FOREIGN KEY ("defaultWarehouseId") REFERENCES "InventoryWarehouse"("id") ON DELETE SET NULL ON UPDATE CASCADE;

