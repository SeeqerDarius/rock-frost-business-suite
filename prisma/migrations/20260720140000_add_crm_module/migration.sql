-- CreateEnum
CREATE TYPE "CrmLeadStatus" AS ENUM ('NEW', 'CONTACTED', 'QUALIFIED', 'DISQUALIFIED', 'CONVERTED');

-- CreateEnum
CREATE TYPE "CrmDealStage" AS ENUM ('NEW', 'QUALIFIED', 'PROPOSAL', 'NEGOTIATION', 'WON', 'LOST');

-- CreateEnum
CREATE TYPE "CrmActivityType" AS ENUM ('CALL', 'EMAIL', 'MEETING', 'NOTE', 'TASK');

-- CreateTable
CREATE TABLE "CrmLeadSource" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CrmLeadSource_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CrmContact" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "branchId" TEXT,
    "fullName" TEXT NOT NULL,
    "company" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "jobTitle" TEXT,
    "notes" TEXT,
    "ownerId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CrmContact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CrmLead" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "branchId" TEXT,
    "contactId" TEXT,
    "fullName" TEXT NOT NULL,
    "company" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "source" TEXT,
    "status" "CrmLeadStatus" NOT NULL DEFAULT 'NEW',
    "ownerId" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CrmLead_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CrmDeal" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "branchId" TEXT,
    "contactId" TEXT,
    "leadId" TEXT,
    "title" TEXT NOT NULL,
    "value" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "stage" "CrmDealStage" NOT NULL DEFAULT 'NEW',
    "expectedCloseDate" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),
    "ownerId" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CrmDeal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CrmActivity" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "branchId" TEXT,
    "type" "CrmActivityType" NOT NULL,
    "subject" TEXT NOT NULL,
    "notes" TEXT,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "contactId" TEXT,
    "leadId" TEXT,
    "dealId" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CrmActivity_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CrmLeadSource_organizationId_idx" ON "CrmLeadSource"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "CrmLeadSource_organizationId_name_key" ON "CrmLeadSource"("organizationId", "name");

-- CreateIndex
CREATE INDEX "CrmContact_organizationId_idx" ON "CrmContact"("organizationId");

-- CreateIndex
CREATE INDEX "CrmContact_branchId_idx" ON "CrmContact"("branchId");

-- CreateIndex
CREATE INDEX "CrmContact_ownerId_idx" ON "CrmContact"("ownerId");

-- CreateIndex
CREATE INDEX "CrmContact_email_idx" ON "CrmContact"("email");

-- CreateIndex
CREATE INDEX "CrmLead_organizationId_status_idx" ON "CrmLead"("organizationId", "status");

-- CreateIndex
CREATE INDEX "CrmLead_branchId_idx" ON "CrmLead"("branchId");

-- CreateIndex
CREATE INDEX "CrmLead_contactId_idx" ON "CrmLead"("contactId");

-- CreateIndex
CREATE INDEX "CrmLead_ownerId_idx" ON "CrmLead"("ownerId");

-- CreateIndex
CREATE UNIQUE INDEX "CrmDeal_leadId_key" ON "CrmDeal"("leadId");

-- CreateIndex
CREATE INDEX "CrmDeal_organizationId_stage_idx" ON "CrmDeal"("organizationId", "stage");

-- CreateIndex
CREATE INDEX "CrmDeal_branchId_idx" ON "CrmDeal"("branchId");

-- CreateIndex
CREATE INDEX "CrmDeal_contactId_idx" ON "CrmDeal"("contactId");

-- CreateIndex
CREATE INDEX "CrmDeal_ownerId_idx" ON "CrmDeal"("ownerId");

-- CreateIndex
CREATE INDEX "CrmActivity_organizationId_occurredAt_idx" ON "CrmActivity"("organizationId", "occurredAt");

-- CreateIndex
CREATE INDEX "CrmActivity_branchId_idx" ON "CrmActivity"("branchId");

-- CreateIndex
CREATE INDEX "CrmActivity_contactId_idx" ON "CrmActivity"("contactId");

-- CreateIndex
CREATE INDEX "CrmActivity_leadId_idx" ON "CrmActivity"("leadId");

-- CreateIndex
CREATE INDEX "CrmActivity_dealId_idx" ON "CrmActivity"("dealId");

-- AddForeignKey
ALTER TABLE "CrmLeadSource" ADD CONSTRAINT "CrmLeadSource_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrmContact" ADD CONSTRAINT "CrmContact_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrmContact" ADD CONSTRAINT "CrmContact_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrmContact" ADD CONSTRAINT "CrmContact_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrmLead" ADD CONSTRAINT "CrmLead_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrmLead" ADD CONSTRAINT "CrmLead_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrmLead" ADD CONSTRAINT "CrmLead_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "CrmContact"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrmLead" ADD CONSTRAINT "CrmLead_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrmDeal" ADD CONSTRAINT "CrmDeal_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrmDeal" ADD CONSTRAINT "CrmDeal_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrmDeal" ADD CONSTRAINT "CrmDeal_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "CrmContact"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrmDeal" ADD CONSTRAINT "CrmDeal_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "CrmLead"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrmDeal" ADD CONSTRAINT "CrmDeal_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrmActivity" ADD CONSTRAINT "CrmActivity_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrmActivity" ADD CONSTRAINT "CrmActivity_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrmActivity" ADD CONSTRAINT "CrmActivity_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "CrmContact"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrmActivity" ADD CONSTRAINT "CrmActivity_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "CrmLead"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrmActivity" ADD CONSTRAINT "CrmActivity_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "CrmDeal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrmActivity" ADD CONSTRAINT "CrmActivity_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

