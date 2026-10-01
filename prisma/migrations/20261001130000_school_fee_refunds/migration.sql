CREATE TABLE "SchoolFeeRefund" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "paymentId" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "method" "HotelPaymentMethod" NOT NULL,
    "reason" TEXT NOT NULL,
    "reference" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" TEXT NOT NULL,
    "postingStatus" "SchoolFeePaymentPostingStatus" NOT NULL DEFAULT 'PENDING',
    CONSTRAINT "SchoolFeeRefund_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "SchoolFeeRefund_amount_positive_check" CHECK ("amount" > 0),
    CONSTRAINT "SchoolFeeRefund_reason_nonempty_check" CHECK (length(trim("reason")) > 0)
);
CREATE INDEX "SchoolFeeRefund_organizationId_createdAt_idx" ON "SchoolFeeRefund"("organizationId", "createdAt");
CREATE INDEX "SchoolFeeRefund_paymentId_createdAt_idx" ON "SchoolFeeRefund"("paymentId", "createdAt");
CREATE INDEX "SchoolFeeRefund_organizationId_postingStatus_idx" ON "SchoolFeeRefund"("organizationId", "postingStatus");
ALTER TABLE "SchoolFeeRefund" ADD CONSTRAINT "SchoolFeeRefund_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SchoolFeeRefund" ADD CONSTRAINT "SchoolFeeRefund_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "SchoolFeePayment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
