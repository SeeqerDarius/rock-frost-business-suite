import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * User-reported bugs and requests on the Fleet Drivers/Owners pages:
 * (1) the driver-login and owner-portal dropdowns showed every active
 * organization member, including people like the Organization Owner who
 * are neither; (2) adding a driver/owner had no way to actually invite that
 * person - a manager had to separately go to Administration. These tests
 * verify the wiring rather than executing the actions end-to-end (which
 * would require mocking a long, already-trusted chain shared with
 * Administration's own inviteMember) - see test/fleet-driver-role-sync.test.ts
 * for behavioral coverage of the underlying service functions.
 */
describe("Fleet driver/owner dropdown scoping and invite-by-email", () => {
  const driversPage = readFileSync("src/app/app/fleet/drivers/page.tsx", "utf8");
  const driversActions = readFileSync("src/app/app/fleet/drivers/actions.ts", "utf8");
  const ownersPage = readFileSync("src/app/app/fleet/owners/page.tsx", "utf8");
  const ownersActions = readFileSync("src/app/app/fleet/owners/actions.ts", "utf8");
  const fleetService = readFileSync("src/modules/fleet/service.ts", "utf8");

  it("no longer offers the unfiltered every-active-member list on either dropdown", () => {
    expect(fleetService).not.toContain("export async function listAssignableFleetUsers(");
    expect(driversPage).not.toContain("listAssignableFleetUsers");
    expect(ownersPage).not.toContain("listAssignableFleetUsers");
  });

  it("scopes the Drivers page's login dropdown to listAssignableDriverUsers", () => {
    expect(fleetService).toContain("export async function listAssignableDriverUsers(");
    expect(driversPage).toContain("listAssignableDriverUsers");
  });

  it("scopes the Owners page's portal-login dropdown to listAssignableOwnerUsers", () => {
    expect(fleetService).toContain("export async function listAssignableOwnerUsers(");
    expect(ownersPage).toContain("listAssignableOwnerUsers");
  });

  it("adds an Invite driver action gated on Fleet's own manage permission, targeting the fixed Driver role", () => {
    expect(driversActions).toContain("export async function inviteFleetDriver(");
    expect(driversActions).toContain("PERMISSIONS.FLEET_DRIVERS_MANAGE");
    expect(driversActions).toContain('name: "Driver"');
    expect(driversActions).toContain("createInvitation(");
    expect(driversActions).toContain("sendEmail(");
    expect(driversPage).toContain("inviteFleetDriver");
    expect(driversPage).toContain("Invite driver");
  });

  it("adds an Invite owner action gated on Fleet's own manage permission, targeting the fixed Vehicle Owner role", () => {
    expect(ownersActions).toContain("export async function inviteFleetOwner(");
    expect(ownersActions).toContain("PERMISSIONS.FLEET_OWNERS_MANAGE");
    expect(ownersActions).toContain('name: "Vehicle Owner"');
    expect(ownersActions).toContain("createInvitation(");
    expect(ownersActions).toContain("sendEmail(");
    expect(ownersPage).toContain("inviteFleetOwner");
    expect(ownersPage).toContain("Invite owner");
  });

  it("neither invite action reuses Administration's ORG_SETTINGS_MANAGE gate", () => {
    // A Fleet manager without full Administration access should still be
    // able to invite drivers/owners from the Fleet pages.
    expect(driversActions).not.toContain("hasPermission(tenant, PERMISSIONS.ORG_SETTINGS_MANAGE)");
    expect(ownersActions).not.toContain("hasPermission(tenant, PERMISSIONS.ORG_SETTINGS_MANAGE)");
  });

  it("links a pre-existing unlinked roster row by email on acceptance instead of duplicating it", () => {
    expect(fleetService).toContain("findFirst({ where: { organizationId, userId: null, email: user.email } })");
  });
});
