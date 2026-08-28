CREATE TYPE "AccountingPlanKind" AS ENUM ('BUDGET', 'FORECAST');
CREATE TYPE "AccountingPlanStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'APPROVED', 'REJECTED', 'LOCKED', 'ARCHIVED');
CREATE TYPE "AccountingPlanDecisionAction" AS ENUM ('CREATED', 'SUBMITTED', 'APPROVED', 'REJECTED', 'LOCKED', 'ARCHIVED', 'REVISION_CREATED');

CREATE TABLE "AccountingPlan" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" "AccountingPlanKind" NOT NULL,
    "status" "AccountingPlanStatus" NOT NULL DEFAULT 'DRAFT',
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "currencyCode" TEXT NOT NULL,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "parentPlanId" TEXT,
    "actualThroughDate" TIMESTAMP(3),
    "notes" TEXT,
    "createdById" TEXT,
    "submittedById" TEXT,
    "submittedAt" TIMESTAMP(3),
    "approvedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "rejectedById" TEXT,
    "rejectedAt" TIMESTAMP(3),
    "rejectionReason" TEXT,
    "lockedById" TEXT,
    "lockedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "AccountingPlan_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AccountingPlanLine" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "branchId" TEXT,
    "sourceModule" TEXT,
    "dimensionKey" TEXT NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "amount" DECIMAL(16,2) NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "AccountingPlanLine_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AccountingPlanDecision" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "action" "AccountingPlanDecisionAction" NOT NULL,
    "fromStatus" "AccountingPlanStatus",
    "toStatus" "AccountingPlanStatus" NOT NULL,
    "actorId" TEXT,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AccountingPlanDecision_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AccountingPlan_organizationId_name_revision_key" ON "AccountingPlan"("organizationId", "name", "revision");
CREATE INDEX "AccountingPlan_organizationId_kind_status_startDate_idx" ON "AccountingPlan"("organizationId", "kind", "status", "startDate");
CREATE INDEX "AccountingPlan_parentPlanId_idx" ON "AccountingPlan"("parentPlanId");
CREATE UNIQUE INDEX "AccountingPlanLine_planId_accountId_periodStart_dimensionKey_key" ON "AccountingPlanLine"("planId", "accountId", "periodStart", "dimensionKey");
CREATE INDEX "AccountingPlanLine_organizationId_periodStart_idx" ON "AccountingPlanLine"("organizationId", "periodStart");
CREATE INDEX "AccountingPlanLine_accountId_periodStart_idx" ON "AccountingPlanLine"("accountId", "periodStart");
CREATE INDEX "AccountingPlanLine_branchId_idx" ON "AccountingPlanLine"("branchId");
CREATE INDEX "AccountingPlanLine_sourceModule_idx" ON "AccountingPlanLine"("sourceModule");
CREATE INDEX "AccountingPlanDecision_organizationId_createdAt_idx" ON "AccountingPlanDecision"("organizationId", "createdAt");
CREATE INDEX "AccountingPlanDecision_planId_createdAt_idx" ON "AccountingPlanDecision"("planId", "createdAt");

ALTER TABLE "AccountingPlan" ADD CONSTRAINT "AccountingPlan_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AccountingPlan" ADD CONSTRAINT "AccountingPlan_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AccountingPlan" ADD CONSTRAINT "AccountingPlan_parentPlanId_fkey" FOREIGN KEY ("parentPlanId") REFERENCES "AccountingPlan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AccountingPlanLine" ADD CONSTRAINT "AccountingPlanLine_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AccountingPlanLine" ADD CONSTRAINT "AccountingPlanLine_planId_fkey" FOREIGN KEY ("planId") REFERENCES "AccountingPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AccountingPlanLine" ADD CONSTRAINT "AccountingPlanLine_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "AccountingAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AccountingPlanLine" ADD CONSTRAINT "AccountingPlanLine_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AccountingPlanDecision" ADD CONSTRAINT "AccountingPlanDecision_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AccountingPlanDecision" ADD CONSTRAINT "AccountingPlanDecision_planId_fkey" FOREIGN KEY ("planId") REFERENCES "AccountingPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AccountingPlanDecision" ADD CONSTRAINT "AccountingPlanDecision_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "AccountingPlan" ADD CONSTRAINT "AccountingPlan_date_range_check" CHECK ("startDate" <= "endDate");
ALTER TABLE "AccountingPlanLine" ADD CONSTRAINT "AccountingPlanLine_amount_nonnegative_check" CHECK ("amount" >= 0);
ALTER TABLE "AccountingPlanLine" ADD CONSTRAINT "AccountingPlanLine_date_range_check" CHECK ("periodStart" <= "periodEnd");
