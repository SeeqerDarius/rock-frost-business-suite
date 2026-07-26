CREATE TYPE "PaymentGatewayProvider" AS ENUM ('PAYSTACK', 'FLUTTERWAVE');

ALTER TABLE "Subscription"
  ADD COLUMN "gatewayProvider" "PaymentGatewayProvider";

CREATE INDEX "Subscription_gatewayProvider_paymentReference_idx" ON "Subscription"("gatewayProvider", "paymentReference");
