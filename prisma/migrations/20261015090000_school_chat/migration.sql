-- School chat (WhatsApp-style direct chats, groups, broadcast lists) and web push subscriptions. Additive only.
CREATE TYPE "SchoolChatType" AS ENUM ('DIRECT', 'GROUP');
CREATE TYPE "SchoolChatMemberRole" AS ENUM ('ADMIN', 'MEMBER');
CREATE TYPE "SchoolChatMessageKind" AS ENUM ('TEXT', 'ATTACHMENT', 'SYSTEM');
CREATE TYPE "SchoolChatBroadcastAudience" AS ENUM ('ALL_GUARDIANS', 'CLASS_GUARDIANS', 'ALL_STAFF', 'SELECTED');

CREATE TABLE "SchoolChat" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "type" "SchoolChatType" NOT NULL,
    "name" TEXT,
    "description" TEXT,
    "directKey" TEXT,
    "studentId" TEXT,
    "classId" TEXT,
    "onlyAdminsCanPost" BOOLEAN NOT NULL DEFAULT false,
    "createdById" TEXT NOT NULL,
    "lastMessageAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "SchoolChat_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "SchoolChat_type_check" CHECK (("type" = 'DIRECT' AND "directKey" IS NOT NULL) OR ("type" = 'GROUP' AND "directKey" IS NULL AND "name" IS NOT NULL AND char_length(btrim("name")) BETWEEN 2 AND 80)),
    CONSTRAINT "SchoolChat_description_check" CHECK ("description" IS NULL OR char_length("description") <= 500)
);

CREATE TABLE "SchoolChatMember" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "chatId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "side" "SchoolMessageSenderSide" NOT NULL,
    "role" "SchoolChatMemberRole" NOT NULL DEFAULT 'MEMBER',
    "displayName" TEXT NOT NULL,
    "addedById" TEXT,
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "leftAt" TIMESTAMP(3),
    "lastReadAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "mutedUntil" TIMESTAMP(3),
    "pinnedAt" TIMESTAMP(3),
    "archivedAt" TIMESTAMP(3),
    CONSTRAINT "SchoolChatMember_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "SchoolChatMember_guardian_role_check" CHECK ("side" = 'STAFF' OR "role" = 'MEMBER')
);

CREATE TABLE "SchoolChatMessage" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "chatId" TEXT NOT NULL,
    "senderUserId" TEXT,
    "senderSide" "SchoolMessageSenderSide",
    "senderName" TEXT NOT NULL,
    "kind" "SchoolChatMessageKind" NOT NULL DEFAULT 'TEXT',
    "body" TEXT NOT NULL DEFAULT '',
    "replyToId" TEXT,
    "attachmentAssetId" TEXT,
    "attachmentName" TEXT,
    "attachmentMimeType" TEXT,
    "attachmentSize" INTEGER,
    "broadcastId" TEXT,
    "editedAt" TIMESTAMP(3),
    "deletedAt" TIMESTAMP(3),
    "deletedById" TEXT,
    "clientRequestId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SchoolChatMessage_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "SchoolChatMessage_body_check" CHECK (char_length("body") <= 4000),
    CONSTRAINT "SchoolChatMessage_kind_check" CHECK (
      ("kind" = 'TEXT' AND "senderUserId" IS NOT NULL AND ("deletedAt" IS NOT NULL OR char_length(btrim("body")) >= 1))
      OR ("kind" = 'ATTACHMENT' AND "senderUserId" IS NOT NULL AND ("deletedAt" IS NOT NULL OR "attachmentAssetId" IS NOT NULL))
      OR ("kind" = 'SYSTEM' AND "senderUserId" IS NULL)
    ),
    CONSTRAINT "SchoolChatMessage_attachment_size_check" CHECK ("attachmentSize" IS NULL OR ("attachmentSize" > 0 AND "attachmentSize" <= 4194304))
);

CREATE TABLE "SchoolChatReaction" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "emoji" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SchoolChatReaction_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "SchoolChatReaction_emoji_check" CHECK (char_length("emoji") BETWEEN 1 AND 16)
);

