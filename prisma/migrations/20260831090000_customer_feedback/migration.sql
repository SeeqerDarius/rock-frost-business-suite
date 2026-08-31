CREATE TYPE "CustomerFeedbackCategory" AS ENUM ('TESTIMONIAL', 'SUGGESTION', 'PROBLEM', 'GENERAL');
CREATE TYPE "CustomerFeedbackStatus" AS ENUM ('SUBMITTED', 'UNDER_REVIEW', 'APPROVED', 'PUBLISHED', 'REJECTED', 'HIDDEN', 'WITHDRAWN');

CREATE TABLE "CustomerFeedback" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "category" "CustomerFeedbackCategory" NOT NULL,
  "rating" INTEGER NOT NULL,
  "title" TEXT NOT NULL,
  "message" TEXT NOT NULL,
  "jobTitleSnapshot" TEXT,
  "submitterNameSnapshot" TEXT NOT NULL,
  "organizationNameSnapshot" TEXT NOT NULL,
  "consentToPublish" BOOLEAN NOT NULL DEFAULT false,
  "consentDisplayName" BOOLEAN NOT NULL DEFAULT false,
  "consentDisplayOrganization" BOOLEAN NOT NULL DEFAULT false,
  "consentDisplayLogo" BOOLEAN NOT NULL DEFAULT false,
  "status" "CustomerFeedbackStatus" NOT NULL DEFAULT 'SUBMITTED',
  "publishedMessage" TEXT,
  "moderationNote" TEXT,
  "displayPerson" BOOLEAN NOT NULL DEFAULT false,
  "displayOrganization" BOOLEAN NOT NULL DEFAULT false,
  "displayLogo" BOOLEAN NOT NULL DEFAULT false,
  "publicationOrder" INTEGER NOT NULL DEFAULT 0,
  "reviewedById" TEXT,
  "reviewedAt" TIMESTAMP(3),
  "publishedAt" TIMESTAMP(3),
  "withdrawnAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CustomerFeedback_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CustomerFeedbackEvent" (
  "id" TEXT NOT NULL,
  "feedbackId" TEXT NOT NULL,
  "actorId" TEXT,
  "fromStatus" "CustomerFeedbackStatus",
  "toStatus" "CustomerFeedbackStatus" NOT NULL,
  "note" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CustomerFeedbackEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "CustomerFeedback_organizationId_createdAt_idx" ON "CustomerFeedback"("organizationId", "createdAt");
CREATE INDEX "CustomerFeedback_userId_createdAt_idx" ON "CustomerFeedback"("userId", "createdAt");
CREATE INDEX "CustomerFeedback_status_publicationOrder_publishedAt_idx" ON "CustomerFeedback"("status", "publicationOrder", "publishedAt");
CREATE INDEX "CustomerFeedbackEvent_feedbackId_createdAt_idx" ON "CustomerFeedbackEvent"("feedbackId", "createdAt");

ALTER TABLE "CustomerFeedback" ADD CONSTRAINT "CustomerFeedback_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CustomerFeedback" ADD CONSTRAINT "CustomerFeedback_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CustomerFeedback" ADD CONSTRAINT "CustomerFeedback_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CustomerFeedbackEvent" ADD CONSTRAINT "CustomerFeedbackEvent_feedbackId_fkey" FOREIGN KEY ("feedbackId") REFERENCES "CustomerFeedback"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CustomerFeedbackEvent" ADD CONSTRAINT "CustomerFeedbackEvent_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
