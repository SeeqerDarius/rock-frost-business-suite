CREATE TYPE "SubscriptionPaymentStatus" AS ENUM ('SUCCESS', 'FAILED');

ALTER TABLE "Subscription"
ADD COLUMN "paystackPlanCode" TEXT,
ADD COLUMN "paystackSubscriptionCode" TEXT,
ADD COLUMN "paystackCustomerCode" TEXT,
ADD COLUMN "paystackEmailToken" TEXT,
ADD COLUMN "paystackNextPaymentAt" TIMESTAMP(3),
ADD COLUMN "paystackSubscriptionStatus" TEXT,
ADD COLUMN "lastRenewalAt" TIMESTAMP(3),
ADD COLUMN "lastPaymentFailureAt" TIMESTAMP(3),
ADD COLUMN "renewalFailureCount" INTEGER NOT NULL DEFAULT 0;

CREATE TABLE "SubscriptionPayment" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "subscriptionId" TEXT NOT NULL,
  "gatewayProvider" "PaymentGatewayProvider" NOT NULL,
  "paymentReference" TEXT NOT NULL,
  "invoiceCode" TEXT,
  "status" "SubscriptionPaymentStatus" NOT NULL,
  "amount" DECIMAL(18,2) NOT NULL,
  "currency" TEXT NOT NULL,
  "paidAt" TIMESTAMP(3),
  "failureReason" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SubscriptionPayment_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Subscription_paystackPlanCode_key" ON "Subscription"("paystackPlanCode");
CREATE UNIQUE INDEX "Subscription_paystackSubscriptionCode_key" ON "Subscription"("paystackSubscriptionCode");
CREATE UNIQUE INDEX "SubscriptionPayment_gatewayProvider_paymentReference_key" ON "SubscriptionPayment"("gatewayProvider", "paymentReference");
CREATE INDEX "SubscriptionPayment_organizationId_createdAt_idx" ON "SubscriptionPayment"("organizationId", "createdAt");
CREATE INDEX "SubscriptionPayment_subscriptionId_createdAt_idx" ON "SubscriptionPayment"("subscriptionId", "createdAt");

ALTER TABLE "SubscriptionPayment" ADD CONSTRAINT "SubscriptionPayment_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SubscriptionPayment" ADD CONSTRAINT "SubscriptionPayment_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "Subscription"("id") ON DELETE CASCADE ON UPDATE CASCADE;
