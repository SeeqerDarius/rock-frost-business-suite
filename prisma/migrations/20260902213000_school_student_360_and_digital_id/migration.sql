CREATE TYPE "SchoolDigitalIdStatus" AS ENUM ('ACTIVE', 'REVOKED', 'EXPIRED');
CREATE TYPE "SchoolConductClassification" AS ENUM ('POSITIVE', 'NEGATIVE');
CREATE TYPE "SchoolConductSeverity" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');
CREATE TYPE "SchoolConductResolutionStatus" AS ENUM ('OPEN', 'FOLLOW_UP', 'RESOLVED', 'CLOSED');

ALTER TABLE "SchoolStudent"
  ADD COLUMN "nationality" TEXT,
  ADD COLUMN "bloodGroup" TEXT,
  ADD COLUMN "address" TEXT,
  ADD COLUMN "allergies" TEXT,
  ADD COLUMN "accessibilityNotes" TEXT,
  ADD COLUMN "boardingStatus" TEXT DEFAULT 'DAY',
  ADD COLUMN "photoOriginalData" TEXT;

ALTER TABLE "SchoolSettings"
  ADD COLUMN "idCardShowDateOfBirth" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "idCardShowEmergencyContact" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "idCardValidityMonths" INTEGER NOT NULL DEFAULT 12,
  ADD COLUMN "idCardPublicFields" JSONB;

CREATE TABLE "SchoolDigitalIdCard" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "studentId" TEXT NOT NULL,
  "publicId" TEXT NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "status" "SchoolDigitalIdStatus" NOT NULL DEFAULT 'ACTIVE',
  "issueDate" TIMESTAMP(3) NOT NULL,
  "expiryDate" TIMESTAMP(3) NOT NULL,
  "issuedById" TEXT NOT NULL,
  "revokedAt" TIMESTAMP(3),
  "revokedById" TEXT,
  "revocationReason" TEXT,
  "reissuedFromId" TEXT,
    "printedAt" TIMESTAMP(3),
    "printedById" TEXT,
  "printCount" INTEGER NOT NULL DEFAULT 0,
  "approvedPublicData" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SchoolDigitalIdCard_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SchoolConductRecord" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "campusId" TEXT NOT NULL,
  "studentId" TEXT NOT NULL,
  "occurredAt" TIMESTAMP(3) NOT NULL,
  "category" TEXT NOT NULL,
  "classification" "SchoolConductClassification" NOT NULL,
  "severity" "SchoolConductSeverity" NOT NULL,
  "description" TEXT NOT NULL,
  "reporterId" TEXT NOT NULL,
  "assignedReviewerId" TEXT,
  "actionTaken" TEXT,
  "followUpDate" TIMESTAMP(3),
  "resolution" TEXT,
  "resolutionStatus" "SchoolConductResolutionStatus" NOT NULL DEFAULT 'OPEN',
  "attachmentMetadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SchoolConductRecord_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SchoolStudentDocument" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "studentId" TEXT NOT NULL,
  "category" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "mimeType" TEXT NOT NULL,
  "sizeBytes" INTEGER NOT NULL,
  "storageKey" TEXT NOT NULL,
  "uploadedById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SchoolStudentDocument_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SchoolDigitalIdCard_publicId_key" ON "SchoolDigitalIdCard"("publicId");
CREATE UNIQUE INDEX "SchoolDigitalIdCard_tokenHash_key" ON "SchoolDigitalIdCard"("tokenHash");
CREATE INDEX "SchoolDigitalIdCard_organizationId_studentId_status_idx" ON "SchoolDigitalIdCard"("organizationId", "studentId", "status");
CREATE INDEX "SchoolDigitalIdCard_expiryDate_status_idx" ON "SchoolDigitalIdCard"("expiryDate", "status");
CREATE INDEX "SchoolConductRecord_organizationId_occurredAt_idx" ON "SchoolConductRecord"("organizationId", "occurredAt");
CREATE INDEX "SchoolConductRecord_campusId_resolutionStatus_idx" ON "SchoolConductRecord"("campusId", "resolutionStatus");
CREATE INDEX "SchoolConductRecord_studentId_occurredAt_idx" ON "SchoolConductRecord"("studentId", "occurredAt");
CREATE INDEX "SchoolStudentDocument_organizationId_studentId_category_idx" ON "SchoolStudentDocument"("organizationId", "studentId", "category");

ALTER TABLE "SchoolDigitalIdCard" ADD CONSTRAINT "SchoolDigitalIdCard_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SchoolDigitalIdCard" ADD CONSTRAINT "SchoolDigitalIdCard_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "SchoolStudent"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SchoolDigitalIdCard" ADD CONSTRAINT "SchoolDigitalIdCard_issuedById_fkey" FOREIGN KEY ("issuedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SchoolDigitalIdCard" ADD CONSTRAINT "SchoolDigitalIdCard_revokedById_fkey" FOREIGN KEY ("revokedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "SchoolDigitalIdCard" ADD CONSTRAINT "SchoolDigitalIdCard_printedById_fkey" FOREIGN KEY ("printedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "SchoolDigitalIdCard" ADD CONSTRAINT "SchoolDigitalIdCard_reissuedFromId_fkey" FOREIGN KEY ("reissuedFromId") REFERENCES "SchoolDigitalIdCard"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "SchoolConductRecord" ADD CONSTRAINT "SchoolConductRecord_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SchoolConductRecord" ADD CONSTRAINT "SchoolConductRecord_campusId_fkey" FOREIGN KEY ("campusId") REFERENCES "SchoolCampus"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SchoolConductRecord" ADD CONSTRAINT "SchoolConductRecord_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "SchoolStudent"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SchoolConductRecord" ADD CONSTRAINT "SchoolConductRecord_reporterId_fkey" FOREIGN KEY ("reporterId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SchoolConductRecord" ADD CONSTRAINT "SchoolConductRecord_assignedReviewerId_fkey" FOREIGN KEY ("assignedReviewerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "SchoolStudentDocument" ADD CONSTRAINT "SchoolStudentDocument_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SchoolStudentDocument" ADD CONSTRAINT "SchoolStudentDocument_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "SchoolStudent"("id") ON DELETE CASCADE ON UPDATE CASCADE;
