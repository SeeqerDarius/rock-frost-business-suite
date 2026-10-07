-- Contract Management core (additive). New tables only; no existing data changes.

-- CreateEnum
CREATE TYPE "ContractStatus" AS ENUM ('DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'ACTIVE', 'EXPIRED', 'TERMINATED', 'CANCELLED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "ContractRenewalType" AS ENUM ('FIXED_TERM', 'EVERGREEN', 'AUTO_RENEWAL', 'MANUAL_RENEWAL', 'NO_RENEWAL');

-- CreateEnum
CREATE TYPE "ContractRiskLevel" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

-- CreateEnum
CREATE TYPE "ContractConfidentiality" AS ENUM ('STANDARD', 'CONFIDENTIAL', 'RESTRICTED');

-- CreateEnum
CREATE TYPE "ContractPartyRole" AS ENUM ('BUYER', 'SELLER', 'CLIENT', 'VENDOR', 'EMPLOYER', 'EMPLOYEE', 'CONTRACTOR', 'OWNER', 'PARTNER', 'GUARANTOR', 'WITNESS', 'SERVICE_PROVIDER', 'LANDLORD', 'TENANT', 'OTHER');

-- CreateEnum
CREATE TYPE "ContractDocumentType" AS ENUM ('PRIMARY', 'SUPPORTING', 'AMENDMENT', 'ADDENDUM', 'SCHEDULE', 'EXHIBIT', 'EVIDENCE', 'CERTIFICATE', 'OTHER');

-- CreateEnum
CREATE TYPE "ContractTemplateStatus" AS ENUM ('DRAFT', 'ACTIVE', 'RETIRED');

-- CreateEnum
CREATE TYPE "ContractClauseStatus" AS ENUM ('DRAFT', 'APPROVED', 'RETIRED');

-- CreateEnum
CREATE TYPE "ContractClauseUsage" AS ENUM ('RECOMMENDED', 'REQUIRED', 'OPTIONAL', 'RESTRICTED');

-- CreateEnum
CREATE TYPE "ContractLinkType" AS ENUM ('ACCOUNTING_CONTACT', 'ACCOUNTING_INVOICE', 'ACCOUNTING_BILL', 'FLEET_VEHICLE', 'FLEET_DRIVER', 'FLEET_OWNER', 'FLEET_WORK_AND_PAY', 'HR_EMPLOYEE', 'PROJECT');

-- CreateTable
CREATE TABLE "ContractSettings" (
    "organizationId" TEXT NOT NULL,
    "numberFormat" TEXT NOT NULL DEFAULT '{PREFIX}/{YYYY}/{SEQ:6}',
    "numberPrefix" TEXT NOT NULL DEFAULT 'CTR',
    "resetSequenceYearly" BOOLEAN NOT NULL DEFAULT true,
    "sequenceYear" INTEGER,
    "nextSequence" INTEGER NOT NULL DEFAULT 1,
    "expiryAlertDays" INTEGER[] DEFAULT ARRAY[90, 60, 30, 14, 7]::INTEGER[],
    "confidentialAdminAccess" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ContractSettings_pkey" PRIMARY KEY ("organizationId")
);

-- CreateTable
CREATE TABLE "ContractCategory" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ContractCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContractType" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "categoryId" TEXT,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ContractType_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Contract" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "contractNumber" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "categoryId" TEXT,
    "typeId" TEXT,
    "branchId" TEXT,
    "ownerId" TEXT,
    "department" TEXT,
    "counterpartyName" TEXT NOT NULL,
    "value" DECIMAL(16,2),
    "currency" TEXT NOT NULL,
    "taxTreatment" TEXT,
    "startDate" TIMESTAMP(3),
    "effectiveDate" TIMESTAMP(3),
    "expirationDate" TIMESTAMP(3),
    "renewalDate" TIMESTAMP(3),
    "noticePeriodDays" INTEGER,
    "renewalType" "ContractRenewalType" NOT NULL DEFAULT 'FIXED_TERM',
    "paymentTerms" TEXT,
    "billingFrequency" TEXT,
    "governingLaw" TEXT,
    "governingJurisdiction" TEXT,
    "language" TEXT,
    "status" "ContractStatus" NOT NULL DEFAULT 'DRAFT',
    "riskLevel" "ContractRiskLevel" NOT NULL DEFAULT 'LOW',
    "confidentiality" "ContractConfidentiality" NOT NULL DEFAULT 'STANDARD',
    "description" TEXT,
    "body" TEXT,
    "tags" TEXT[],
    "notes" TEXT,
    "currentVersion" INTEGER NOT NULL DEFAULT 1,
    "templateId" TEXT,
    "templateVersion" INTEGER,
    "archivedAt" TIMESTAMP(3),
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Contract_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContractParty" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "role" "ContractPartyRole" NOT NULL,
    "customRole" TEXT,
    "name" TEXT NOT NULL,
    "legalName" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "address" TEXT,
    "taxId" TEXT,
    "registrationNumber" TEXT,
    "contactId" TEXT,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "signatoryName" TEXT,
    "signatoryTitle" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ContractParty_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FileContent" (
    "fileAssetId" TEXT NOT NULL,
    "data" BYTEA NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FileContent_pkey" PRIMARY KEY ("fileAssetId")
);

