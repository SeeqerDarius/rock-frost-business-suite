-- AlterTable
ALTER TABLE "SchoolGuardian" ADD COLUMN     "userId" TEXT;

-- AlterTable
ALTER TABLE "SchoolSettings" ADD COLUMN     "smsNotificationsEnabled" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "SchoolStudent" ADD COLUMN     "userId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "SchoolGuardian_userId_key" ON "SchoolGuardian"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "SchoolStudent_userId_key" ON "SchoolStudent"("userId");

-- AddForeignKey
ALTER TABLE "SchoolGuardian" ADD CONSTRAINT "SchoolGuardian_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SchoolStudent" ADD CONSTRAINT "SchoolStudent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
