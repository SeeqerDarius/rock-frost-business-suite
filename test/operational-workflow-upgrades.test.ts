import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("production operational workflow upgrades", () => {
  it("removes direct HR termination and requires the controlled workflow", () => {
    const employees = read("src/app/app/hr/employees/page.tsx");
    const actions = read("src/app/app/hr/employees/actions.ts");
    const terminations = read("src/app/app/hr/terminations/actions.ts");
    expect(employees).not.toContain('name="status" value="TERMINATED"');
    expect(actions).toContain('["ACTIVE", "ON_LEAVE", "SUSPENDED"]');
    expect(terminations).toContain("verifyCurrentPassword");
    expect(terminations).toContain("verifyTotpCode");
    expect(terminations).toContain("HR_TERMINATIONS_APPROVE");
  });

  it("keeps driver submissions pending until manager verification", () => {
    const schema = read("prisma/schema.prisma");
    const service = read("src/modules/fleet/service.ts");
    expect(schema).toContain("model FleetDriverPaymentSubmission");
    expect(schema).toContain("status          FleetDriverSubmissionStatus @default(PENDING)");
    expect(service).toContain('status: approved ? "APPROVED" : "REJECTED"');
    expect(service).toContain('status: "VERIFIED"');
  });

  it("posts opening balances through double entry and records reconciliations", () => {
    const service = read("src/modules/accounting/service.ts");
    expect(service).toContain('sourceType: "OPENING_BALANCE"');
    expect(service).toContain("postJournalEntry(tx, organizationId");
    expect(service).toContain("statementBalance.minus(ledgerBalance)");
    expect(read("src/app/app/accounting/cashbook/page.tsx")).toContain("Complete reconciliation");
  });

  it("runs approved effective terminations from the authenticated daily job", () => {
    const cron = read("src/app/api/cron/expire-trials/route.ts");
    expect(cron).toContain("processEffectiveTerminations");
    expect(cron).toContain("isAuthorized(request)");
  });
});
