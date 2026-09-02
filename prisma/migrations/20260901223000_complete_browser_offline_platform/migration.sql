ALTER TABLE "OfflineDevice" ADD COLUMN "signingPublicKey" JSONB;
ALTER TABLE "InventoryCountLine" ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

CREATE TYPE "OfflineAttachmentStatus" AS ENUM ('STAGED', 'CONSUMED', 'REJECTED');

CREATE TABLE "OfflineAttachmentUpload" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "deviceId" TEXT NOT NULL,
  "clientId" TEXT NOT NULL,
  "moduleKey" TEXT NOT NULL,
  "fileName" TEXT NOT NULL,
  "mimeType" TEXT NOT NULL,
  "size" INTEGER NOT NULL,
  "sha256" TEXT NOT NULL,
  "data" BYTEA NOT NULL,
  "status" "OfflineAttachmentStatus" NOT NULL DEFAULT 'STAGED',
  "consumedAt" TIMESTAMP(3),
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "OfflineAttachmentUpload_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "OfflineDraft" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "moduleKey" TEXT NOT NULL,
  "entityType" TEXT NOT NULL,
  "entityId" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "payload" JSONB NOT NULL,
  "sourceMutationId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "OfflineDraft_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "OfflineAttachmentUpload_organizationId_clientId_key" ON "OfflineAttachmentUpload"("organizationId", "clientId");
CREATE INDEX "OfflineAttachmentUpload_deviceId_status_expiresAt_idx" ON "OfflineAttachmentUpload"("deviceId", "status", "expiresAt");
CREATE INDEX "OfflineAttachmentUpload_organizationId_moduleKey_createdAt_idx" ON "OfflineAttachmentUpload"("organizationId", "moduleKey", "createdAt");
CREATE UNIQUE INDEX "OfflineDraft_sourceMutationId_key" ON "OfflineDraft"("sourceMutationId");
CREATE INDEX "OfflineDraft_organizationId_moduleKey_createdAt_idx" ON "OfflineDraft"("organizationId", "moduleKey", "createdAt");
CREATE INDEX "OfflineDraft_userId_createdAt_idx" ON "OfflineDraft"("userId", "createdAt");

ALTER TABLE "OfflineAttachmentUpload" ADD CONSTRAINT "OfflineAttachmentUpload_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OfflineAttachmentUpload" ADD CONSTRAINT "OfflineAttachmentUpload_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OfflineAttachmentUpload" ADD CONSTRAINT "OfflineAttachmentUpload_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "OfflineDevice"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OfflineDraft" ADD CONSTRAINT "OfflineDraft_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OfflineDraft" ADD CONSTRAINT "OfflineDraft_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
