-- Fail clearly instead of allowing an ambiguous scanner result. PostgreSQL
-- unique indexes permit multiple NULL values, so barcodes remain optional.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM "PharmacyMedicine"
    WHERE "barcode" IS NOT NULL
    GROUP BY "organizationId", "barcode" HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'Duplicate pharmacy medicine barcodes must be resolved before this migration can run.';
  END IF;
  IF EXISTS (
    SELECT 1 FROM "PharmacyBatch"
    WHERE "barcode" IS NOT NULL
    GROUP BY "organizationId", "barcode" HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'Duplicate pharmacy batch barcodes must be resolved before this migration can run.';
  END IF;
END $$;

DROP INDEX IF EXISTS "PharmacyMedicine_organizationId_barcode_idx";
DROP INDEX IF EXISTS "PharmacyBatch_organizationId_barcode_idx";

CREATE UNIQUE INDEX "PharmacyMedicine_organizationId_barcode_key"
ON "PharmacyMedicine"("organizationId", "barcode");

CREATE UNIQUE INDEX "PharmacyBatch_organizationId_barcode_key"
ON "PharmacyBatch"("organizationId", "barcode");
