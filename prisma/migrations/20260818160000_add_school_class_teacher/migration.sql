-- Restricts a teacher-role user to only the class(es) they're explicitly
-- assigned here when they record attendance or exam results (see
-- resolveTeacherClassScope in src/modules/school/service.ts). A user with
-- no rows in this table is unrestricted. Purely additive: no existing
-- table or column is touched.
CREATE TABLE "SchoolClassTeacher" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "classId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SchoolClassTeacher_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SchoolClassTeacher_classId_userId_key" ON "SchoolClassTeacher"("classId", "userId");

CREATE INDEX "SchoolClassTeacher_organizationId_userId_idx" ON "SchoolClassTeacher"("organizationId", "userId");

ALTER TABLE "SchoolClassTeacher" ADD CONSTRAINT "SchoolClassTeacher_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "SchoolClassTeacher" ADD CONSTRAINT "SchoolClassTeacher_classId_fkey" FOREIGN KEY ("classId") REFERENCES "SchoolClass"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "SchoolClassTeacher" ADD CONSTRAINT "SchoolClassTeacher_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
