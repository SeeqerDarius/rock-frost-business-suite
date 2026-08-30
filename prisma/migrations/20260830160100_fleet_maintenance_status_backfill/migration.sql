-- Backfill: REVIEWING's real meaning ("awaiting the vehicle owner's own
-- approval decision") gets its own value going forward.
UPDATE "FleetMaintenanceRequest" SET "progressStatus" = 'AWAITING_OWNER_APPROVAL' WHERE "progressStatus" = 'REVIEWING';

-- Backfill: a request D1 already backfilled a mechanicId onto (still sitting
-- at APPROVED, since D1 predates this status split) moves to ASSIGNED - the
-- new state that now means "has a mechanic, not yet scheduled."
UPDATE "FleetMaintenanceRequest" SET "progressStatus" = 'ASSIGNED' WHERE "progressStatus" = 'APPROVED' AND "mechanicId" IS NOT NULL;

-- Backfill: a completed-and-verified repair moves to the new terminal
-- VERIFIED state, replacing the completionVerified boolean below.
UPDATE "FleetMaintenanceRequest" SET "progressStatus" = 'VERIFIED' WHERE "progressStatus" = 'COMPLETED' AND "completionVerified" = true;

-- Backfill: every historical CANCELLED row was produced by an explicit
-- manager or owner decline (confirmed by reading every progressStatus write
-- site before this migration was written) - relabel accordingly. CANCELLED
-- itself is repurposed for withdrawMaintenanceRequest(), a genuinely new
-- action with no historical rows yet.
UPDATE "FleetMaintenanceRequest" SET "progressStatus" = 'REJECTED' WHERE "progressStatus" = 'CANCELLED';

-- Cutover: the boolean is fully superseded by the VERIFIED status above.
ALTER TABLE "FleetMaintenanceRequest" DROP COLUMN "completionVerified";
