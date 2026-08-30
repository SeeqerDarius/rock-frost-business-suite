-- Every existing row keeps userId = NULL after this migration. That NULL is
-- the permanent "legacy conversation" marker: read-only, visible only through
-- the platform inbox and the new organization admin inbox. Postgres treats
-- multiple NULLs in a composite unique index as distinct values, so legacy
-- rows safely coexist with the new one-row-per-(organization, user) rows
-- created going forward.

-- AlterTable
ALTER TABLE "SupportConversation" ADD COLUMN "userId" TEXT;
ALTER TABLE "SupportConversation" ADD COLUMN "adminLastReadAt" TIMESTAMP(3);

-- DropIndex
ALTER TABLE "SupportConversation" DROP CONSTRAINT "SupportConversation_organizationId_key";

-- CreateIndex
CREATE UNIQUE INDEX "SupportConversation_organizationId_userId_key" ON "SupportConversation"("organizationId", "userId");

-- CreateIndex
CREATE INDEX "SupportConversation_organizationId_idx" ON "SupportConversation"("organizationId");

-- AddForeignKey
ALTER TABLE "SupportConversation" ADD CONSTRAINT "SupportConversation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AlterEnum
-- An organization-admin reply from the new org-scoped admin inbox, distinct
-- from the actual tenant participant (TENANT) and from Rock Frost platform
-- staff (PLATFORM). Not consumed by any statement in this same migration, so
-- adding it here is safe despite Postgres's same-transaction restriction.
ALTER TYPE "SupportSenderRole" ADD VALUE 'ADMIN';
