-- School in-app communications (additive only).
CREATE TYPE "SchoolConversationStatus" AS ENUM ('OPEN', 'CLOSED');
CREATE TYPE "SchoolMessageSenderSide" AS ENUM ('STAFF', 'GUARDIAN');
CREATE TYPE "SchoolAnnouncementAudience" AS ENUM ('STAFF', 'ALL_GUARDIANS', 'CLASS_GUARDIANS', 'EVERYONE');

ALTER TABLE "Organization" ADD COLUMN "schoolGuardianMessagingGranted" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Organization" ADD COLUMN "schoolGuardianMessagingGrantedAt" TIMESTAMP(3);
ALTER TABLE "Organization" ADD COLUMN "schoolGuardianMessagingGrantedById" TEXT;

-- Composite keys so new rows can only reference records in their own organization.
CREATE UNIQUE INDEX "SchoolStudent_organizationId_id_key" ON "SchoolStudent"("organizationId", "id");
CREATE UNIQUE INDEX "SchoolGuardian_organizationId_id_key" ON "SchoolGuardian"("organizationId", "id");
CREATE UNIQUE INDEX "SchoolClass_organizationId_id_key" ON "SchoolClass"("organizationId", "id");

CREATE TABLE "SchoolConversation" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "guardianId" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "status" "SchoolConversationStatus" NOT NULL DEFAULT 'OPEN',
    "startedBySide" "SchoolMessageSenderSide" NOT NULL,
    "createdById" TEXT NOT NULL,
    "lastMessageAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "SchoolConversation_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "SchoolConversation_subject_check" CHECK (char_length(btrim("subject")) BETWEEN 2 AND 120)
);

CREATE TABLE "SchoolMessage" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "senderUserId" TEXT NOT NULL,
    "senderSide" "SchoolMessageSenderSide" NOT NULL,
    "senderName" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "clientRequestId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SchoolMessage_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "SchoolMessage_body_check" CHECK (char_length(btrim("body")) BETWEEN 1 AND 4000)
);

CREATE TABLE "SchoolConversationReadState" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "lastReadAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SchoolConversationReadState_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SchoolAnnouncement" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "audience" "SchoolAnnouncementAudience" NOT NULL,
    "classId" TEXT,
    "publishedById" TEXT NOT NULL,
    "publishedByName" TEXT NOT NULL,
    "clientRequestId" TEXT NOT NULL,
    "publishedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "withdrawnAt" TIMESTAMP(3),
    "withdrawnById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "SchoolAnnouncement_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "SchoolAnnouncement_title_check" CHECK (char_length(btrim("title")) BETWEEN 2 AND 120),
    CONSTRAINT "SchoolAnnouncement_body_check" CHECK (char_length(btrim("body")) BETWEEN 1 AND 4000),
    CONSTRAINT "SchoolAnnouncement_audience_class_check" CHECK (("audience" = 'CLASS_GUARDIANS') = ("classId" IS NOT NULL))
);

CREATE TABLE "SchoolAnnouncementRead" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "announcementId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "readAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SchoolAnnouncementRead_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SchoolConversation_organizationId_id_key" ON "SchoolConversation"("organizationId", "id");
CREATE INDEX "SchoolConversation_organizationId_guardianId_lastMessageAt_idx" ON "SchoolConversation"("organizationId", "guardianId", "lastMessageAt");
CREATE INDEX "SchoolConversation_organizationId_studentId_idx" ON "SchoolConversation"("organizationId", "studentId");
CREATE INDEX "SchoolConversation_organizationId_lastMessageAt_idx" ON "SchoolConversation"("organizationId", "lastMessageAt");
CREATE UNIQUE INDEX "SchoolMessage_conversationId_clientRequestId_key" ON "SchoolMessage"("conversationId", "clientRequestId");
CREATE INDEX "SchoolMessage_organizationId_conversationId_createdAt_idx" ON "SchoolMessage"("organizationId", "conversationId", "createdAt");
CREATE UNIQUE INDEX "SchoolConversationReadState_conversationId_userId_key" ON "SchoolConversationReadState"("conversationId", "userId");
CREATE INDEX "SchoolConversationReadState_organizationId_userId_idx" ON "SchoolConversationReadState"("organizationId", "userId");
CREATE UNIQUE INDEX "SchoolAnnouncement_organizationId_id_key" ON "SchoolAnnouncement"("organizationId", "id");
CREATE UNIQUE INDEX "SchoolAnnouncement_organizationId_clientRequestId_key" ON "SchoolAnnouncement"("organizationId", "clientRequestId");
CREATE INDEX "SchoolAnnouncement_organizationId_publishedAt_idx" ON "SchoolAnnouncement"("organizationId", "publishedAt");
CREATE INDEX "SchoolAnnouncement_organizationId_classId_idx" ON "SchoolAnnouncement"("organizationId", "classId");
CREATE UNIQUE INDEX "SchoolAnnouncementRead_announcementId_userId_key" ON "SchoolAnnouncementRead"("announcementId", "userId");
CREATE INDEX "SchoolAnnouncementRead_organizationId_userId_idx" ON "SchoolAnnouncementRead"("organizationId", "userId");

ALTER TABLE "SchoolConversation" ADD CONSTRAINT "SchoolConversation_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SchoolConversation" ADD CONSTRAINT "SchoolConversation_organizationId_studentId_fkey" FOREIGN KEY ("organizationId", "studentId") REFERENCES "SchoolStudent"("organizationId", "id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SchoolConversation" ADD CONSTRAINT "SchoolConversation_organizationId_guardianId_fkey" FOREIGN KEY ("organizationId", "guardianId") REFERENCES "SchoolGuardian"("organizationId", "id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SchoolMessage" ADD CONSTRAINT "SchoolMessage_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SchoolMessage" ADD CONSTRAINT "SchoolMessage_organizationId_conversationId_fkey" FOREIGN KEY ("organizationId", "conversationId") REFERENCES "SchoolConversation"("organizationId", "id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SchoolConversationReadState" ADD CONSTRAINT "SchoolConversationReadState_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SchoolConversationReadState" ADD CONSTRAINT "SchoolConversationReadState_organizationId_conversationId_fkey" FOREIGN KEY ("organizationId", "conversationId") REFERENCES "SchoolConversation"("organizationId", "id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SchoolAnnouncement" ADD CONSTRAINT "SchoolAnnouncement_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SchoolAnnouncement" ADD CONSTRAINT "SchoolAnnouncement_organizationId_classId_fkey" FOREIGN KEY ("organizationId", "classId") REFERENCES "SchoolClass"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SchoolAnnouncementRead" ADD CONSTRAINT "SchoolAnnouncementRead_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SchoolAnnouncementRead" ADD CONSTRAINT "SchoolAnnouncementRead_organizationId_announcementId_fkey" FOREIGN KEY ("organizationId", "announcementId") REFERENCES "SchoolAnnouncement"("organizationId", "id") ON DELETE CASCADE ON UPDATE CASCADE;
