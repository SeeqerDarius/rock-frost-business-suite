-- CreateTable
CREATE TABLE "OrganizationFeatureSetting" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "moduleKey" TEXT NOT NULL,
    "featureKey" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrganizationFeatureSetting_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "OrganizationFeatureSetting_organizationId_moduleKey_idx" ON "OrganizationFeatureSetting"("organizationId", "moduleKey");

-- CreateIndex
CREATE UNIQUE INDEX "OrganizationFeatureSetting_organizationId_featureKey_key" ON "OrganizationFeatureSetting"("organizationId", "featureKey");

-- AddForeignKey
ALTER TABLE "OrganizationFeatureSetting" ADD CONSTRAINT "OrganizationFeatureSetting_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

