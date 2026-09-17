-- AlterTable
ALTER TABLE "Organization" ADD COLUMN     "schoolPortalGranted" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "schoolPortalGrantedAt" TIMESTAMP(3),
ADD COLUMN     "schoolPortalGrantedById" TEXT,
ADD COLUMN     "smsNotificationsGranted" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "smsNotificationsGrantedAt" TIMESTAMP(3),
ADD COLUMN     "smsNotificationsGrantedById" TEXT;
