CREATE TABLE "SchoolStudentTransfer" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "academicYearId" TEXT NOT NULL,
    "sourceCampusId" TEXT NOT NULL,
    "targetCampusId" TEXT NOT NULL,
    "sourceClassId" TEXT NOT NULL,
    "targetClassId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "performedById" TEXT,
    "transferredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SchoolStudentTransfer_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "SchoolStudentTransfer_reason_nonempty_check" CHECK (length(trim("reason")) >= 5)
);
CREATE INDEX "SchoolStudentTransfer_organizationId_transferredAt_idx" ON "SchoolStudentTransfer"("organizationId", "transferredAt");
CREATE INDEX "SchoolStudentTransfer_studentId_transferredAt_idx" ON "SchoolStudentTransfer"("studentId", "transferredAt");
ALTER TABLE "SchoolStudentTransfer" ADD CONSTRAINT "SchoolStudentTransfer_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SchoolStudentTransfer" ADD CONSTRAINT "SchoolStudentTransfer_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "SchoolStudent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SchoolStudentTransfer" ADD CONSTRAINT "SchoolStudentTransfer_academicYearId_fkey" FOREIGN KEY ("academicYearId") REFERENCES "SchoolAcademicYear"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SchoolStudentTransfer" ADD CONSTRAINT "SchoolStudentTransfer_sourceCampusId_fkey" FOREIGN KEY ("sourceCampusId") REFERENCES "SchoolCampus"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SchoolStudentTransfer" ADD CONSTRAINT "SchoolStudentTransfer_targetCampusId_fkey" FOREIGN KEY ("targetCampusId") REFERENCES "SchoolCampus"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SchoolStudentTransfer" ADD CONSTRAINT "SchoolStudentTransfer_sourceClassId_fkey" FOREIGN KEY ("sourceClassId") REFERENCES "SchoolClass"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SchoolStudentTransfer" ADD CONSTRAINT "SchoolStudentTransfer_targetClassId_fkey" FOREIGN KEY ("targetClassId") REFERENCES "SchoolClass"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SchoolStudentTransfer" ADD CONSTRAINT "SchoolStudentTransfer_performedById_fkey" FOREIGN KEY ("performedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
