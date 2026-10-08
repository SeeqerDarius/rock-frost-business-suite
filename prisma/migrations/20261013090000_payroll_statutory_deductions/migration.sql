-- Configurable payroll statutory deductions (additive only).
CREATE TYPE "PayrollDeductionMode" AS ENUM ('FLAT_RATE', 'RULES');
CREATE TYPE "PayrollDeductionKind" AS ENUM ('EMPLOYEE_WITHHOLDING', 'EMPLOYEE_CONTRIBUTION', 'EMPLOYER_CONTRIBUTION');
CREATE TYPE "PayrollDeductionMethod" AS ENUM ('PERCENTAGE', 'BRACKETS');

ALTER TABLE "PayrollSettings" ADD COLUMN "deductionMode" "PayrollDeductionMode" NOT NULL DEFAULT 'FLAT_RATE';
ALTER TABLE "PayrollCompensation" ADD COLUMN "filingStatus" TEXT;
ALTER TABLE "PayrollCompensation" ADD COLUMN "additionalWithholding" DECIMAL(12,2) NOT NULL DEFAULT 0;
ALTER TABLE "PayrollPayslip" ADD COLUMN "employerContributions" DECIMAL(12,2) NOT NULL DEFAULT 0;

CREATE TABLE "PayrollDeductionRule" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" "PayrollDeductionKind" NOT NULL,
    "method" "PayrollDeductionMethod" NOT NULL,
    "taxYear" INTEGER NOT NULL,
    "rate" DECIMAL(9,4),
    "brackets" JSONB,
    "annualAllowance" DECIMAL(14,2),
    "wageBase" DECIMAL(14,2),
    "wageFloor" DECIMAL(14,2),
    "filingStatus" TEXT,
    "liabilityAccountCode" TEXT NOT NULL,
    "expenseAccountCode" TEXT,
    "sourceReference" TEXT,
    "templateKey" TEXT,
    "effectiveFrom" DATE NOT NULL,
    "effectiveTo" DATE,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "confirmedAt" TIMESTAMP(3),
    "confirmedById" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "PayrollDeductionRule_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "PayrollDeductionRule_rate_check" CHECK ("rate" IS NULL OR ("rate" >= 0 AND "rate" <= 100)),
    CONSTRAINT "PayrollDeductionRule_amounts_check" CHECK (("wageBase" IS NULL OR "wageBase" > 0) AND ("wageFloor" IS NULL OR "wageFloor" >= 0) AND ("annualAllowance" IS NULL OR "annualAllowance" >= 0)),
    CONSTRAINT "PayrollDeductionRule_effective_check" CHECK ("effectiveTo" IS NULL OR "effectiveTo" >= "effectiveFrom")
);

CREATE TABLE "PayrollPayslipDeduction" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "payslipId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "ruleId" TEXT,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" "PayrollDeductionKind" NOT NULL,
    "taxYear" INTEGER NOT NULL,
    "subjectWages" DECIMAL(14,2) NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "liabilityAccountCode" TEXT NOT NULL,
    "expenseAccountCode" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PayrollPayslipDeduction_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "PayrollPayslipDeduction_amount_check" CHECK ("amount" >= 0 AND "subjectWages" >= 0)
);

CREATE UNIQUE INDEX "PayrollDeductionRule_organizationId_code_taxYear_key" ON "PayrollDeductionRule"("organizationId", "code", "taxYear");
CREATE INDEX "PayrollDeductionRule_organizationId_taxYear_idx" ON "PayrollDeductionRule"("organizationId", "taxYear");
CREATE INDEX "PayrollPayslipDeduction_organizationId_employeeId_taxYear_code_idx" ON "PayrollPayslipDeduction"("organizationId", "employeeId", "taxYear", "code");
CREATE INDEX "PayrollPayslipDeduction_payslipId_idx" ON "PayrollPayslipDeduction"("payslipId");

ALTER TABLE "PayrollDeductionRule" ADD CONSTRAINT "PayrollDeductionRule_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PayrollPayslipDeduction" ADD CONSTRAINT "PayrollPayslipDeduction_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PayrollPayslipDeduction" ADD CONSTRAINT "PayrollPayslipDeduction_payslipId_fkey" FOREIGN KEY ("payslipId") REFERENCES "PayrollPayslip"("id") ON DELETE CASCADE ON UPDATE CASCADE;
