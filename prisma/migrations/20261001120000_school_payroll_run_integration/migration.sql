CREATE TYPE "SchoolPayrollAdjustmentCategory" AS ENUM ('EARNING', 'DEDUCTION');

ALTER TABLE "HrEmployee"
ADD CONSTRAINT "HrEmployee_organizationId_id_key" UNIQUE ("organizationId", "id");

ALTER TABLE "PayrollRun"
ADD CONSTRAINT "PayrollRun_organizationId_id_key" UNIQUE ("organizationId", "id");

ALTER TABLE "SchoolPayrollAdjustment"
RENAME COLUMN "employeeId" TO "legacyEmployeeId";

ALTER TABLE "SchoolPayrollAdjustment"
ALTER COLUMN "legacyEmployeeId" DROP NOT NULL;

ALTER TABLE "SchoolPayrollAdjustment"
ADD COLUMN "employeeId" TEXT,
ADD COLUMN "category" "SchoolPayrollAdjustmentCategory" NOT NULL DEFAULT 'EARNING',
ADD COLUMN "payrollRunId" TEXT;

UPDATE "SchoolPayrollAdjustment" AS adjustment
SET "employeeId" = employee."id"
FROM "HrEmployee" AS employee
WHERE employee."id" = adjustment."legacyEmployeeId"
  AND employee."organizationId" = adjustment."organizationId";

UPDATE "SchoolPayrollAdjustment"
SET "legacyEmployeeId" = NULL
WHERE "employeeId" IS NOT NULL;

UPDATE "SchoolPayrollAdjustment"
SET "category" = 'DEDUCTION'
WHERE LOWER("type") = 'deduction';

ALTER INDEX "SchoolPayrollAdjustment_employeeId_idx"
RENAME TO "SchoolPayrollAdjustment_legacyEmployeeId_idx";

CREATE INDEX "SchoolPayrollAdjustment_employeeId_idx"
ON "SchoolPayrollAdjustment"("employeeId");

CREATE INDEX "SchoolPayrollAdjustment_organizationId_period_processedAt_idx"
ON "SchoolPayrollAdjustment"("organizationId", "period", "processedAt");

CREATE INDEX "SchoolPayrollAdjustment_organizationId_employeeId_idx"
ON "SchoolPayrollAdjustment"("organizationId", "employeeId");

CREATE INDEX "SchoolPayrollAdjustment_payrollRunId_idx"
ON "SchoolPayrollAdjustment"("payrollRunId");

ALTER TABLE "SchoolPayrollAdjustment"
ADD CONSTRAINT "SchoolPayrollAdjustment_organizationId_employeeId_fkey"
FOREIGN KEY ("organizationId", "employeeId")
REFERENCES "HrEmployee"("organizationId", "id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "SchoolPayrollAdjustment"
ADD CONSTRAINT "SchoolPayrollAdjustment_organizationId_payrollRunId_fkey"
FOREIGN KEY ("organizationId", "payrollRunId")
REFERENCES "PayrollRun"("organizationId", "id")
ON DELETE RESTRICT ON UPDATE CASCADE;
