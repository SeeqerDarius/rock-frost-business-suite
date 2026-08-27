-- CreateEnum
CREATE TYPE "TwoFactorMethod" AS ENUM ('TOTP', 'SMS');

-- CreateEnum
CREATE TYPE "TwoFactorOtpPurpose" AS ENUM ('LOGIN', 'ENROLL_VERIFY_PHONE', 'DISABLE');

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "phoneVerifiedAt" TIMESTAMP(3),
ADD COLUMN     "twoFactorMethod" "TwoFactorMethod",
ADD COLUMN     "twoFactorPhone" TEXT;

-- CreateTable
CREATE TABLE "TwoFactorOtpChallenge" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "purpose" "TwoFactorOtpPurpose" NOT NULL,
    "phone" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "consumedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TwoFactorOtpChallenge_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TwoFactorOtpChallenge_userId_purpose_consumedAt_createdAt_idx" ON "TwoFactorOtpChallenge"("userId", "purpose", "consumedAt", "createdAt");

-- AddForeignKey
ALTER TABLE "TwoFactorOtpChallenge" ADD CONSTRAINT "TwoFactorOtpChallenge_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
