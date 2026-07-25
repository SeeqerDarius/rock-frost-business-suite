CREATE TYPE "FleetMaintenanceEventType" AS ENUM (
  'SUBMITTED',
  'MANAGER_REVIEWED',
  'OWNER_APPROVED',
  'OWNER_REJECTED',
  'MECHANIC_ASSIGNED',
  'REPAIR_STARTED',
  'REPAIR_COMPLETED',
  'COMPLETION_VERIFIED',
  'OWNER_NOTIFIED',
  'CANCELLED'
);

ALTER TYPE "FleetPaymentType" ADD VALUE IF NOT EXISTS 'WEEKLY_SALES';

ALTER TABLE "FleetOwner"
  ADD COLUMN "userId" TEXT;

ALTER TABLE "FleetMaintenanceRequest"
  ADD COLUMN "ownerApprovalRequired" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "ownerNotifiedAt" TIMESTAMP(3);

CREATE TABLE "FleetMaintenanceEvent" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "requestId" TEXT NOT NULL,
  "actorId" TEXT,
  "eventType" "FleetMaintenanceEventType" NOT NULL,
  "fromStatus" "FleetMaintenanceProgressStatus",
  "toStatus" "FleetMaintenanceProgressStatus",
  "note" TEXT,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "FleetMaintenanceEvent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "FleetOwner_organizationId_userId_key"
  ON "FleetOwner"("organizationId", "userId");
CREATE INDEX "FleetOwner_userId_idx" ON "FleetOwner"("userId");
CREATE INDEX "FleetMaintenanceEvent_organizationId_createdAt_idx"
  ON "FleetMaintenanceEvent"("organizationId", "createdAt");
CREATE INDEX "FleetMaintenanceEvent_requestId_createdAt_idx"
  ON "FleetMaintenanceEvent"("requestId", "createdAt");
CREATE INDEX "FleetMaintenanceEvent_actorId_idx"
  ON "FleetMaintenanceEvent"("actorId");

ALTER TABLE "FleetOwner"
  ADD CONSTRAINT "FleetOwner_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "FleetMaintenanceEvent"
  ADD CONSTRAINT "FleetMaintenanceEvent_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FleetMaintenanceEvent"
  ADD CONSTRAINT "FleetMaintenanceEvent_requestId_fkey"
  FOREIGN KEY ("requestId") REFERENCES "FleetMaintenanceRequest"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FleetMaintenanceEvent"
  ADD CONSTRAINT "FleetMaintenanceEvent_actorId_fkey"
  FOREIGN KEY ("actorId") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
