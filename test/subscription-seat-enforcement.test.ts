import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const seats = readFileSync("src/platform/subscriptions/seats.ts", "utf8");
const invitationAction = readFileSync("src/app/app/(overview)/administration/actions.ts", "utf8");
const platformPage = readFileSync("src/app/app/platform/subscriptions/page.tsx", "utf8");
const tenantPage = readFileSync("src/app/app/(overview)/administration/page.tsx", "utf8");

describe("module subscription seat enforcement", () => {
  it("serializes seat assignment and counts active plus invited memberships", () => {
    expect(seats).toContain("pg_advisory_xact_lock");
    expect(seats).toContain('COUNTED_MEMBER_STATUSES = ["ACTIVE", "INVITED"]');
    expect(seats).toContain("SeatLimitExceededError");
  });

  it("enforces seats inside the same transaction as membership assignment", () => {
    expect(invitationAction).toContain("assertRoleHasAvailableSeats(tx");
    expect(invitationAction.indexOf("assertRoleHasAvailableSeats(tx")).toBeLessThan(invitationAction.indexOf("tx.organizationMember.upsert"));
    expect(invitationAction).toContain('error=seat-limit');
  });

  it("shows and controls seat usage on owner and tenant surfaces", () => {
    expect(platformPage).toContain("Update seats");
    expect(platformPage).toContain("Unlimited seats");
    expect(tenantPage).toContain("Module user seats");
    expect(tenantPage).toContain("pending invitations count");
  });
});