CREATE TABLE "SchoolChatBroadcast" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "senderUserId" TEXT NOT NULL,
    "audience" "SchoolChatBroadcastAudience" NOT NULL,
    "classId" TEXT,
    "body" TEXT NOT NULL,
    "recipientCount" INTEGER NOT NULL,
    "clientRequestId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SchoolChatBroadcast_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "SchoolChatBroadcast_body_check" CHECK (char_length(btrim("body")) BETWEEN 1 AND 4000),
    CONSTRAINT "SchoolChatBroadcast_class_check" CHECK (("audience" = 'CLASS_GUARDIANS') = ("classId" IS NOT NULL))
);

CREATE TABLE "WebPushSubscription" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "endpoint" TEXT NOT NULL,
    "p256dh" TEXT NOT NULL,
    "auth" TEXT NOT NULL,
    "userAgent" TEXT,
    "failureCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastUsedAt" TIMESTAMP(3),
    CONSTRAINT "WebPushSubscription_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SchoolChat_organizationId_id_key" ON "SchoolChat"("organizationId", "id");
CREATE UNIQUE INDEX "SchoolChat_organizationId_directKey_key" ON "SchoolChat"("organizationId", "directKey");
CREATE INDEX "SchoolChat_organizationId_lastMessageAt_idx" ON "SchoolChat"("organizationId", "lastMessageAt");
CREATE UNIQUE INDEX "SchoolChatMember_chatId_userId_key" ON "SchoolChatMember"("chatId", "userId");
CREATE INDEX "SchoolChatMember_organizationId_userId_leftAt_idx" ON "SchoolChatMember"("organizationId", "userId", "leftAt");
CREATE UNIQUE INDEX "SchoolChatMessage_chatId_clientRequestId_key" ON "SchoolChatMessage"("chatId", "clientRequestId");
CREATE INDEX "SchoolChatMessage_organizationId_chatId_createdAt_idx" ON "SchoolChatMessage"("organizationId", "chatId", "createdAt");
CREATE INDEX "SchoolChatMessage_organizationId_broadcastId_idx" ON "SchoolChatMessage"("organizationId", "broadcastId");
CREATE UNIQUE INDEX "SchoolChatReaction_messageId_userId_key" ON "SchoolChatReaction"("messageId", "userId");
CREATE INDEX "SchoolChatReaction_organizationId_messageId_idx" ON "SchoolChatReaction"("organizationId", "messageId");
CREATE UNIQUE INDEX "SchoolChatBroadcast_organizationId_clientRequestId_key" ON "SchoolChatBroadcast"("organizationId", "clientRequestId");
CREATE INDEX "SchoolChatBroadcast_organizationId_createdAt_idx" ON "SchoolChatBroadcast"("organizationId", "createdAt");
CREATE UNIQUE INDEX "WebPushSubscription_endpoint_key" ON "WebPushSubscription"("endpoint");
CREATE INDEX "WebPushSubscription_userId_idx" ON "WebPushSubscription"("userId");

