-- CreateEnum
CREATE TYPE "HrResumeEntryType" AS ENUM ('EXPERIENCE', 'EDUCATION', 'INTERNAL');

-- CreateTable
CREATE TABLE "HrResumeEntry" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "type" "HrResumeEntryType" NOT NULL,
    "dateStart" TIMESTAMP(3) NOT NULL,
    "dateEnd" TIMESTAMP(3),
    "description" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HrResumeEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "HrResumeEntry_organizationId_employeeId_idx" ON "HrResumeEntry"("organizationId", "employeeId");

-- AddForeignKey
ALTER TABLE "HrResumeEntry" ADD CONSTRAINT "HrResumeEntry_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HrResumeEntry" ADD CONSTRAINT "HrResumeEntry_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "HrEmployee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
