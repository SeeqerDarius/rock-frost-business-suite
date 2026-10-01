CREATE TYPE "PayrollRunPostingStatus" AS ENUM ('PENDING', 'POSTED', 'FAILED', 'NOT_REQUIRED');

ALTER TABLE "PayrollRun"
ADD COLUMN "postingStatus" "PayrollRunPostingStatus" NOT NULL DEFAULT 'PENDING';

CREATE INDEX "PayrollRun_organizationId_postingStatus_idx"
ON "PayrollRun"("organizationId", "postingStatus");
