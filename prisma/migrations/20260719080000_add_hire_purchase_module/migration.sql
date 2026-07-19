-- CreateEnum
CREATE TYPE "HirePurchaseAccountStatus" AS ENUM ('ACTIVE', 'COMPLETED', 'OVERDUE', 'DORMANT', 'PROBATION', 'CLOSED', 'ARCHIVED', 'SUSPENDED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "HirePurchaseDeliveryStatus" AS ENUM ('PENDING', 'DELIVERED');

-- CreateEnum
CREATE TYPE "HirePurchaseCreditStatus" AS ENUM ('OPEN', 'REFUNDED', 'APPLIED', 'VOID');

-- CreateEnum
CREATE TYPE "HirePurchaseCreditSource" AS ENUM ('PAYMENT_OVERPAYMENT', 'ACCOUNT_CLOSURE_REFUND', 'MANUAL_ADJUSTMENT');

-- CreateTable
CREATE TABLE "HirePurchaseStaff" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "branchId" TEXT,
    "userId" TEXT,
    "code" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "monthlySalary" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HirePurchaseStaff_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HirePurchaseStaffSalaryPayment" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "staffId" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "paymentDate" TIMESTAMP(3) NOT NULL,
    "salaryMonth" TIMESTAMP(3) NOT NULL,
    "notes" TEXT,
    "paidBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HirePurchaseStaffSalaryPayment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HirePurchaseStaffSalaryHistory" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "staffId" TEXT NOT NULL,
    "monthlySalary" DECIMAL(12,2) NOT NULL,
    "effectiveMonth" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HirePurchaseStaffSalaryHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HirePurchaseProductCategory" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HirePurchaseProductCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HirePurchaseProduct" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "description" TEXT,
    "imageUrl" TEXT,
    "costPrice" DECIMAL(12,2) NOT NULL,
    "transportCost" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "dailyAmount" DECIMAL(12,2) NOT NULL,
    "duration" INTEGER NOT NULL,
    "price" DECIMAL(12,2) NOT NULL,
    "quantityOnSale" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HirePurchaseProduct_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HirePurchaseStaffInventory" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "staffId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HirePurchaseStaffInventory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HirePurchaseCustomer" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "branchId" TEXT,
    "customerCode" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "phone" TEXT,
    "address" TEXT,
    "nationalId" TEXT,
    "photoUrl" TEXT,
    "staffId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HirePurchaseCustomer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HirePurchaseAccount" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "branchId" TEXT,
    "customerId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "inventoryStaffId" TEXT,
    "startDate" TIMESTAMP(3) NOT NULL,
    "expectedEndDate" TIMESTAMP(3) NOT NULL,
    "targetAmount" DECIMAL(12,2) NOT NULL,
    "dailyAmount" DECIMAL(12,2) NOT NULL,
    "totalPaid" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "balance" DECIMAL(12,2) NOT NULL,
    "status" "HirePurchaseAccountStatus" NOT NULL DEFAULT 'ACTIVE',
    "deliveryStatus" "HirePurchaseDeliveryStatus" NOT NULL DEFAULT 'PENDING',
    "deliveredAt" TIMESTAMP(3),
    "deliveredBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HirePurchaseAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HirePurchasePayment" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "receiptNo" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "paymentDate" TIMESTAMP(3) NOT NULL,
    "method" TEXT NOT NULL,
    "notes" TEXT,
    "receivedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HirePurchasePayment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HirePurchaseCredit" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "accountId" TEXT,
    "paymentId" TEXT,
    "amount" DECIMAL(12,2) NOT NULL,
    "remainingAmount" DECIMAL(12,2) NOT NULL,
    "status" "HirePurchaseCreditStatus" NOT NULL DEFAULT 'OPEN',
    "source" "HirePurchaseCreditSource" NOT NULL,
    "notes" TEXT,
    "createdBy" TEXT,
    "resolvedBy" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HirePurchaseCredit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HirePurchaseSettings" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "installmentDurationDays" INTEGER NOT NULL DEFAULT 184,
    "defaultDailyCollection" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "administrationFeePercent" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "refundDeductionPercent" DECIMAL(5,2) NOT NULL DEFAULT 32,
    "deliveryTimeAfterCompletionDays" INTEGER NOT NULL DEFAULT 2,
    "procurementThresholdPercent" DECIMAL(5,2) NOT NULL DEFAULT 70,
    "paymentEditWindowHours" INTEGER NOT NULL DEFAULT 3,
    "minimumDeposit" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "defaultMonthlySalary" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "defaultStaffInventoryQuantity" INTEGER NOT NULL DEFAULT 10,
    "commissionEnabled" BOOLEAN NOT NULL DEFAULT false,
    "commissionPercentage" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "payrollDay" INTEGER NOT NULL DEFAULT 1,
    "receiptPrefix" TEXT NOT NULL DEFAULT 'RCPT',
    "customerIdPrefix" TEXT NOT NULL DEFAULT 'CUST',
    "staffCodeLength" INTEGER NOT NULL DEFAULT 3,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HirePurchaseSettings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "HirePurchaseStaff_organizationId_idx" ON "HirePurchaseStaff"("organizationId");

-- CreateIndex
CREATE INDEX "HirePurchaseStaff_branchId_idx" ON "HirePurchaseStaff"("branchId");

-- CreateIndex
CREATE INDEX "HirePurchaseStaff_userId_idx" ON "HirePurchaseStaff"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "HirePurchaseStaff_organizationId_code_key" ON "HirePurchaseStaff"("organizationId", "code");

-- CreateIndex
CREATE INDEX "HirePurchaseStaffSalaryPayment_organizationId_idx" ON "HirePurchaseStaffSalaryPayment"("organizationId");

-- CreateIndex
CREATE INDEX "HirePurchaseStaffSalaryPayment_staffId_salaryMonth_idx" ON "HirePurchaseStaffSalaryPayment"("staffId", "salaryMonth");

-- CreateIndex
CREATE INDEX "HirePurchaseStaffSalaryHistory_organizationId_idx" ON "HirePurchaseStaffSalaryHistory"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "HirePurchaseStaffSalaryHistory_staffId_effectiveMonth_key" ON "HirePurchaseStaffSalaryHistory"("staffId", "effectiveMonth");

-- CreateIndex
CREATE INDEX "HirePurchaseProductCategory_organizationId_idx" ON "HirePurchaseProductCategory"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "HirePurchaseProductCategory_organizationId_name_key" ON "HirePurchaseProductCategory"("organizationId", "name");

-- CreateIndex
CREATE INDEX "HirePurchaseProduct_organizationId_idx" ON "HirePurchaseProduct"("organizationId");

-- CreateIndex
CREATE INDEX "HirePurchaseProduct_category_idx" ON "HirePurchaseProduct"("category");

-- CreateIndex
CREATE INDEX "HirePurchaseStaffInventory_organizationId_idx" ON "HirePurchaseStaffInventory"("organizationId");

-- CreateIndex
CREATE INDEX "HirePurchaseStaffInventory_productId_idx" ON "HirePurchaseStaffInventory"("productId");

-- CreateIndex
CREATE UNIQUE INDEX "HirePurchaseStaffInventory_staffId_productId_key" ON "HirePurchaseStaffInventory"("staffId", "productId");

-- CreateIndex
CREATE INDEX "HirePurchaseCustomer_organizationId_idx" ON "HirePurchaseCustomer"("organizationId");

-- CreateIndex
CREATE INDEX "HirePurchaseCustomer_branchId_idx" ON "HirePurchaseCustomer"("branchId");

-- CreateIndex
CREATE INDEX "HirePurchaseCustomer_staffId_idx" ON "HirePurchaseCustomer"("staffId");

-- CreateIndex
CREATE INDEX "HirePurchaseCustomer_phone_idx" ON "HirePurchaseCustomer"("phone");

-- CreateIndex
CREATE UNIQUE INDEX "HirePurchaseCustomer_organizationId_customerCode_key" ON "HirePurchaseCustomer"("organizationId", "customerCode");

-- CreateIndex
CREATE INDEX "HirePurchaseAccount_organizationId_status_idx" ON "HirePurchaseAccount"("organizationId", "status");

-- CreateIndex
CREATE INDEX "HirePurchaseAccount_branchId_idx" ON "HirePurchaseAccount"("branchId");

-- CreateIndex
CREATE INDEX "HirePurchaseAccount_customerId_idx" ON "HirePurchaseAccount"("customerId");

-- CreateIndex
CREATE INDEX "HirePurchaseAccount_productId_idx" ON "HirePurchaseAccount"("productId");

-- CreateIndex
CREATE INDEX "HirePurchaseAccount_inventoryStaffId_idx" ON "HirePurchaseAccount"("inventoryStaffId");

-- CreateIndex
CREATE INDEX "HirePurchasePayment_organizationId_idx" ON "HirePurchasePayment"("organizationId");

-- CreateIndex
CREATE INDEX "HirePurchasePayment_accountId_idx" ON "HirePurchasePayment"("accountId");

-- CreateIndex
CREATE UNIQUE INDEX "HirePurchasePayment_organizationId_receiptNo_key" ON "HirePurchasePayment"("organizationId", "receiptNo");

-- CreateIndex
CREATE UNIQUE INDEX "HirePurchaseCredit_paymentId_key" ON "HirePurchaseCredit"("paymentId");

-- CreateIndex
CREATE INDEX "HirePurchaseCredit_organizationId_status_idx" ON "HirePurchaseCredit"("organizationId", "status");

-- CreateIndex
CREATE INDEX "HirePurchaseCredit_customerId_idx" ON "HirePurchaseCredit"("customerId");

-- CreateIndex
CREATE INDEX "HirePurchaseCredit_accountId_idx" ON "HirePurchaseCredit"("accountId");

-- CreateIndex
CREATE UNIQUE INDEX "HirePurchaseSettings_organizationId_key" ON "HirePurchaseSettings"("organizationId");

-- AddForeignKey
ALTER TABLE "HirePurchaseStaff" ADD CONSTRAINT "HirePurchaseStaff_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HirePurchaseStaff" ADD CONSTRAINT "HirePurchaseStaff_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HirePurchaseStaff" ADD CONSTRAINT "HirePurchaseStaff_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HirePurchaseStaffSalaryPayment" ADD CONSTRAINT "HirePurchaseStaffSalaryPayment_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HirePurchaseStaffSalaryPayment" ADD CONSTRAINT "HirePurchaseStaffSalaryPayment_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "HirePurchaseStaff"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HirePurchaseStaffSalaryHistory" ADD CONSTRAINT "HirePurchaseStaffSalaryHistory_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HirePurchaseStaffSalaryHistory" ADD CONSTRAINT "HirePurchaseStaffSalaryHistory_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "HirePurchaseStaff"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HirePurchaseProductCategory" ADD CONSTRAINT "HirePurchaseProductCategory_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HirePurchaseProduct" ADD CONSTRAINT "HirePurchaseProduct_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HirePurchaseStaffInventory" ADD CONSTRAINT "HirePurchaseStaffInventory_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HirePurchaseStaffInventory" ADD CONSTRAINT "HirePurchaseStaffInventory_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "HirePurchaseStaff"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HirePurchaseStaffInventory" ADD CONSTRAINT "HirePurchaseStaffInventory_productId_fkey" FOREIGN KEY ("productId") REFERENCES "HirePurchaseProduct"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HirePurchaseCustomer" ADD CONSTRAINT "HirePurchaseCustomer_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HirePurchaseCustomer" ADD CONSTRAINT "HirePurchaseCustomer_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HirePurchaseCustomer" ADD CONSTRAINT "HirePurchaseCustomer_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "HirePurchaseStaff"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HirePurchaseAccount" ADD CONSTRAINT "HirePurchaseAccount_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HirePurchaseAccount" ADD CONSTRAINT "HirePurchaseAccount_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HirePurchaseAccount" ADD CONSTRAINT "HirePurchaseAccount_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "HirePurchaseCustomer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HirePurchaseAccount" ADD CONSTRAINT "HirePurchaseAccount_productId_fkey" FOREIGN KEY ("productId") REFERENCES "HirePurchaseProduct"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HirePurchaseAccount" ADD CONSTRAINT "HirePurchaseAccount_inventoryStaffId_fkey" FOREIGN KEY ("inventoryStaffId") REFERENCES "HirePurchaseStaff"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HirePurchasePayment" ADD CONSTRAINT "HirePurchasePayment_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HirePurchasePayment" ADD CONSTRAINT "HirePurchasePayment_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "HirePurchaseAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HirePurchaseCredit" ADD CONSTRAINT "HirePurchaseCredit_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HirePurchaseCredit" ADD CONSTRAINT "HirePurchaseCredit_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "HirePurchaseCustomer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HirePurchaseCredit" ADD CONSTRAINT "HirePurchaseCredit_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "HirePurchaseAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HirePurchaseCredit" ADD CONSTRAINT "HirePurchaseCredit_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "HirePurchasePayment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HirePurchaseSettings" ADD CONSTRAINT "HirePurchaseSettings_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

