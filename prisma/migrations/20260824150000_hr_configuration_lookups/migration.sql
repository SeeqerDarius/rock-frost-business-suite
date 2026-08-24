-- CreateEnum
CREATE TYPE "HrWorkLocationType" AS ENUM ('OFFICE', 'REMOTE', 'HYBRID');

-- CreateTable
CREATE TABLE "HrEmployeeType" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HrEmployeeType_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HrWorkLocation" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "locationType" "HrWorkLocationType" NOT NULL DEFAULT 'OFFICE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HrWorkLocation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HrDepartureReason" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HrDepartureReason_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HrWorkingSchedule" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HrWorkingSchedule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HrTimeType" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HrTimeType_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HrJobPosition" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HrJobPosition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HrContractTemplate" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HrContractTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "HrEmployeeType_organizationId_idx" ON "HrEmployeeType"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "HrEmployeeType_organizationId_name_key" ON "HrEmployeeType"("organizationId", "name");

-- CreateIndex
CREATE INDEX "HrWorkLocation_organizationId_idx" ON "HrWorkLocation"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "HrWorkLocation_organizationId_name_key" ON "HrWorkLocation"("organizationId", "name");

-- CreateIndex
CREATE INDEX "HrDepartureReason_organizationId_idx" ON "HrDepartureReason"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "HrDepartureReason_organizationId_name_key" ON "HrDepartureReason"("organizationId", "name");

-- CreateIndex
CREATE INDEX "HrWorkingSchedule_organizationId_idx" ON "HrWorkingSchedule"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "HrWorkingSchedule_organizationId_name_key" ON "HrWorkingSchedule"("organizationId", "name");

-- CreateIndex
CREATE INDEX "HrTimeType_organizationId_idx" ON "HrTimeType"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "HrTimeType_organizationId_name_key" ON "HrTimeType"("organizationId", "name");

-- CreateIndex
CREATE INDEX "HrJobPosition_organizationId_idx" ON "HrJobPosition"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "HrJobPosition_organizationId_name_key" ON "HrJobPosition"("organizationId", "name");

-- CreateIndex
CREATE INDEX "HrContractTemplate_organizationId_idx" ON "HrContractTemplate"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "HrContractTemplate_organizationId_name_key" ON "HrContractTemplate"("organizationId", "name");

-- AddForeignKey
ALTER TABLE "HrEmployeeType" ADD CONSTRAINT "HrEmployeeType_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HrWorkLocation" ADD CONSTRAINT "HrWorkLocation_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HrDepartureReason" ADD CONSTRAINT "HrDepartureReason_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HrWorkingSchedule" ADD CONSTRAINT "HrWorkingSchedule_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HrTimeType" ADD CONSTRAINT "HrTimeType_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HrJobPosition" ADD CONSTRAINT "HrJobPosition_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HrContractTemplate" ADD CONSTRAINT "HrContractTemplate_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
