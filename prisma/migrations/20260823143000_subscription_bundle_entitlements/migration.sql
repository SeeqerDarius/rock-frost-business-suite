ALTER TABLE "Subscription"
ADD COLUMN "bundleKey" TEXT,
ADD COLUMN "entitledModuleKeys" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

CREATE INDEX "Subscription_bundleKey_idx" ON "Subscription"("bundleKey");