-- CreateTable
CREATE TABLE "ContractDocument" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "documentType" "ContractDocumentType" NOT NULL,
    "title" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "fileAssetId" TEXT NOT NULL,
    "checksumSha256" TEXT NOT NULL,
    "supersedesId" TEXT,
    "uploadedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "removedAt" TIMESTAMP(3),
    "removedById" TEXT,
    "removalReason" TEXT,

    CONSTRAINT "ContractDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContractVersion" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "snapshot" JSONB NOT NULL,
    "changedFields" TEXT[],
    "changes" JSONB,
    "reason" TEXT,
    "changedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ContractVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContractTemplate" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "categoryId" TEXT,
    "description" TEXT,
    "body" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "status" "ContractTemplateStatus" NOT NULL DEFAULT 'DRAFT',
    "supersedesId" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ContractTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContractClause" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "jurisdiction" TEXT,
    "language" TEXT NOT NULL DEFAULT 'en',
    "status" "ContractClauseStatus" NOT NULL DEFAULT 'DRAFT',
    "usage" "ContractClauseUsage" NOT NULL DEFAULT 'OPTIONAL',
    "ownerId" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "effectiveFrom" TIMESTAMP(3),
    "supersedesId" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ContractClause_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContractClauseLink" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "clauseId" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ContractClauseLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContractAccessGrant" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "userId" TEXT,
    "roleId" TEXT,
    "department" TEXT,
    "grantedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ContractAccessGrant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContractLink" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "linkType" "ContractLinkType" NOT NULL,
    "entityId" TEXT NOT NULL,
    "label" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ContractLink_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ContractCategory_organizationId_code_key" ON "ContractCategory"("organizationId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "ContractType_organizationId_code_key" ON "ContractType"("organizationId", "code");

-- CreateIndex
CREATE INDEX "Contract_organizationId_status_idx" ON "Contract"("organizationId", "status");

-- CreateIndex
CREATE INDEX "Contract_organizationId_expirationDate_idx" ON "Contract"("organizationId", "expirationDate");

-- CreateIndex
CREATE INDEX "Contract_organizationId_renewalDate_idx" ON "Contract"("organizationId", "renewalDate");

-- CreateIndex
CREATE INDEX "Contract_organizationId_ownerId_idx" ON "Contract"("organizationId", "ownerId");

-- CreateIndex
CREATE INDEX "Contract_organizationId_counterpartyName_idx" ON "Contract"("organizationId", "counterpartyName");

-- CreateIndex
CREATE INDEX "Contract_organizationId_categoryId_idx" ON "Contract"("organizationId", "categoryId");

-- CreateIndex
CREATE INDEX "Contract_organizationId_currency_idx" ON "Contract"("organizationId", "currency");

-- CreateIndex
CREATE INDEX "Contract_organizationId_startDate_idx" ON "Contract"("organizationId", "startDate");

-- CreateIndex
CREATE INDEX "Contract_tags_idx" ON "Contract" USING GIN ("tags");

-- CreateIndex
CREATE UNIQUE INDEX "Contract_organizationId_contractNumber_key" ON "Contract"("organizationId", "contractNumber");

-- CreateIndex
CREATE INDEX "ContractParty_contractId_idx" ON "ContractParty"("contractId");

