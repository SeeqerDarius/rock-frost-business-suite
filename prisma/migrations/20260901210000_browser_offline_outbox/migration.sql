ALTER TABLE "OfflineMutation"
ADD COLUMN "idempotencyKey" TEXT,
ADD COLUMN "payloadSchemaVersion" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN "attachmentReferences" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
ADD COLUMN "dependencyIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

UPDATE "OfflineMutation" SET "idempotencyKey" = "mutationId" WHERE "idempotencyKey" IS NULL;

ALTER TABLE "OfflineMutation" ALTER COLUMN "idempotencyKey" SET NOT NULL;

CREATE UNIQUE INDEX "OfflineMutation_organizationId_idempotencyKey_key"
ON "OfflineMutation"("organizationId", "idempotencyKey");
