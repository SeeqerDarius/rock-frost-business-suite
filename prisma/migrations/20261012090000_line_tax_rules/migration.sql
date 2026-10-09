-- Per-line tax rules (additive, nullable columns only).
ALTER TABLE "AccountingInvoiceLine" ADD COLUMN "taxRuleId" TEXT;
ALTER TABLE "AccountingBillLine" ADD COLUMN "taxRuleId" TEXT;
ALTER TABLE "AccountingCreditNoteLine" ADD COLUMN "taxRuleId" TEXT;
ALTER TABLE "DocumentTaxLine" ADD COLUMN "taxRuleId" TEXT;
