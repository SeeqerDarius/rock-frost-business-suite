-- CreateEnum
CREATE TYPE "HrPlanKind" AS ENUM ('ONBOARDING', 'OFFBOARDING');

-- CreateEnum
CREATE TYPE "HrPlanActivityType" AS ENUM ('TODO', 'EMAIL', 'CALL', 'MEETING', 'DOCUMENT');

-- CreateEnum
CREATE TYPE "HrPlanActivityStatus" AS ENUM ('PENDING', 'DONE');

-- CreateEnum
CREATE TYPE "HrPlanOwnerRule" AS ENUM ('EMPLOYEE', 'MANAGER', 'HR_MANAGER', 'UNASSIGNED');

-- CreateTable
CREATE TABLE "HrPlanTemplate" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "kind" "HrPlanKind" NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HrPlanTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HrPlanTemplateActivity" (
    "id" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "activityType" "HrPlanActivityType" NOT NULL,
    "dueDateOffsetDays" INTEGER NOT NULL DEFAULT 0,
    "ownerRule" "HrPlanOwnerRule" NOT NULL DEFAULT 'UNASSIGNED',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "HrPlanTemplateActivity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HrPlanInstance" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "kind" "HrPlanKind" NOT NULL,
    "templateId" TEXT,
    "targetDate" TIMESTAMP(3) NOT NULL,
    "launchedById" TEXT NOT NULL,
    "launchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HrPlanInstance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HrPlanActivity" (
    "id" TEXT NOT NULL,
    "instanceId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "activityType" "HrPlanActivityType" NOT NULL,
    "dueDate" TIMESTAMP(3) NOT NULL,
    "ownerId" TEXT,
    "status" "HrPlanActivityStatus" NOT NULL DEFAULT 'PENDING',
    "completedAt" TIMESTAMP(3),
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "HrPlanActivity_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "HrPlanTemplate_organizationId_kind_idx" ON "HrPlanTemplate"("organizationId", "kind");

-- CreateIndex
CREATE INDEX "HrPlanTemplateActivity_templateId_idx" ON "HrPlanTemplateActivity"("templateId");

-- CreateIndex
CREATE INDEX "HrPlanInstance_organizationId_employeeId_idx" ON "HrPlanInstance"("organizationId", "employeeId");

-- CreateIndex
CREATE INDEX "HrPlanActivity_instanceId_status_idx" ON "HrPlanActivity"("instanceId", "status");

-- AddForeignKey
ALTER TABLE "HrPlanTemplate" ADD CONSTRAINT "HrPlanTemplate_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HrPlanTemplateActivity" ADD CONSTRAINT "HrPlanTemplateActivity_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "HrPlanTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HrPlanInstance" ADD CONSTRAINT "HrPlanInstance_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HrPlanInstance" ADD CONSTRAINT "HrPlanInstance_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "HrEmployee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HrPlanInstance" ADD CONSTRAINT "HrPlanInstance_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "HrPlanTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HrPlanActivity" ADD CONSTRAINT "HrPlanActivity_instanceId_fkey" FOREIGN KEY ("instanceId") REFERENCES "HrPlanInstance"("id") ON DELETE CASCADE ON UPDATE CASCADE;
