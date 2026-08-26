-- CreateTable
CREATE TABLE "UserTourProgress" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tourKey" TEXT NOT NULL,
    "completedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserTourProgress_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "UserTourProgress_userId_idx" ON "UserTourProgress"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "UserTourProgress_userId_tourKey_key" ON "UserTourProgress"("userId", "tourKey");

-- AddForeignKey
ALTER TABLE "UserTourProgress" ADD CONSTRAINT "UserTourProgress_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
