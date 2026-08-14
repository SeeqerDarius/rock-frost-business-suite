ALTER TYPE "HrEmployeeStatus" ADD VALUE IF NOT EXISTS 'SUSPENDED';
ALTER TYPE "HrEmployeeStatus" ADD VALUE IF NOT EXISTS 'TERMINATION_PENDING';
ALTER TYPE "HrEmployeeStatus" ADD VALUE IF NOT EXISTS 'REINSTATED';

CREATE TYPE "FleetDriverSubmissionStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED');
CREATE TYPE "AccountingLiquidityType" AS ENUM ('NONE', 'CASH', 'BANK', 'MOBILE_MONEY');
CREATE TYPE "AccountingReconciliationStatus" AS ENUM ('DRAFT', 'COMPLETED', 'REOPENED');
CREATE TYPE "HrTerminationStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED', 'EFFECTIVE', 'REVERSED');
CREATE TYPE "HrTerminationCategory" AS ENUM ('RESIGNATION', 'DISMISSAL', 'REDUNDANCY', 'RETIREMENT', 'CONTRACT_COMPLETION', 'DEATH', 'OTHER');
CREATE TYPE "HrAccessDisposition" AS ENUM ('SUSPEND_IMMEDIATELY', 'SUSPEND_ON_EFFECTIVE_DATE', 'LEAVE_UNCHANGED');

ALTER TABLE "AccountingAccount" ADD COLUMN "liquidityType" "AccountingLiquidityType" NOT NULL DEFAULT 'NONE';
ALTER TABLE "AccountingAccount" ADD COLUMN "bankName" TEXT;
ALTER TABLE "AccountingAccount" ADD COLUMN "accountNumberLast4" TEXT;
ALTER TABLE "AccountingAccount" ADD COLUMN "openingBalancePostedAt" TIMESTAMP(3);
ALTER TABLE "HrEmployee" ADD COLUMN "payrollEligible" BOOLEAN NOT NULL DEFAULT true;
UPDATE "AccountingAccount" SET "liquidityType" = 'CASH' WHERE code = '1000' AND "isSystem" = true;

CREATE TABLE "FleetDriverPaymentSubmission" (
  "id" TEXT NOT NULL, "organizationId" TEXT NOT NULL, "driverId" TEXT NOT NULL, "vehicleId" TEXT, "contractId" TEXT,
  "amount" DECIMAL(12,2) NOT NULL, "paymentDate" TIMESTAMP(3) NOT NULL, "paymentMethod" TEXT NOT NULL, "reference" TEXT,
  "notes" TEXT, "status" "FleetDriverSubmissionStatus" NOT NULL DEFAULT 'PENDING', "reviewedById" TEXT, "reviewedAt" TIMESTAMP(3),
  "rejectionReason" TEXT, "fleetPaymentId" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "FleetDriverPaymentSubmission_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "FleetDriverPaymentSubmission_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE,
  CONSTRAINT "FleetDriverPaymentSubmission_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "FleetDriver"("id") ON DELETE CASCADE
);
CREATE INDEX "FleetDriverPaymentSubmission_organizationId_status_createdAt_idx" ON "FleetDriverPaymentSubmission"("organizationId", "status", "createdAt");
CREATE INDEX "FleetDriverPaymentSubmission_driverId_paymentDate_idx" ON "FleetDriverPaymentSubmission"("driverId", "paymentDate");
CREATE UNIQUE INDEX "FleetDriver_organizationId_userId_key" ON "FleetDriver"("organizationId", "userId");

CREATE TABLE "AccountingReconciliation" (
  "id" TEXT NOT NULL, "organizationId" TEXT NOT NULL, "accountId" TEXT NOT NULL, "periodStart" TIMESTAMP(3) NOT NULL, "periodEnd" TIMESTAMP(3) NOT NULL,
  "statementBalance" DECIMAL(14,2) NOT NULL, "ledgerBalance" DECIMAL(14,2) NOT NULL, "difference" DECIMAL(14,2) NOT NULL,
  "status" "AccountingReconciliationStatus" NOT NULL DEFAULT 'DRAFT', "notes" TEXT, "completedById" TEXT, "completedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AccountingReconciliation_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AccountingReconciliation_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE,
  CONSTRAINT "AccountingReconciliation_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "AccountingAccount"("id") ON DELETE RESTRICT
);
CREATE UNIQUE INDEX "AccountingReconciliation_organizationId_accountId_periodStart_periodEnd_key" ON "AccountingReconciliation"("organizationId", "accountId", "periodStart", "periodEnd");
CREATE INDEX "AccountingReconciliation_organizationId_status_idx" ON "AccountingReconciliation"("organizationId", "status");

