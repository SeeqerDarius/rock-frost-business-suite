CREATE TABLE "OrganizationModuleBranding" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "moduleKey" TEXT NOT NULL,
    "displayName" TEXT,
    "logoUrl" TEXT,
    "primaryColor" VARCHAR(7),
    "accentColor" VARCHAR(7),
    "surfaceColor" VARCHAR(7),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrganizationModuleBranding_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "OrganizationModuleBranding_organizationId_moduleKey_key"
ON "OrganizationModuleBranding"("organizationId", "moduleKey");

CREATE INDEX "OrganizationModuleBranding_organizationId_idx"
ON "OrganizationModuleBranding"("organizationId");

ALTER TABLE "OrganizationModuleBranding"
ADD CONSTRAINT "OrganizationModuleBranding_organizationId_fkey"
FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
