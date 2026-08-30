-- Backfill: every distinct historical "mechanicAssigned" free-text value
-- becomes one FleetMechanic row (external - no linked userId, since a
-- manager typed a name rather than a login). Ties on the same
-- case-insensitive name within one organization keep the earliest-recorded
-- casing as canonical, for a deterministic result.
INSERT INTO "FleetMechanic" (id, "organizationId", name, status, "createdAt", "updatedAt")
SELECT DISTINCT ON ("organizationId", lower(trim("mechanicAssigned")))
  gen_random_uuid()::text, "organizationId", trim("mechanicAssigned"), 'ACTIVE', now(), now()
FROM "FleetMaintenanceRequest"
WHERE "mechanicAssigned" IS NOT NULL AND trim("mechanicAssigned") <> ''
ORDER BY "organizationId", lower(trim("mechanicAssigned")), "requestedAt" ASC;

-- Cutover: point every request at its backfilled mechanic row.
UPDATE "FleetMaintenanceRequest" r SET "mechanicId" = m.id
FROM "FleetMechanic" m
WHERE m."organizationId" = r."organizationId" AND lower(trim(m.name)) = lower(trim(r."mechanicAssigned"));

-- Backfill: every existing single maintenance photo becomes the first
-- FleetMaintenanceAttachment row for its request.
INSERT INTO "FleetMaintenanceAttachment" (id, "organizationId", "requestId", "fileAssetId", "createdAt")
SELECT gen_random_uuid()::text, "organizationId", "id", "photoAssetId", COALESCE("requestedAt", now())
FROM "FleetMaintenanceRequest" WHERE "photoAssetId" IS NOT NULL;

-- Cutover: the free-text field is fully superseded by "mechanicId" now that
-- every historical value has been migrated above.
ALTER TABLE "FleetMaintenanceRequest" DROP COLUMN "mechanicAssigned";