CREATE TABLE "HrTerminationRequest" (
  "id" TEXT NOT NULL, "organizationId" TEXT NOT NULL, "employeeId" TEXT NOT NULL, "category" "HrTerminationCategory" NOT NULL,
  "reason" TEXT NOT NULL, "effectiveDate" TIMESTAMP(3) NOT NULL, "lastWorkingDate" TIMESTAMP(3) NOT NULL, "notes" TEXT, "attachmentAssetId" TEXT,
  "status" "HrTerminationStatus" NOT NULL DEFAULT 'PENDING', "accessDisposition" "HrAccessDisposition" NOT NULL, "makerCheckerEnabled" BOOLEAN NOT NULL DEFAULT true,
  "payrollEligibleUntil" TIMESTAMP(3), "initiatedById" TEXT NOT NULL, "approvedById" TEXT, "rejectedById" TEXT, "cancelledById" TEXT,
  "effectiveAt" TIMESTAMP(3), "reviewedAt" TIMESTAMP(3), "cancellationReason" TEXT, "reversalReason" TEXT, "finalSalary" DECIMAL(12,2),
  "leaveEncashment" DECIMAL(12,2) NOT NULL DEFAULT 0, "severance" DECIMAL(12,2) NOT NULL DEFAULT 0, "outstandingDeductions" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "benefitsSettlement" DECIMAL(12,2) NOT NULL DEFAULT 0, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "HrTerminationRequest_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "HrTerminationRequest_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE,
  CONSTRAINT "HrTerminationRequest_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "HrEmployee"("id") ON DELETE RESTRICT
);
CREATE INDEX "HrTerminationRequest_organizationId_status_effectiveDate_idx" ON "HrTerminationRequest"("organizationId", "status", "effectiveDate");
CREATE INDEX "HrTerminationRequest_employeeId_createdAt_idx" ON "HrTerminationRequest"("employeeId", "createdAt");

CREATE TABLE "HrEmployeeStatusHistory" (
  "id" TEXT NOT NULL, "organizationId" TEXT NOT NULL, "employeeId" TEXT NOT NULL, "previousStatus" "HrEmployeeStatus" NOT NULL, "newStatus" "HrEmployeeStatus" NOT NULL,
  "effectiveDate" TIMESTAMP(3) NOT NULL, "reason" TEXT NOT NULL, "initiatedById" TEXT, "approvedById" TEXT, "terminationId" TEXT, "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "HrEmployeeStatusHistory_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "HrEmployeeStatusHistory_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE,
  CONSTRAINT "HrEmployeeStatusHistory_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "HrEmployee"("id") ON DELETE RESTRICT
);
CREATE INDEX "HrEmployeeStatusHistory_organizationId_createdAt_idx" ON "HrEmployeeStatusHistory"("organizationId", "createdAt");
CREATE INDEX "HrEmployeeStatusHistory_employeeId_effectiveDate_idx" ON "HrEmployeeStatusHistory"("employeeId", "effectiveDate");

CREATE TABLE "HrOffboardingTask" (
  "id" TEXT NOT NULL, "organizationId" TEXT NOT NULL, "employeeId" TEXT NOT NULL, "terminationId" TEXT NOT NULL, "title" TEXT NOT NULL,
  "completed" BOOLEAN NOT NULL DEFAULT false, "completedById" TEXT, "completedAt" TIMESTAMP(3), "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "HrOffboardingTask_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "HrOffboardingTask_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE,
  CONSTRAINT "HrOffboardingTask_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "HrEmployee"("id") ON DELETE RESTRICT
);
CREATE INDEX "HrOffboardingTask_organizationId_completed_idx" ON "HrOffboardingTask"("organizationId", "completed");
CREATE INDEX "HrOffboardingTask_terminationId_idx" ON "HrOffboardingTask"("terminationId");