-- CreateIndex
CREATE INDEX "ContractParty_organizationId_name_idx" ON "ContractParty"("organizationId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "ContractDocument_fileAssetId_key" ON "ContractDocument"("fileAssetId");

-- CreateIndex
CREATE INDEX "ContractDocument_contractId_documentType_idx" ON "ContractDocument"("contractId", "documentType");

-- CreateIndex
CREATE INDEX "ContractDocument_organizationId_createdAt_idx" ON "ContractDocument"("organizationId", "createdAt");

-- CreateIndex
CREATE INDEX "ContractVersion_organizationId_createdAt_idx" ON "ContractVersion"("organizationId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ContractVersion_contractId_version_key" ON "ContractVersion"("contractId", "version");

-- CreateIndex
CREATE UNIQUE INDEX "ContractTemplate_organizationId_code_version_key" ON "ContractTemplate"("organizationId", "code", "version");

-- CreateIndex
CREATE INDEX "ContractClause_organizationId_category_idx" ON "ContractClause"("organizationId", "category");

-- CreateIndex
CREATE UNIQUE INDEX "ContractClause_organizationId_code_version_key" ON "ContractClause"("organizationId", "code", "version");

-- CreateIndex
CREATE UNIQUE INDEX "ContractClauseLink_contractId_clauseId_key" ON "ContractClauseLink"("contractId", "clauseId");

-- CreateIndex
CREATE INDEX "ContractAccessGrant_contractId_idx" ON "ContractAccessGrant"("contractId");

-- CreateIndex
CREATE INDEX "ContractAccessGrant_organizationId_userId_idx" ON "ContractAccessGrant"("organizationId", "userId");

-- CreateIndex
CREATE INDEX "ContractLink_organizationId_linkType_entityId_idx" ON "ContractLink"("organizationId", "linkType", "entityId");

-- CreateIndex
CREATE UNIQUE INDEX "ContractLink_contractId_linkType_entityId_key" ON "ContractLink"("contractId", "linkType", "entityId");

-- AddForeignKey
ALTER TABLE "ContractSettings" ADD CONSTRAINT "ContractSettings_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContractCategory" ADD CONSTRAINT "ContractCategory_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContractType" ADD CONSTRAINT "ContractType_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContractType" ADD CONSTRAINT "ContractType_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "ContractCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Contract" ADD CONSTRAINT "Contract_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Contract" ADD CONSTRAINT "Contract_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "ContractCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Contract" ADD CONSTRAINT "Contract_typeId_fkey" FOREIGN KEY ("typeId") REFERENCES "ContractType"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Contract" ADD CONSTRAINT "Contract_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Contract" ADD CONSTRAINT "Contract_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Contract" ADD CONSTRAINT "Contract_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Contract" ADD CONSTRAINT "Contract_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "ContractTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContractParty" ADD CONSTRAINT "ContractParty_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContractParty" ADD CONSTRAINT "ContractParty_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "Contract"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContractParty" ADD CONSTRAINT "ContractParty_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "AccountingContact"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FileContent" ADD CONSTRAINT "FileContent_fileAssetId_fkey" FOREIGN KEY ("fileAssetId") REFERENCES "FileAsset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContractDocument" ADD CONSTRAINT "ContractDocument_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContractDocument" ADD CONSTRAINT "ContractDocument_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "Contract"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContractDocument" ADD CONSTRAINT "ContractDocument_fileAssetId_fkey" FOREIGN KEY ("fileAssetId") REFERENCES "FileAsset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContractDocument" ADD CONSTRAINT "ContractDocument_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContractVersion" ADD CONSTRAINT "ContractVersion_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContractVersion" ADD CONSTRAINT "ContractVersion_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "Contract"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContractVersion" ADD CONSTRAINT "ContractVersion_changedById_fkey" FOREIGN KEY ("changedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContractTemplate" ADD CONSTRAINT "ContractTemplate_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContractTemplate" ADD CONSTRAINT "ContractTemplate_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "ContractCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContractClause" ADD CONSTRAINT "ContractClause_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContractClause" ADD CONSTRAINT "ContractClause_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContractClauseLink" ADD CONSTRAINT "ContractClauseLink_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContractClauseLink" ADD CONSTRAINT "ContractClauseLink_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "Contract"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContractClauseLink" ADD CONSTRAINT "ContractClauseLink_clauseId_fkey" FOREIGN KEY ("clauseId") REFERENCES "ContractClause"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContractAccessGrant" ADD CONSTRAINT "ContractAccessGrant_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContractAccessGrant" ADD CONSTRAINT "ContractAccessGrant_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "Contract"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContractLink" ADD CONSTRAINT "ContractLink_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContractLink" ADD CONSTRAINT "ContractLink_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "Contract"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Integrity guards.
ALTER TABLE "Contract" ADD CONSTRAINT "Contract_value_nonnegative_check" CHECK ("value" IS NULL OR "value" >= 0);
ALTER TABLE "Contract" ADD CONSTRAINT "Contract_dates_check" CHECK ("expirationDate" IS NULL OR "startDate" IS NULL OR "expirationDate" >= "startDate");
ALTER TABLE "Contract" ADD CONSTRAINT "Contract_notice_check" CHECK ("noticePeriodDays" IS NULL OR "noticePeriodDays" BETWEEN 0 AND 3650);
ALTER TABLE "Contract" ADD CONSTRAINT "Contract_currency_check" CHECK ("currency" ~ '^[A-Z]{3}$');
ALTER TABLE "ContractDocument" ADD CONSTRAINT "ContractDocument_version_check" CHECK ("version" >= 1);
ALTER TABLE "ContractVersion" ADD CONSTRAINT "ContractVersion_version_check" CHECK ("version" >= 1);
ALTER TABLE "ContractAccessGrant" ADD CONSTRAINT "ContractAccessGrant_single_target_check" CHECK (num_nonnulls("userId", "roleId", "department") = 1);
ALTER TABLE "ContractSettings" ADD CONSTRAINT "ContractSettings_sequence_check" CHECK ("nextSequence" >= 1);
