CREATE TYPE "OperationalPaymentPurpose" AS ENUM ('FLEET_REMITTANCE', 'FLEET_WORK_AND_PAY', 'INSTALLMENT_PAYMENT', 'POS_SALE', 'HOTEL_PAYMENT', 'SCHOOL_FEE', 'HOSTEL_FEE', 'PHARMACY_SALE', 'HOSPITAL_PAYMENT');
CREATE TYPE "OperationalPaymentStatus" AS ENUM ('CREATED', 'INITIALIZED', 'PENDING', 'SUCCESS', 'FAILED', 'ABANDONED', 'REVERSED', 'REFUNDED');
CREATE TYPE "PaymentBeneficiaryType" AS ENUM ('ORGANIZATION', 'VEHICLE_OWNER');
CREATE TYPE "SettlementProfileStatus" AS ENUM ('PENDING', 'VERIFIED', 'ACTIVE', 'SUSPENDED', 'FAILED');
CREATE TYPE "PaymentReconciliationStatus" AS ENUM ('PENDING', 'COMPLETE', 'NEEDS_RETRY');

CREATE TABLE "SettlementProfile" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "provider" "PaymentGatewayProvider" NOT NULL DEFAULT 'PAYSTACK',
  "providerSubaccountCode" TEXT NOT NULL,
  "settlementBankCode" TEXT NOT NULL,
  "settlementBankName" TEXT NOT NULL,
  "accountLast4" TEXT NOT NULL,
  "accountName" TEXT NOT NULL,
  "currency" TEXT NOT NULL DEFAULT 'GHS',
  "status" "SettlementProfileStatus" NOT NULL DEFAULT 'PENDING',
  "onlineCollectionsEnabled" BOOLEAN NOT NULL DEFAULT false,
  "settlementMode" "PaymentBeneficiaryType" NOT NULL DEFAULT 'ORGANIZATION',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SettlementProfile_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "OperationalPayment" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "provider" "PaymentGatewayProvider" NOT NULL DEFAULT 'PAYSTACK',
  "providerReference" TEXT NOT NULL,
  "purpose" "OperationalPaymentPurpose" NOT NULL,
  "sourceModule" TEXT NOT NULL,
  "sourceType" TEXT NOT NULL,
  "sourceId" TEXT NOT NULL,
  "payerId" TEXT,
  "beneficiaryType" "PaymentBeneficiaryType" NOT NULL DEFAULT 'ORGANIZATION',
  "beneficiaryReference" TEXT NOT NULL,
  "amount" DECIMAL(18,2) NOT NULL,
  "currency" TEXT NOT NULL,
  "status" "OperationalPaymentStatus" NOT NULL DEFAULT 'CREATED',
  "reconciliationStatus" "PaymentReconciliationStatus" NOT NULL DEFAULT 'PENDING',
  "failureReason" TEXT,
  "accountingEntryId" TEXT,
  "receiptNumber" TEXT,
  "paidAt" TIMESTAMP(3),
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "OperationalPayment_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SettlementProfile_organizationId_key" ON "SettlementProfile"("organizationId");
CREATE UNIQUE INDEX "SettlementProfile_providerSubaccountCode_key" ON "SettlementProfile"("providerSubaccountCode");
CREATE INDEX "SettlementProfile_organizationId_status_idx" ON "SettlementProfile"("organizationId", "status");
CREATE UNIQUE INDEX "OperationalPayment_provider_providerReference_key" ON "OperationalPayment"("provider", "providerReference");
CREATE UNIQUE INDEX "OperationalPayment_receiptNumber_key" ON "OperationalPayment"("receiptNumber");
CREATE INDEX "OperationalPayment_organizationId_status_createdAt_idx" ON "OperationalPayment"("organizationId", "status", "createdAt");
CREATE INDEX "OperationalPayment_organizationId_sourceModule_sourceType_sourceId_idx" ON "OperationalPayment"("organizationId", "sourceModule", "sourceType", "sourceId");
CREATE INDEX "OperationalPayment_reconciliationStatus_createdAt_idx" ON "OperationalPayment"("reconciliationStatus", "createdAt");
ALTER TABLE "SettlementProfile" ADD CONSTRAINT "SettlementProfile_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OperationalPayment" ADD CONSTRAINT "OperationalPayment_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
