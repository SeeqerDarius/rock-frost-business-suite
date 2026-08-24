-- CreateTable
CREATE TABLE "HrSkillType" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HrSkillType_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HrSkill" (
    "id" TEXT NOT NULL,
    "skillTypeId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HrSkill_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HrEmployeeSkill" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "skillId" TEXT NOT NULL,
    "level" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HrEmployeeSkill_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "HrSkillType_organizationId_idx" ON "HrSkillType"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "HrSkillType_organizationId_name_key" ON "HrSkillType"("organizationId", "name");

-- CreateIndex
CREATE INDEX "HrSkill_skillTypeId_idx" ON "HrSkill"("skillTypeId");

-- CreateIndex
CREATE UNIQUE INDEX "HrSkill_skillTypeId_name_key" ON "HrSkill"("skillTypeId", "name");

-- CreateIndex
CREATE INDEX "HrEmployeeSkill_employeeId_idx" ON "HrEmployeeSkill"("employeeId");

-- CreateIndex
CREATE INDEX "HrEmployeeSkill_skillId_idx" ON "HrEmployeeSkill"("skillId");

-- CreateIndex
CREATE UNIQUE INDEX "HrEmployeeSkill_employeeId_skillId_key" ON "HrEmployeeSkill"("employeeId", "skillId");

-- AddForeignKey
ALTER TABLE "HrSkillType" ADD CONSTRAINT "HrSkillType_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HrSkill" ADD CONSTRAINT "HrSkill_skillTypeId_fkey" FOREIGN KEY ("skillTypeId") REFERENCES "HrSkillType"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HrEmployeeSkill" ADD CONSTRAINT "HrEmployeeSkill_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "HrEmployee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HrEmployeeSkill" ADD CONSTRAINT "HrEmployeeSkill_skillId_fkey" FOREIGN KEY ("skillId") REFERENCES "HrSkill"("id") ON DELETE CASCADE ON UPDATE CASCADE;
