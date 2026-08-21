CREATE TYPE "ProcurementSupplierInvoiceStatus" AS ENUM ('DRAFT', 'MATCHED', 'EXCEPTION', 'APPROVED', 'REJECTED');

CREATE TABLE "ProcurementRequestLine" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "requestId" TEXT NOT NULL,
  "itemId" TEXT,
  "description" TEXT NOT NULL,
  "quantity" INTEGER NOT NULL,
  "estimatedCost" DECIMAL(12,2),
  CONSTRAINT "ProcurementRequestLine_pkey" PRIMARY KEY ("id")
);

INSERT INTO "ProcurementRequestLine" ("id", "organizationId", "requestId", "itemId", "description", "quantity", "estimatedCost")
SELECT 'legacy-' || "id", "organizationId", "id", "itemId", "description", "quantity", "estimatedCost" FROM "ProcurementRequest";

CREATE TABLE "ProcurementGoodsReceipt" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "receiptNumber" TEXT NOT NULL,
  "orderId" TEXT NOT NULL,
  "warehouseId" TEXT,
  "receivedById" TEXT,
  "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "notes" TEXT,
  CONSTRAINT "ProcurementGoodsReceipt_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ProcurementGoodsReceiptLine" (
  "id" TEXT NOT NULL,
  "receiptId" TEXT NOT NULL,
  "orderLineId" TEXT NOT NULL,
  "itemId" TEXT,
  "quantity" INTEGER NOT NULL,
  CONSTRAINT "ProcurementGoodsReceiptLine_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ProcurementSupplierInvoice" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "vendorId" TEXT NOT NULL,
  "orderId" TEXT NOT NULL,
  "invoiceNumber" TEXT NOT NULL,
  "invoiceDate" TIMESTAMP(3) NOT NULL,
  "status" "ProcurementSupplierInvoiceStatus" NOT NULL DEFAULT 'DRAFT',
  "totalAmount" DECIMAL(12,2) NOT NULL,
  "exceptionNote" TEXT,
  "createdById" TEXT,
  "approvedById" TEXT,
  "approvedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ProcurementSupplierInvoice_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ProcurementSupplierInvoiceLine" (
  "id" TEXT NOT NULL,
  "invoiceId" TEXT NOT NULL,
  "orderLineId" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "quantity" INTEGER NOT NULL,
  "unitCost" DECIMAL(12,2) NOT NULL,
  CONSTRAINT "ProcurementSupplierInvoiceLine_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ProcurementRequestLine_organizationId_idx" ON "ProcurementRequestLine"("organizationId");
CREATE INDEX "ProcurementRequestLine_requestId_idx" ON "ProcurementRequestLine"("requestId");
CREATE INDEX "ProcurementRequestLine_itemId_idx" ON "ProcurementRequestLine"("itemId");
CREATE UNIQUE INDEX "ProcurementGoodsReceipt_organizationId_receiptNumber_key" ON "ProcurementGoodsReceipt"("organizationId", "receiptNumber");
CREATE INDEX "ProcurementGoodsReceipt_organizationId_receivedAt_idx" ON "ProcurementGoodsReceipt"("organizationId", "receivedAt");
CREATE INDEX "ProcurementGoodsReceipt_orderId_idx" ON "ProcurementGoodsReceipt"("orderId");
CREATE INDEX "ProcurementGoodsReceiptLine_receiptId_idx" ON "ProcurementGoodsReceiptLine"("receiptId");
CREATE INDEX "ProcurementGoodsReceiptLine_orderLineId_idx" ON "ProcurementGoodsReceiptLine"("orderLineId");
CREATE UNIQUE INDEX "ProcurementSupplierInvoice_organizationId_vendorId_invoiceNumber_key" ON "ProcurementSupplierInvoice"("organizationId", "vendorId", "invoiceNumber");
CREATE INDEX "ProcurementSupplierInvoice_organizationId_status_idx" ON "ProcurementSupplierInvoice"("organizationId", "status");
CREATE INDEX "ProcurementSupplierInvoice_orderId_idx" ON "ProcurementSupplierInvoice"("orderId");
CREATE INDEX "ProcurementSupplierInvoiceLine_invoiceId_idx" ON "ProcurementSupplierInvoiceLine"("invoiceId");
CREATE INDEX "ProcurementSupplierInvoiceLine_orderLineId_idx" ON "ProcurementSupplierInvoiceLine"("orderLineId");

ALTER TABLE "ProcurementRequestLine" ADD CONSTRAINT "ProcurementRequestLine_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProcurementRequestLine" ADD CONSTRAINT "ProcurementRequestLine_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "ProcurementRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProcurementRequestLine" ADD CONSTRAINT "ProcurementRequestLine_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "InventoryItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ProcurementGoodsReceipt" ADD CONSTRAINT "ProcurementGoodsReceipt_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProcurementGoodsReceipt" ADD CONSTRAINT "ProcurementGoodsReceipt_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "ProcurementOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ProcurementGoodsReceipt" ADD CONSTRAINT "ProcurementGoodsReceipt_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "InventoryWarehouse"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ProcurementGoodsReceipt" ADD CONSTRAINT "ProcurementGoodsReceipt_receivedById_fkey" FOREIGN KEY ("receivedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ProcurementGoodsReceiptLine" ADD CONSTRAINT "ProcurementGoodsReceiptLine_receiptId_fkey" FOREIGN KEY ("receiptId") REFERENCES "ProcurementGoodsReceipt"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProcurementGoodsReceiptLine" ADD CONSTRAINT "ProcurementGoodsReceiptLine_orderLineId_fkey" FOREIGN KEY ("orderLineId") REFERENCES "ProcurementOrderLine"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ProcurementGoodsReceiptLine" ADD CONSTRAINT "ProcurementGoodsReceiptLine_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "InventoryItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ProcurementSupplierInvoice" ADD CONSTRAINT "ProcurementSupplierInvoice_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProcurementSupplierInvoice" ADD CONSTRAINT "ProcurementSupplierInvoice_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "ProcurementVendor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ProcurementSupplierInvoice" ADD CONSTRAINT "ProcurementSupplierInvoice_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "ProcurementOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ProcurementSupplierInvoice" ADD CONSTRAINT "ProcurementSupplierInvoice_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ProcurementSupplierInvoice" ADD CONSTRAINT "ProcurementSupplierInvoice_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ProcurementSupplierInvoiceLine" ADD CONSTRAINT "ProcurementSupplierInvoiceLine_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "ProcurementSupplierInvoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProcurementSupplierInvoiceLine" ADD CONSTRAINT "ProcurementSupplierInvoiceLine_orderLineId_fkey" FOREIGN KEY ("orderLineId") REFERENCES "ProcurementOrderLine"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
