ALTER TABLE "AccountingJournalEntry"
  ADD COLUMN "branchId" TEXT,
  ADD COLUMN "sourceModule" TEXT;

UPDATE "AccountingJournalEntry"
SET "sourceModule" = CASE
  WHEN "sourceType" IN (
    'INVOICE', 'INVOICE_VOID', 'ACCOUNTING_RECEIVABLE_PAYMENT', 'EXPENSE',
    'OPENING_BALANCE', 'MANUAL', 'PETTY_CASH_FUNDING', 'PETTY_CASH_EXPENSE',
    'PETTY_CASH_REPLENISHMENT', 'PETTY_CASH_CLOSE'
  ) THEN 'accounting'
  WHEN "sourceType" LIKE 'PROCUREMENT_%' THEN 'procurement'
  WHEN "sourceType" LIKE 'FLEET_%' THEN 'fleet'
  WHEN "sourceType" LIKE 'PHARMACY_%' THEN 'pharmacy'
  WHEN "sourceType" LIKE 'HOSPITAL_%' THEN 'hospital'
  WHEN "sourceType" LIKE 'POS_%' THEN 'pos'
  WHEN "sourceType" LIKE 'INSTALLMENT_%' OR "sourceType" LIKE 'HIRE_PURCHASE_%' THEN 'installment'
  WHEN "sourceType" LIKE 'HOSTEL_%' THEN 'hostel'
  WHEN "sourceType" LIKE 'HOTEL_%' THEN 'hotel'
  WHEN "sourceType" LIKE 'SCHOOL_%' THEN 'school'
  ELSE NULL
END;

UPDATE "AccountingJournalEntry" journal
SET "branchId" = invoice."branchId"
FROM "AccountingInvoice" invoice
WHERE journal."sourceId" = invoice."id"
  AND journal."sourceType" IN ('INVOICE', 'INVOICE_VOID')
  AND invoice."organizationId" = journal."organizationId";

UPDATE "AccountingJournalEntry" journal
SET "branchId" = invoice."branchId"
FROM "AccountingReceivablePayment" payment
JOIN "AccountingInvoice" invoice ON invoice."id" = payment."invoiceId"
WHERE journal."sourceId" = payment."id"
  AND journal."sourceType" = 'ACCOUNTING_RECEIVABLE_PAYMENT'
  AND payment."organizationId" = journal."organizationId";

UPDATE "AccountingJournalEntry" journal
SET "branchId" = expense."branchId"
FROM "AccountingExpense" expense
WHERE journal."sourceId" = expense."id"
  AND journal."sourceType" = 'EXPENSE'
  AND expense."organizationId" = journal."organizationId";

UPDATE "AccountingJournalEntry" reversal
SET
  "sourceModule" = original."sourceModule",
  "branchId" = original."branchId"
FROM "AccountingJournalEntry" original
WHERE reversal."reversalOfId" = original."id"
  AND reversal."organizationId" = original."organizationId";

ALTER TABLE "AccountingJournalEntry"
  ADD CONSTRAINT "AccountingJournalEntry_branchId_fkey"
  FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "AccountingJournalEntry_organizationId_sourceModule_entryDate_idx"
  ON "AccountingJournalEntry"("organizationId", "sourceModule", "entryDate");

CREATE INDEX "AccountingJournalEntry_branchId_entryDate_idx"
  ON "AccountingJournalEntry"("branchId", "entryDate");
