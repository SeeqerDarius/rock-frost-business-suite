CREATE TYPE "ModuleRequestType" AS ENUM (
  'ENABLE_EXISTING',
  'CUSTOMIZE_EXISTING',
  'CUSTOM_MODULE',
  'INTEGRATION',
  'DATA_MIGRATION'
);

CREATE TYPE "ModuleRequestStatus" AS ENUM (
  'SUBMITTED',
  'UNDER_REVIEW',
  'NEEDS_INFORMATION',
  'QUOTED',
  'APPROVED',
  'REJECTED',
  'IMPLEMENTING',
  'READY',
  'COMPLETED',
  'CANCELLED'
);

CREATE TYPE "ModuleRequestPriority" AS ENUM ('LOW', 'NORMAL', 'HIGH', 'URGENT');
CREATE TYPE "ContactSubmissionStatus" AS ENUM ('NEW', 'LINKED', 'RESOLVED', 'SPAM');

ALTER TABLE "ContactSubmission"
  ADD COLUMN "status" "ContactSubmissionStatus" NOT NULL DEFAULT 'NEW',
  ADD COLUMN "organizationId" TEXT,
  ADD COLUMN "assignedToId" TEXT,
  ADD COLUMN "resolvedAt" TIMESTAMP(3),
  ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

CREATE TABLE "ModuleRequest" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "moduleId" TEXT,
  "requestedById" TEXT NOT NULL,
  "assignedToId" TEXT,
  "contactSubmissionId" TEXT,
  "type" "ModuleRequestType" NOT NULL,
  "status" "ModuleRequestStatus" NOT NULL DEFAULT 'SUBMITTED',
  "priority" "ModuleRequestPriority" NOT NULL DEFAULT 'NORMAL',
  "title" TEXT NOT NULL,
  "businessJustification" TEXT NOT NULL,
  "customizationDetails" TEXT,
  "expectedUsers" INTEGER,
  "externalReference" TEXT,
  "decisionReason" TEXT,
  "approvedAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ModuleRequest_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ModuleRequestEvent" (
  "id" TEXT NOT NULL,
  "moduleRequestId" TEXT NOT NULL,
  "authorId" TEXT,
  "fromStatus" "ModuleRequestStatus",
  "toStatus" "ModuleRequestStatus",
  "note" TEXT,
  "isInternal" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ModuleRequestEvent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ModuleRequest_contactSubmissionId_key" ON "ModuleRequest"("contactSubmissionId");
CREATE INDEX "ModuleRequest_organizationId_status_idx" ON "ModuleRequest"("organizationId", "status");
CREATE INDEX "ModuleRequest_moduleId_idx" ON "ModuleRequest"("moduleId");
CREATE INDEX "ModuleRequest_requestedById_idx" ON "ModuleRequest"("requestedById");
CREATE INDEX "ModuleRequest_assignedToId_status_idx" ON "ModuleRequest"("assignedToId", "status");
CREATE INDEX "ModuleRequest_createdAt_idx" ON "ModuleRequest"("createdAt");
CREATE INDEX "ModuleRequestEvent_moduleRequestId_createdAt_idx" ON "ModuleRequestEvent"("moduleRequestId", "createdAt");
CREATE INDEX "ModuleRequestEvent_authorId_idx" ON "ModuleRequestEvent"("authorId");
CREATE INDEX "ContactSubmission_status_createdAt_idx" ON "ContactSubmission"("status", "createdAt");
CREATE INDEX "ContactSubmission_organizationId_idx" ON "ContactSubmission"("organizationId");
CREATE INDEX "ContactSubmission_assignedToId_idx" ON "ContactSubmission"("assignedToId");

ALTER TABLE "ModuleRequest"
  ADD CONSTRAINT "ModuleRequest_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ModuleRequest"
  ADD CONSTRAINT "ModuleRequest_moduleId_fkey"
  FOREIGN KEY ("moduleId") REFERENCES "Module"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ModuleRequest"
  ADD CONSTRAINT "ModuleRequest_requestedById_fkey"
  FOREIGN KEY ("requestedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ModuleRequest"
  ADD CONSTRAINT "ModuleRequest_assignedToId_fkey"
  FOREIGN KEY ("assignedToId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ModuleRequest"
  ADD CONSTRAINT "ModuleRequest_contactSubmissionId_fkey"
  FOREIGN KEY ("contactSubmissionId") REFERENCES "ContactSubmission"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ModuleRequestEvent"
  ADD CONSTRAINT "ModuleRequestEvent_moduleRequestId_fkey"
  FOREIGN KEY ("moduleRequestId") REFERENCES "ModuleRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ModuleRequestEvent"
  ADD CONSTRAINT "ModuleRequestEvent_authorId_fkey"
  FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ContactSubmission"
  ADD CONSTRAINT "ContactSubmission_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ContactSubmission"
  ADD CONSTRAINT "ContactSubmission_assignedToId_fkey"
  FOREIGN KEY ("assignedToId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
