import { describe, it, expect, beforeAll, afterAll } from "vitest";
import * as hr from "@/modules/hr/service";
import { createTestOrg, cleanupTestOrg, type TestOrg } from "../setup/fixtures";

/**
 * Real-Postgres coverage for launchPlan()'s owner-rule resolution
 * (src/modules/hr/service.ts) — the part of the Launch Plan system with no
 * mocked-db equivalent, since it depends on real relational lookups
 * (manager.userId, an HR-permission-holding organizationMember) rather than
 * simple foreign-id validation.
 */

let orgA: TestOrg;
let orgB: TestOrg;

beforeAll(async () => {
  orgA = await createTestOrg("orgA-hr-launch-plan");
  orgB = await createTestOrg("orgB-hr-launch-plan");
  // Auto-provisions an HrEmployee (with userId set) for each org's owner membership.
  await hr.listEmployees(orgA.organizationId);
  await hr.listEmployees(orgB.organizationId);
});

afterAll(async () => {
  await cleanupTestOrg(orgA);
  await cleanupTestOrg(orgB);
});

describe("launchPlan owner-rule resolution against real Postgres", () => {
  it("resolves EMPLOYEE/MANAGER/HR_MANAGER/UNASSIGNED rules to the correct user ids, leaving unresolvable rules null rather than guessed", async () => {
    // createEmployee's EmployeeInput has no userId field (by design — an employee only
    // gets a linked account through the real membership flow), so the auto-provisioned
    // owner employee from beforeAll is reused as the "manager with a linked account".
    const [ownerEmployee] = await hr.listEmployees(orgA.organizationId);
    const report = await hr.createEmployee(orgA.organizationId, { fullName: "New Report, No Account", hireDate: new Date("2025-06-01"), managerId: ownerEmployee.id });

    const template = await hr.createPlanTemplate(orgA.organizationId, {
      kind: "ONBOARDING",
      name: "Standard onboarding",
      activities: [
        { title: "Assigned to employee", activityType: "TODO", dueDateOffsetDays: 0, ownerRule: "EMPLOYEE" },
        { title: "Assigned to manager", activityType: "TODO", dueDateOffsetDays: 1, ownerRule: "MANAGER" },
        { title: "Assigned to HR manager", activityType: "TODO", dueDateOffsetDays: 2, ownerRule: "HR_MANAGER" },
        { title: "Left unassigned", activityType: "TODO", dueDateOffsetDays: 3, ownerRule: "UNASSIGNED" },
      ],
    });

    const instance = await hr.launchPlan(orgA.organizationId, {
      employeeId: report.id,
      kind: "ONBOARDING",
      templateId: template.id,
      targetDate: new Date("2026-01-01"),
      launchedById: orgA.userId,
    });

    const byTitle = Object.fromEntries(instance.activities.map((a) => [a.title, a.ownerId]));
    expect(byTitle["Assigned to employee"]).toBeNull(); // report has no linked user account
    expect(byTitle["Assigned to manager"]).toBe(orgA.userId); // manager is the owner employee, linked to orgA.userId
    expect(byTitle["Assigned to HR manager"]).toBe(orgA.userId); // org owner holds hr.employees.manage
    expect(byTitle["Left unassigned"]).toBeNull();
  });

  it("resolves HR_MANAGER within each organization independently — never crosses tenants", async () => {
    const orgBReport = await hr.createEmployee(orgB.organizationId, { fullName: "Org B Report", hireDate: new Date("2025-06-01") });
    const orgBTemplate = await hr.createPlanTemplate(orgB.organizationId, {
      kind: "ONBOARDING",
      name: "Org B onboarding",
      activities: [{ title: "HR manager task", activityType: "TODO", dueDateOffsetDays: 0, ownerRule: "HR_MANAGER" }],
    });

    const instance = await hr.launchPlan(orgB.organizationId, {
      employeeId: orgBReport.id,
      kind: "ONBOARDING",
      templateId: orgBTemplate.id,
      targetDate: new Date("2026-01-01"),
      launchedById: orgB.userId,
    });

    expect(instance.activities[0].ownerId).toBe(orgB.userId);
    expect(instance.activities[0].ownerId).not.toBe(orgA.userId);
  });
});
