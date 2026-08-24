import { describe, it, expect, beforeAll, afterAll } from "vitest";
import * as hr from "@/modules/hr/service";
import { createTestOrg, cleanupTestOrg, type TestOrg } from "../setup/fixtures";

/**
 * Real-Postgres equivalent of the mocked IDOR coverage for
 * src/modules/hr/service.ts. Every foreign-id validation here goes through
 * requireEmployee() (employeeId/managerId scoped to organizationId) or a
 * direct hrLeaveType lookup (leaveTypeId), both of which throw the module's
 * own exported hr.NotFoundError.
 */

let orgA: TestOrg;
let orgB: TestOrg;

let orgBEmployee: Awaited<ReturnType<typeof hr.createEmployee>>;
let orgAEmployee: Awaited<ReturnType<typeof hr.createEmployee>>;
let orgALeaveType: Awaited<ReturnType<typeof hr.createLeaveType>>;
let orgBLeaveType: Awaited<ReturnType<typeof hr.createLeaveType>>;

beforeAll(async () => {
  orgA = await createTestOrg("orgA-hr");
  orgB = await createTestOrg("orgB-hr");

  orgBEmployee = await hr.createEmployee(orgB.organizationId, { fullName: "Org B Employee", hireDate: new Date("2025-01-01") });
  orgAEmployee = await hr.createEmployee(orgA.organizationId, { fullName: "Org A Employee", hireDate: new Date("2025-01-01") });
  orgALeaveType = await hr.createLeaveType(orgA.organizationId, { name: "Org A Vacation", defaultDaysPerYear: 20 });
  orgBLeaveType = await hr.createLeaveType(orgB.organizationId, { name: "Org B Vacation", defaultDaysPerYear: 20 });
});

afterAll(async () => {
  await cleanupTestOrg(orgA);
  await cleanupTestOrg(orgB);
});

describe("HR service — cross-tenant isolation against real Postgres", () => {
  it("createEmployee rejects a managerId from another organization", async () => {
    await expect(
      hr.createEmployee(orgA.organizationId, {
        fullName: "Should Fail",
        hireDate: new Date("2025-01-01"),
        managerId: orgBEmployee.id,
      }),
    ).rejects.toThrow(hr.NotFoundError);
  });

  it("updateEmployee rejects a managerId from another organization", async () => {
    await expect(
      hr.updateEmployee(orgA.organizationId, orgAEmployee.id, {
        fullName: orgAEmployee.fullName,
        hireDate: orgAEmployee.hireDate,
        managerId: orgBEmployee.id,
      }),
    ).rejects.toThrow(hr.NotFoundError);
  });

  it("createLeaveRequest rejects an employeeId from another organization", async () => {
    await expect(
      hr.createLeaveRequest(orgA.organizationId, {
        employeeId: orgBEmployee.id,
        leaveTypeId: orgALeaveType.id,
        startDate: new Date("2026-02-01"),
        endDate: new Date("2026-02-03"),
      }),
    ).rejects.toThrow(hr.NotFoundError);
  });

  it("createLeaveRequest rejects a leaveTypeId from another organization, even under Org A's own employee", async () => {
    await expect(
      hr.createLeaveRequest(orgA.organizationId, {
        employeeId: orgAEmployee.id,
        leaveTypeId: orgBLeaveType.id,
        startDate: new Date("2026-02-01"),
        endDate: new Date("2026-02-03"),
      }),
    ).rejects.toThrow(hr.NotFoundError);
  });

  it("createReview rejects an employeeId from another organization", async () => {
    await expect(
      hr.createReview(orgA.organizationId, {
        employeeId: orgBEmployee.id,
        reviewPeriodStart: new Date("2026-01-01"),
        reviewPeriodEnd: new Date("2026-03-31"),
      }),
    ).rejects.toThrow(hr.NotFoundError);
  });

  it("listEmployees scoped to Org A never returns Org B's employee", async () => {
    const list = await hr.listEmployees(orgA.organizationId);
    expect(list.map((e) => e.id)).not.toContain(orgBEmployee.id);
    expect(list.map((e) => e.id)).toContain(orgAEmployee.id);
  });

  it("createResumeEntry rejects an employeeId from another organization, and a legitimate entry round-trips through getEmployeeProfile", async () => {
    await expect(
      hr.createResumeEntry(orgA.organizationId, orgBEmployee.id, { title: "Should fail", type: "EXPERIENCE", dateStart: new Date("2025-01-01") }),
    ).rejects.toThrow(hr.NotFoundError);

    const entry = await hr.createResumeEntry(orgA.organizationId, orgAEmployee.id, {
      title: "Sales Manager at Acme Ltd",
      type: "EXPERIENCE",
      dateStart: new Date("2023-01-01"),
      dateEnd: new Date("2024-12-31"),
      description: "Led the regional sales team.",
    });
    const profile = await hr.getEmployeeProfile(orgA.organizationId, orgAEmployee.id);
    expect(profile?.resumeEntries.map((e) => e.id)).toContain(entry.id);

    await expect(hr.updateResumeEntry(orgB.organizationId, entry.id, { title: "Cross-tenant edit", type: "EXPERIENCE", dateStart: new Date() })).rejects.toThrow(hr.NotFoundError);
  });

  it("Skills: a skill created under Org A's skill type is invisible to Org B, and cross-tenant assignment is rejected", async () => {
    const skillType = await hr.createSkillType(orgA.organizationId, "Languages");
    const skill = await hr.createSkill(orgA.organizationId, skillType.id, "French");

    // Org B can't create a skill under Org A's skill type.
    await expect(hr.createSkill(orgB.organizationId, skillType.id, "Should fail")).rejects.toThrow(hr.NotFoundError);
    // Org B can't assign Org A's skill to its own employee.
    await expect(hr.setEmployeeSkill(orgB.organizationId, orgBEmployee.id, skill.id, 3)).rejects.toThrow(hr.NotFoundError);
    // Org A's own employee can be assigned the skill, and it shows up in the inventory with the right average level.
    const assignment = await hr.setEmployeeSkill(orgA.organizationId, orgAEmployee.id, skill.id, 4);
    expect(assignment.level).toBe(4);
    const inventory = await hr.getSkillsInventory(orgA.organizationId);
    const row = inventory.find((r) => r.skillName === "French");
    expect(row?.employeeCount).toBe(1);
    expect(row?.averageLevel).toBe(4);
    // The inventory never leaks into Org B, which has no skill types at all.
    expect(await hr.getSkillsInventory(orgB.organizationId)).toEqual([]);
  });
});
