-- CreateEnum
CREATE TYPE "ContractApprovalStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'CHANGES_REQUESTED', 'WITHDRAWN');

-- CreateEnum
CREATE TYPE "ContractApprovalStepStatus" AS ENUM ('WAITING', 'PENDING', 'APPROVED', 'REJECTED', 'CHANGES_REQUESTED', 'SKIPPED');

-- CreateEnum
CREATE TYPE "ContractObligationType" AS ENUM ('DELIVERABLE', 'PAYMENT', 'REPORTING', 'COMPLIANCE', 'INSURANCE', 'NOTICE', 'OTHER');

-- CreateEnum
CREATE TYPE "ContractObligationParty" AS ENUM ('INTERNAL', 'COUNTERPARTY');

-- CreateEnum
CREATE TYPE "ContractObligationStatus" AS ENUM ('OPEN', 'IN_PROGRESS', 'COMPLETED', 'WAIVED');

-- CreateEnum
CREATE TYPE "ContractRecurrence" AS ENUM ('NONE', 'MONTHLY', 'QUARTERLY', 'SEMI_ANNUAL', 'ANNUAL');

-- CreateEnum
CREATE TYPE "ContractMilestoneStatus" AS ENUM ('PLANNED', 'ACHIEVED', 'MISSED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ContractAmendmentStatus" AS ENUM ('DRAFT', 'APPLIED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ContractRenewalDecision" AS ENUM ('RENEWED', 'NOT_RENEWING');

-- CreateEnum
CREATE TYPE "ContractSignatureMethod" AS ENUM ('INTERNAL_ACKNOWLEDGEMENT', 'RECORDED_EXTERNAL', 'PROVIDER');

-- CreateEnum
CREATE TYPE "ContractSignatureStatus" AS ENUM ('PENDING', 'SIGNED', 'DECLINED', 'CANCELLED');

-- AlterTable
ALTER TABLE "ContractSettings" ADD COLUMN     "allowSelfApproval" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "obligationReminderDays" INTEGER[] DEFAULT ARRAY[14, 7, 1]::INTEGER[];

-- AlterTable
ALTER TABLE "Contract" ADD COLUMN     "noticeGivenAt" TIMESTAMP(3),
ADD COLUMN     "renewalTermMonths" INTEGER,
ADD COLUMN     "terminatedAt" TIMESTAMP(3),
ADD COLUMN     "terminationEffectiveDate" TIMESTAMP(3),
ADD COLUMN     "terminationReason" TEXT;

-- CreateTable
CREATE TABLE "ContractApprovalRule" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "priority" INTEGER NOT NULL DEFAULT 100,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "minValue" DECIMAL(16,2),
    "currency" TEXT,
    "categoryId" TEXT,
    "typeId" TEXT,
    "department" TEXT,
    "minRiskLevel" "ContractRiskLevel",
    "jurisdiction" TEXT,
    "branchId" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ContractApprovalRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContractApprovalRuleStep" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "ruleId" TEXT NOT NULL,
    "stepOrder" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "approverUserId" TEXT,
    "approverRoleId" TEXT,

    CONSTRAINT "ContractApprovalRuleStep_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContractApprovalRequest" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "contractVersion" INTEGER NOT NULL,
    "ruleId" TEXT,
    "ruleName" TEXT NOT NULL,
    "status" "ContractApprovalStatus" NOT NULL DEFAULT 'PENDING',
    "requestedById" TEXT,
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "note" TEXT,

    CONSTRAINT "ContractApprovalRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContractApprovalStep" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "stepOrder" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "approverUserId" TEXT,
    "approverRoleId" TEXT,
    "status" "ContractApprovalStepStatus" NOT NULL DEFAULT 'WAITING',
    "activatedAt" TIMESTAMP(3),
    "escalated" BOOLEAN NOT NULL DEFAULT false,
    "decidedById" TEXT,
    "decidedAt" TIMESTAMP(3),
    "comment" TEXT,

    CONSTRAINT "ContractApprovalStep_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContractComment" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "approvalRequestId" TEXT,
    "authorId" TEXT,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ContractComment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContractObligation" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "obligationType" "ContractObligationType" NOT NULL DEFAULT 'OTHER',
    "responsibleParty" "ContractObligationParty" NOT NULL DEFAULT 'INTERNAL',
    "ownerId" TEXT,
    "dueDate" TIMESTAMP(3) NOT NULL,
    "recurrence" "ContractRecurrence" NOT NULL DEFAULT 'NONE',
    "status" "ContractObligationStatus" NOT NULL DEFAULT 'OPEN',
    "completedAt" TIMESTAMP(3),
    "completedById" TEXT,
    "resolutionNote" TEXT,
    "previousId" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ContractObligation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContractMilestone" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "dueDate" TIMESTAMP(3) NOT NULL,
    "amount" DECIMAL(16,2),
    "status" "ContractMilestoneStatus" NOT NULL DEFAULT 'PLANNED',
    "achievedAt" TIMESTAMP(3),
    "note" TEXT,
    "recordedById" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ContractMilestone_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContractAmendment" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "amendmentNumber" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "effectiveDate" TIMESTAMP(3),
    "changes" JSONB NOT NULL,
    "status" "ContractAmendmentStatus" NOT NULL DEFAULT 'DRAFT',
    "appliedVersion" INTEGER,
    "appliedAt" TIMESTAMP(3),
    "appliedById" TEXT,
    "cancelledAt" TIMESTAMP(3),
    "cancelledById" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ContractAmendment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContractRenewal" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "decision" "ContractRenewalDecision" NOT NULL,
    "previousExpirationDate" TIMESTAMP(3),
    "newExpirationDate" TIMESTAMP(3),
    "previousValue" DECIMAL(16,2),
    "newValue" DECIMAL(16,2),
    "reason" TEXT,
    "contractVersion" INTEGER,
    "decidedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ContractRenewal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContractSignature" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "documentId" TEXT,
    "partyId" TEXT,
    "method" "ContractSignatureMethod" NOT NULL,
    "status" "ContractSignatureStatus" NOT NULL DEFAULT 'PENDING',
    "signerName" TEXT NOT NULL,
    "signerEmail" TEXT,
    "signerTitle" TEXT,
    "signerUserId" TEXT,
    "providerKey" TEXT,
    "providerReference" TEXT,
    "evidenceNote" TEXT,
    "requestedById" TEXT,
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "recordedById" TEXT,

    CONSTRAINT "ContractSignature_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContractReminder" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "thresholdDays" INTEGER NOT NULL,
    "dueDate" TIMESTAMP(3) NOT NULL,
    "recipientUserId" TEXT,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ContractReminder_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ContractApprovalRule_organizationId_active_priority_idx" ON "ContractApprovalRule"("organizationId", "active", "priority");

-- CreateIndex
CREATE UNIQUE INDEX "ContractApprovalRuleStep_ruleId_stepOrder_key" ON "ContractApprovalRuleStep"("ruleId", "stepOrder");

-- CreateIndex
CREATE INDEX "ContractApprovalRequest_organizationId_status_idx" ON "ContractApprovalRequest"("organizationId", "status");

-- CreateIndex
CREATE INDEX "ContractApprovalRequest_contractId_requestedAt_idx" ON "ContractApprovalRequest"("contractId", "requestedAt");

-- CreateIndex
CREATE INDEX "ContractApprovalStep_organizationId_status_approverUserId_idx" ON "ContractApprovalStep"("organizationId", "status", "approverUserId");

-- CreateIndex
CREATE INDEX "ContractApprovalStep_organizationId_status_approverRoleId_idx" ON "ContractApprovalStep"("organizationId", "status", "approverRoleId");

-- CreateIndex
CREATE UNIQUE INDEX "ContractApprovalStep_requestId_stepOrder_key" ON "ContractApprovalStep"("requestId", "stepOrder");

-- CreateIndex
CREATE INDEX "ContractComment_contractId_createdAt_idx" ON "ContractComment"("contractId", "createdAt");

-- CreateIndex
CREATE INDEX "ContractObligation_organizationId_status_dueDate_idx" ON "ContractObligation"("organizationId", "status", "dueDate");

-- CreateIndex
CREATE INDEX "ContractObligation_contractId_dueDate_idx" ON "ContractObligation"("contractId", "dueDate");

-- CreateIndex
CREATE INDEX "ContractMilestone_organizationId_status_dueDate_idx" ON "ContractMilestone"("organizationId", "status", "dueDate");

-- CreateIndex
CREATE INDEX "ContractMilestone_contractId_dueDate_idx" ON "ContractMilestone"("contractId", "dueDate");

-- CreateIndex
CREATE INDEX "ContractAmendment_organizationId_status_idx" ON "ContractAmendment"("organizationId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "ContractAmendment_contractId_amendmentNumber_key" ON "ContractAmendment"("contractId", "amendmentNumber");

-- CreateIndex
CREATE INDEX "ContractRenewal_contractId_createdAt_idx" ON "ContractRenewal"("contractId", "createdAt");

-- CreateIndex
CREATE INDEX "ContractSignature_contractId_status_idx" ON "ContractSignature"("contractId", "status");

-- CreateIndex
CREATE INDEX "ContractReminder_organizationId_sentAt_idx" ON "ContractReminder"("organizationId", "sentAt");

-- CreateIndex
CREATE UNIQUE INDEX "ContractReminder_kind_targetId_thresholdDays_dueDate_key" ON "ContractReminder"("kind", "targetId", "thresholdDays", "dueDate");

-- AddForeignKey
ALTER TABLE "ContractApprovalRule" ADD CONSTRAINT "ContractApprovalRule_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContractApprovalRuleStep" ADD CONSTRAINT "ContractApprovalRuleStep_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContractApprovalRuleStep" ADD CONSTRAINT "ContractApprovalRuleStep_ruleId_fkey" FOREIGN KEY ("ruleId") REFERENCES "ContractApprovalRule"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContractApprovalRequest" ADD CONSTRAINT "ContractApprovalRequest_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContractApprovalRequest" ADD CONSTRAINT "ContractApprovalRequest_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "Contract"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContractApprovalRequest" ADD CONSTRAINT "ContractApprovalRequest_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContractApprovalStep" ADD CONSTRAINT "ContractApprovalStep_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContractApprovalStep" ADD CONSTRAINT "ContractApprovalStep_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "ContractApprovalRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContractApprovalStep" ADD CONSTRAINT "ContractApprovalStep_approverUserId_fkey" FOREIGN KEY ("approverUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContractApprovalStep" ADD CONSTRAINT "ContractApprovalStep_decidedById_fkey" FOREIGN KEY ("decidedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContractComment" ADD CONSTRAINT "ContractComment_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContractComment" ADD CONSTRAINT "ContractComment_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "Contract"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContractComment" ADD CONSTRAINT "ContractComment_approvalRequestId_fkey" FOREIGN KEY ("approvalRequestId") REFERENCES "ContractApprovalRequest"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContractComment" ADD CONSTRAINT "ContractComment_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContractObligation" ADD CONSTRAINT "ContractObligation_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContractObligation" ADD CONSTRAINT "ContractObligation_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "Contract"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContractObligation" ADD CONSTRAINT "ContractObligation_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContractMilestone" ADD CONSTRAINT "ContractMilestone_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContractMilestone" ADD CONSTRAINT "ContractMilestone_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "Contract"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContractAmendment" ADD CONSTRAINT "ContractAmendment_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContractAmendment" ADD CONSTRAINT "ContractAmendment_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "Contract"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContractAmendment" ADD CONSTRAINT "ContractAmendment_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContractRenewal" ADD CONSTRAINT "ContractRenewal_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContractRenewal" ADD CONSTRAINT "ContractRenewal_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "Contract"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContractSignature" ADD CONSTRAINT "ContractSignature_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContractSignature" ADD CONSTRAINT "ContractSignature_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "Contract"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContractReminder" ADD CONSTRAINT "ContractReminder_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContractReminder" ADD CONSTRAINT "ContractReminder_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "Contract"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Integrity guards.
ALTER TABLE "ContractApprovalRuleStep" ADD CONSTRAINT "ContractApprovalRuleStep_single_approver_check" CHECK (num_nonnulls("approverUserId", "approverRoleId") = 1);
ALTER TABLE "ContractApprovalRuleStep" ADD CONSTRAINT "ContractApprovalRuleStep_order_check" CHECK ("stepOrder" >= 1);
ALTER TABLE "ContractApprovalStep" ADD CONSTRAINT "ContractApprovalStep_single_approver_check" CHECK (num_nonnulls("approverUserId", "approverRoleId") = 1);
ALTER TABLE "ContractApprovalRule" ADD CONSTRAINT "ContractApprovalRule_value_check" CHECK ("minValue" IS NULL OR ("minValue" >= 0 AND "currency" IS NOT NULL));
ALTER TABLE "ContractMilestone" ADD CONSTRAINT "ContractMilestone_amount_check" CHECK ("amount" IS NULL OR "amount" >= 0);
ALTER TABLE "ContractAmendment" ADD CONSTRAINT "ContractAmendment_number_check" CHECK ("amendmentNumber" >= 1);
ALTER TABLE "Contract" ADD CONSTRAINT "Contract_renewal_term_check" CHECK ("renewalTermMonths" IS NULL OR "renewalTermMonths" BETWEEN 1 AND 600);

-- At most one approval round in progress per contract.
CREATE UNIQUE INDEX "ContractApprovalRequest_one_pending_idx" ON "ContractApprovalRequest" ("contractId") WHERE "status" = 'PENDING';
