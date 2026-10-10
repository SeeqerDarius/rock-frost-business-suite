CREATE TYPE "SchoolFeePaymentPostingStatus" AS ENUM ('PENDING', 'POSTED', 'FAILED', 'NOT_REQUIRED');

ALTER TABLE "SchoolFeePayment"
ADD COLUMN "postingStatus" "SchoolFeePaymentPostingStatus" NOT NULL DEFAULT 'PENDING';

CREATE INDEX "SchoolFeePayment_organizationId_postingStatus_idx"
ON "SchoolFeePayment"("organizationId", "postingStatus");
