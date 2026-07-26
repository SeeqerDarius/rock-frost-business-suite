CREATE TYPE "ContactPreference" AS ENUM ('EMAIL', 'PHONE', 'WHATSAPP');
CREATE TYPE "EnquiryIntent" AS ENUM ('DEMO', 'MODULE', 'GENERAL', 'SUPPORT', 'CUSTOM_MODULE');
CREATE TYPE "SubscriptionMode" AS ENUM ('MANUAL_OFFLINE', 'PLATFORM_MANAGED');
CREATE TYPE "SubscriptionStatus" AS ENUM ('DRAFT', 'PENDING_PAYMENT', 'ACTIVE', 'PAST_DUE', 'EXPIRED', 'CANCELLED');
ALTER TYPE "ModuleRequestType" ADD VALUE 'DEMO' BEFORE 'ENABLE_EXISTING';

ALTER TABLE "ContactSubmission"
  ADD COLUMN "phone" TEXT,
  ADD COLUMN "preferredContact" "ContactPreference" NOT NULL DEFAULT 'EMAIL',
  ADD COLUMN "intent" "EnquiryIntent" NOT NULL DEFAULT 'GENERAL',
  ADD COLUMN "moduleId" TEXT,
  ADD COLUMN "expectedUsers" INTEGER,
  ADD COLUMN "country" TEXT,
  ADD COLUMN "industry" TEXT;

CREATE TABLE "Subscription" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "moduleId" TEXT NOT NULL,
  "moduleRequestId" TEXT,
  "contactSubmissionId" TEXT,
  "mode" "SubscriptionMode" NOT NULL,
  "status" "SubscriptionStatus" NOT NULL DEFAULT 'PENDING_PAYMENT',
  "durationMonths" INTEGER NOT NULL,
  "amount" DECIMAL(18,2) NOT NULL,
  "currency" TEXT NOT NULL DEFAULT 'GHS',
  "startsAt" TIMESTAMP(3),
  "endsAt" TIMESTAMP(3),
  "autoRenew" BOOLEAN NOT NULL DEFAULT false,
  "paymentReference" TEXT,
  "paymentMethod" TEXT,
  "paidAt" TIMESTAMP(3),
  "notes" TEXT,
  "createdById" TEXT NOT NULL,
  "activatedById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Subscription_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Subscription_moduleRequestId_key" ON "Subscription"("moduleRequestId");
CREATE UNIQUE INDEX "Subscription_contactSubmissionId_key" ON "Subscription"("contactSubmissionId");
CREATE INDEX "Subscription_organizationId_status_idx" ON "Subscription"("organizationId", "status");
CREATE INDEX "Subscription_moduleId_status_idx" ON "Subscription"("moduleId", "status");
CREATE INDEX "Subscription_endsAt_idx" ON "Subscription"("endsAt");
CREATE INDEX "ContactSubmission_moduleId_idx" ON "ContactSubmission"("moduleId");

ALTER TABLE "ContactSubmission" ADD CONSTRAINT "ContactSubmission_moduleId_fkey"
  FOREIGN KEY ("moduleId") REFERENCES "Module"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_moduleId_fkey"
  FOREIGN KEY ("moduleId") REFERENCES "Module"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_moduleRequestId_fkey"
  FOREIGN KEY ("moduleRequestId") REFERENCES "ModuleRequest"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_contactSubmissionId_fkey"
  FOREIGN KEY ("contactSubmissionId") REFERENCES "ContactSubmission"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_activatedById_fkey"
  FOREIGN KEY ("activatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
