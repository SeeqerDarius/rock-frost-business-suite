-- AlterTable
ALTER TABLE "Organization" ADD COLUMN "offlineAccessGranted" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "offlineAccessGrantedAt" TIMESTAMP(3),
ADD COLUMN "offlineAccessGrantedById" TEXT;