ALTER TABLE "SchoolChat" ADD CONSTRAINT "SchoolChat_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SchoolChat" ADD CONSTRAINT "SchoolChat_organizationId_studentId_fkey" FOREIGN KEY ("organizationId", "studentId") REFERENCES "SchoolStudent"("organizationId", "id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "SchoolChat" ADD CONSTRAINT "SchoolChat_organizationId_classId_fkey" FOREIGN KEY ("organizationId", "classId") REFERENCES "SchoolClass"("organizationId", "id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "SchoolChatMember" ADD CONSTRAINT "SchoolChatMember_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SchoolChatMember" ADD CONSTRAINT "SchoolChatMember_organizationId_chatId_fkey" FOREIGN KEY ("organizationId", "chatId") REFERENCES "SchoolChat"("organizationId", "id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SchoolChatMessage" ADD CONSTRAINT "SchoolChatMessage_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SchoolChatMessage" ADD CONSTRAINT "SchoolChatMessage_organizationId_chatId_fkey" FOREIGN KEY ("organizationId", "chatId") REFERENCES "SchoolChat"("organizationId", "id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SchoolChatMessage" ADD CONSTRAINT "SchoolChatMessage_replyToId_fkey" FOREIGN KEY ("replyToId") REFERENCES "SchoolChatMessage"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "SchoolChatReaction" ADD CONSTRAINT "SchoolChatReaction_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SchoolChatReaction" ADD CONSTRAINT "SchoolChatReaction_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "SchoolChatMessage"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SchoolChatBroadcast" ADD CONSTRAINT "SchoolChatBroadcast_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SchoolChatBroadcast" ADD CONSTRAINT "SchoolChatBroadcast_organizationId_classId_fkey" FOREIGN KEY ("organizationId", "classId") REFERENCES "SchoolClass"("organizationId", "id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "WebPushSubscription" ADD CONSTRAINT "WebPushSubscription_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Carry over the student-anchored conversations from 20261014090000 as
-- group chats (same ids), with the guardian and every staff sender as
-- members. The old tables stay in place (unused) so nothing is dropped.
INSERT INTO "SchoolChat" ("id", "organizationId", "type", "name", "studentId", "createdById", "lastMessageAt", "createdAt", "updatedAt")
SELECT c."id", c."organizationId", 'GROUP', left(btrim(c."subject"), 80), c."studentId", c."createdById", c."lastMessageAt", c."createdAt", c."updatedAt"
FROM "SchoolConversation" c
WHERE char_length(btrim(c."subject")) >= 2;

INSERT INTO "SchoolChatMember" ("id", "organizationId", "chatId", "userId", "side", "role", "displayName", "joinedAt", "lastReadAt")
SELECT 'mig' || md5(c."id" || g."userId"), c."organizationId", c."id", g."userId", 'GUARDIAN', 'MEMBER', left(g."firstName" || ' ' || g."lastName", 120), c."createdAt",
       COALESCE((SELECT r."lastReadAt" FROM "SchoolConversationReadState" r WHERE r."conversationId" = c."id" AND r."userId" = g."userId"), c."createdAt")
FROM "SchoolConversation" c
JOIN "SchoolGuardian" g ON g."id" = c."guardianId" AND g."organizationId" = c."organizationId"
JOIN "SchoolChat" sc ON sc."id" = c."id"
WHERE g."userId" IS NOT NULL
ON CONFLICT ("chatId", "userId") DO NOTHING;

INSERT INTO "SchoolChatMember" ("id", "organizationId", "chatId", "userId", "side", "role", "displayName", "joinedAt", "lastReadAt")
SELECT DISTINCT ON (m."conversationId", m."senderUserId") 'mig' || md5(m."conversationId" || m."senderUserId"), m."organizationId", m."conversationId", m."senderUserId", 'STAFF', 'ADMIN', left(m."senderName", 120), m."createdAt",
       COALESCE((SELECT r."lastReadAt" FROM "SchoolConversationReadState" r WHERE r."conversationId" = m."conversationId" AND r."userId" = m."senderUserId"), m."createdAt")
FROM "SchoolMessage" m
JOIN "SchoolChat" sc ON sc."id" = m."conversationId"
WHERE m."senderSide" = 'STAFF'
ORDER BY m."conversationId", m."senderUserId", m."createdAt"
ON CONFLICT ("chatId", "userId") DO NOTHING;

INSERT INTO "SchoolChatMessage" ("id", "organizationId", "chatId", "senderUserId", "senderSide", "senderName", "kind", "body", "clientRequestId", "createdAt")
SELECT m."id", m."organizationId", m."conversationId", m."senderUserId", m."senderSide", m."senderName", 'TEXT', m."body", m."clientRequestId", m."createdAt"
FROM "SchoolMessage" m
JOIN "SchoolChat" sc ON sc."id" = m."conversationId"
ON CONFLICT DO NOTHING;
