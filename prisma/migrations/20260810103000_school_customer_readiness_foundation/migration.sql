-- Customer-readiness foundation for School student lifecycle and repeatable billing.
CREATE TABLE "SchoolFeeStructure" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "campusId" TEXT NOT NULL,
  "academicYearId" TEXT NOT NULL,
  "termId" TEXT,
  "classId" TEXT,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "amount" DECIMAL(12,2) NOT NULL,
  "dueDate" TIMESTAMP(3),
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SchoolFeeStructure_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SchoolStudentLifecycleEvent" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "studentId" TEXT NOT NULL,
  "fromStatus" "SchoolStudentStatus" NOT NULL,
  "toStatus" "SchoolStudentStatus" NOT NULL,
  "reason" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SchoolStudentLifecycleEvent_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "SchoolFeeInvoice" ADD COLUMN "feeStructureId" TEXT;

CREATE UNIQUE INDEX "SchoolFeeStructure_organizationId_academicYearId_termId_classId_name_key"
  ON "SchoolFeeStructure"("organizationId", "academicYearId", "termId", "classId", "name");
CREATE INDEX "SchoolFeeStructure_organizationId_active_idx" ON "SchoolFeeStructure"("organizationId", "active");
CREATE INDEX "SchoolFeeStructure_campusId_academicYearId_idx" ON "SchoolFeeStructure"("campusId", "academicYearId");
CREATE UNIQUE INDEX "SchoolFeeInvoice_feeStructureId_studentId_key" ON "SchoolFeeInvoice"("feeStructureId", "studentId");
CREATE INDEX "SchoolStudentLifecycleEvent_organizationId_createdAt_idx" ON "SchoolStudentLifecycleEvent"("organizationId", "createdAt");
CREATE INDEX "SchoolStudentLifecycleEvent_studentId_createdAt_idx" ON "SchoolStudentLifecycleEvent"("studentId", "createdAt");

ALTER TABLE "SchoolFeeStructure"
  ADD CONSTRAINT "SchoolFeeStructure_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "SchoolFeeStructure_campusId_fkey" FOREIGN KEY ("campusId") REFERENCES "SchoolCampus"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "SchoolFeeStructure_academicYearId_fkey" FOREIGN KEY ("academicYearId") REFERENCES "SchoolAcademicYear"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "SchoolFeeStructure_termId_fkey" FOREIGN KEY ("termId") REFERENCES "SchoolTerm"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "SchoolFeeStructure_classId_fkey" FOREIGN KEY ("classId") REFERENCES "SchoolClass"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "SchoolFeeStructure_amount_check" CHECK ("amount" > 0);

ALTER TABLE "SchoolFeeInvoice"
  ADD CONSTRAINT "SchoolFeeInvoice_feeStructureId_fkey" FOREIGN KEY ("feeStructureId") REFERENCES "SchoolFeeStructure"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "SchoolStudentLifecycleEvent"
  ADD CONSTRAINT "SchoolStudentLifecycleEvent_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "SchoolStudentLifecycleEvent_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "SchoolStudent"("id") ON DELETE CASCADE ON UPDATE CASCADE;
