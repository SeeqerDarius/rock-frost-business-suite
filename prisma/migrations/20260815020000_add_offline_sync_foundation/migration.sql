CREATE TYPE "OfflineDeviceStatus" AS ENUM ('ACTIVE', 'REVOKED');
CREATE TYPE "OfflineMutationStatus" AS ENUM ('PROCESSING', 'APPLIED', 'CONFLICT', 'REJECTED');
CREATE TYPE "OfflineConflictStatus" AS ENUM ('OPEN', 'RESOLVED');

CREATE TABLE "OfflineDevice" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "membershipId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "installationId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "status" "OfflineDeviceStatus" NOT NULL DEFAULT 'ACTIVE',
    "moduleKeys" TEXT[] NOT NULL,
    "tokenExpiresAt" TIMESTAMP(3) NOT NULL,
    "offlineAccessUntil" TIMESTAMP(3) NOT NULL,
    "lastSeenAt" TIMESTAMP(3),
    "lastSyncAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "revokedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "OfflineDevice_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "OfflineActivationCode" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "membershipId" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "moduleKeys" TEXT[] NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "OfflineActivationCode_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "OfflineMutation" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "mutationId" TEXT NOT NULL,
    "moduleKey" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "operation" TEXT NOT NULL,
    "baseVersion" INTEGER NOT NULL,
    "payload" JSONB NOT NULL,
    "status" "OfflineMutationStatus" NOT NULL DEFAULT 'PROCESSING',
    "result" JSONB,
    "errorCode" TEXT,
    "changedAt" TIMESTAMP(3) NOT NULL,
    "appliedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "OfflineMutation_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "OfflineConflict" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "mutationId" TEXT NOT NULL,
    "conflictType" TEXT NOT NULL,
    "cloudVersion" INTEGER,
    "cloudSnapshot" JSONB,
    "allowedResolutions" TEXT[] NOT NULL,
    "status" "OfflineConflictStatus" NOT NULL DEFAULT 'OPEN',
    "resolution" TEXT,
    "resolutionPayload" JSONB,
    "resolvedById" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "OfflineConflict_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "OfflineDevice_tokenHash_key" ON "OfflineDevice"("tokenHash");
CREATE UNIQUE INDEX "OfflineDevice_organizationId_installationId_key" ON "OfflineDevice"("organizationId", "installationId");
CREATE INDEX "OfflineDevice_organizationId_status_idx" ON "OfflineDevice"("organizationId", "status");
CREATE INDEX "OfflineDevice_userId_status_idx" ON "OfflineDevice"("userId", "status");
CREATE INDEX "OfflineDevice_membershipId_idx" ON "OfflineDevice"("membershipId");

CREATE UNIQUE INDEX "OfflineActivationCode_codeHash_key" ON "OfflineActivationCode"("codeHash");
CREATE INDEX "OfflineActivationCode_organizationId_userId_expiresAt_idx" ON "OfflineActivationCode"("organizationId", "userId", "expiresAt");
CREATE INDEX "OfflineActivationCode_membershipId_idx" ON "OfflineActivationCode"("membershipId");

CREATE UNIQUE INDEX "OfflineMutation_organizationId_mutationId_key" ON "OfflineMutation"("organizationId", "mutationId");
CREATE INDEX "OfflineMutation_deviceId_createdAt_idx" ON "OfflineMutation"("deviceId", "createdAt");
CREATE INDEX "OfflineMutation_organizationId_moduleKey_createdAt_idx" ON "OfflineMutation"("organizationId", "moduleKey", "createdAt");
CREATE INDEX "OfflineMutation_organizationId_status_idx" ON "OfflineMutation"("organizationId", "status");

CREATE UNIQUE INDEX "OfflineConflict_mutationId_key" ON "OfflineConflict"("mutationId");
CREATE INDEX "OfflineConflict_organizationId_status_createdAt_idx" ON "OfflineConflict"("organizationId", "status", "createdAt");
CREATE INDEX "OfflineConflict_deviceId_status_idx" ON "OfflineConflict"("deviceId", "status");

ALTER TABLE "OfflineDevice" ADD CONSTRAINT "OfflineDevice_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OfflineDevice" ADD CONSTRAINT "OfflineDevice_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OfflineDevice" ADD CONSTRAINT "OfflineDevice_membershipId_fkey" FOREIGN KEY ("membershipId") REFERENCES "OrganizationMember"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OfflineDevice" ADD CONSTRAINT "OfflineDevice_revokedById_fkey" FOREIGN KEY ("revokedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "OfflineActivationCode" ADD CONSTRAINT "OfflineActivationCode_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OfflineActivationCode" ADD CONSTRAINT "OfflineActivationCode_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OfflineActivationCode" ADD CONSTRAINT "OfflineActivationCode_membershipId_fkey" FOREIGN KEY ("membershipId") REFERENCES "OrganizationMember"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "OfflineMutation" ADD CONSTRAINT "OfflineMutation_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OfflineMutation" ADD CONSTRAINT "OfflineMutation_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "OfflineDevice"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OfflineMutation" ADD CONSTRAINT "OfflineMutation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "OfflineConflict" ADD CONSTRAINT "OfflineConflict_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OfflineConflict" ADD CONSTRAINT "OfflineConflict_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "OfflineDevice"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OfflineConflict" ADD CONSTRAINT "OfflineConflict_mutationId_fkey" FOREIGN KEY ("mutationId") REFERENCES "OfflineMutation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OfflineConflict" ADD CONSTRAINT "OfflineConflict_resolvedById_fkey" FOREIGN KEY ("resolvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
