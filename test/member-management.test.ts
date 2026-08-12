import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const actions = readFileSync("src/app/app/(overview)/administration/actions.ts", "utf8");
const page = readFileSync("src/app/app/(overview)/administration/page.tsx", "utf8");
const seats = readFileSync("src/platform/subscriptions/seats.ts", "utf8");

describe("tenant member management", () => {
  it("provides reversible deactivation and immediate seat release", () => {
    expect(actions).toContain("export async function deactivateMember");
    expect(actions).toContain('data: { status: "SUSPENDED" }');
    expect(actions).toContain("export async function reactivateMember");
    expect(actions).toContain("assertRoleHasAvailableSeats");
    expect(seats).toContain('const COUNTED_MEMBER_STATUSES = ["ACTIVE", "INVITED"]');
    expect(page).toContain("Deactivated members release their seats immediately");
  });

  it("protects tenant and role boundaries during member changes", () => {
    expect(actions).toContain("organizationId: tenant.organizationId");
    expect(actions).toContain("getAssignableRole(tenant.organizationId, tenant.enabledModuleKeys");
    expect(actions).toContain('redirect("/app/administration?error=self-deactivate")');
    expect(actions).toContain('throw new Error("LAST_OWNER")');
  });

  it("shows role controls and remaining seats", () => {
    expect(page).toContain("action={changeMemberRole}");
    expect(page).toContain("action={deactivateMember}");
    expect(page).toContain("action={reactivateMember}");
    expect(page).toContain("remaining");
  });
});
