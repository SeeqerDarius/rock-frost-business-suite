ALTER TABLE "Organization"
  ADD COLUMN "deletionRequestedAt" TIMESTAMP(3),
  ADD COLUMN "deletionScheduledFor" TIMESTAMP(3),
  ADD COLUMN "deletionRequestedById" TEXT,
  ADD COLUMN "deletionPreviousStatus" "OrganizationStatus";

CREATE INDEX "Organization_deletionScheduledFor_idx" ON "Organization"("deletionScheduledFor");

ALTER TABLE "Organization"
  ADD CONSTRAINT "Organization_deletionRequestedById_fkey"
  FOREIGN KEY ("deletionRequestedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
