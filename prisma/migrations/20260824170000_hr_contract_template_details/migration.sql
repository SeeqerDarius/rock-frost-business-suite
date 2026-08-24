-- AlterTable
ALTER TABLE "HrContractTemplate" ADD COLUMN     "department" TEXT,
ADD COLUMN     "employeeTypeId" TEXT,
ADD COLUMN     "excludedFromPayRuns" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "hrResponsibleId" TEXT,
ADD COLUMN     "jobPositionId" TEXT,
ADD COLUMN     "payFrequency" TEXT NOT NULL DEFAULT 'MONTHLY',
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "wage" DECIMAL(12,2) NOT NULL DEFAULT 0,
ADD COLUMN     "wageType" TEXT NOT NULL DEFAULT 'FIXED',
ADD COLUMN     "workingScheduleId" TEXT;

-- CreateIndex
CREATE INDEX "HrContractTemplate_jobPositionId_idx" ON "HrContractTemplate"("jobPositionId");

-- CreateIndex
CREATE INDEX "HrContractTemplate_hrResponsibleId_idx" ON "HrContractTemplate"("hrResponsibleId");

-- CreateIndex
CREATE INDEX "HrContractTemplate_employeeTypeId_idx" ON "HrContractTemplate"("employeeTypeId");

-- CreateIndex
CREATE INDEX "HrContractTemplate_workingScheduleId_idx" ON "HrContractTemplate"("workingScheduleId");

-- AddForeignKey
ALTER TABLE "HrContractTemplate" ADD CONSTRAINT "HrContractTemplate_jobPositionId_fkey" FOREIGN KEY ("jobPositionId") REFERENCES "HrJobPosition"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HrContractTemplate" ADD CONSTRAINT "HrContractTemplate_hrResponsibleId_fkey" FOREIGN KEY ("hrResponsibleId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HrContractTemplate" ADD CONSTRAINT "HrContractTemplate_employeeTypeId_fkey" FOREIGN KEY ("employeeTypeId") REFERENCES "HrEmployeeType"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HrContractTemplate" ADD CONSTRAINT "HrContractTemplate_workingScheduleId_fkey" FOREIGN KEY ("workingScheduleId") REFERENCES "HrWorkingSchedule"("id") ON DELETE SET NULL ON UPDATE CASCADE;
