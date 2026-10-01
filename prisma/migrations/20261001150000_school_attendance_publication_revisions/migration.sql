CREATE TABLE "SchoolAttendanceRevision" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "attendanceId" TEXT NOT NULL,
    "changedById" TEXT NOT NULL,
    "changedByLabel" TEXT NOT NULL,
    "previousStatus" "SchoolAttendanceStatus" NOT NULL,
    "previousReason" TEXT,
    "newStatus" "SchoolAttendanceStatus" NOT NULL,
    "newReason" TEXT,
    "correctionReason" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SchoolAttendanceRevision_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "SchoolAttendanceRevision_organizationId_createdAt_idx"
    ON "SchoolAttendanceRevision"("organizationId", "createdAt");
CREATE INDEX "SchoolAttendanceRevision_attendanceId_createdAt_idx"
    ON "SchoolAttendanceRevision"("attendanceId", "createdAt");
CREATE INDEX "SchoolAttendanceRevision_changedById_createdAt_idx"
    ON "SchoolAttendanceRevision"("changedById", "createdAt");

ALTER TABLE "SchoolAttendanceRevision"
    ADD CONSTRAINT "SchoolAttendanceRevision_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SchoolAttendanceRevision"
    ADD CONSTRAINT "SchoolAttendanceRevision_attendanceId_fkey"
    FOREIGN KEY ("attendanceId") REFERENCES "SchoolAttendance"("id") ON DELETE CASCADE ON UPDATE CASCADE;
