import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("HR membership synchronization contract", () => {
  it("creates HR employees only when HR is enabled and keeps external stakeholders out", () => {
    const service = read("src/modules/hr/service.ts");
    expect(service).toContain('module: { code: "hr" }');
    expect(service).toContain('status: "ACTIVE"');
    expect(service).toContain('new Set(["Vehicle Owner", "Investor"])');
    expect(service).toContain('action: "employee.provisioned_from_membership"');
  });

  it("hooks role changes, invitation acceptance, reactivation, and HR activation", () => {
    const administration = read("src/app/app/(overview)/administration/actions.ts");
    const invitations = read("src/lib/auth/invitations.ts");
    const platform = read("src/app/app/platform/actions.ts");
    expect(administration.match(/ensureHrEmployeeForUser/g)?.length).toBeGreaterThanOrEqual(3);
    expect(invitations.match(/ensureHrEmployeeForUser/g)?.length).toBeGreaterThanOrEqual(3);
    expect(platform).toContain("syncActiveOrganizationMembersToHr");
  });
});
