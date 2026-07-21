import { describe, it, expect, vi, beforeEach } from "vitest";

const mockDb = {
  project: { findFirst: vi.fn() },
  organizationMember: { findFirst: vi.fn(), upsert: vi.fn() },
  projectMember: { upsert: vi.fn(), delete: vi.fn() },
  projectMilestone: { findFirst: vi.fn(), create: vi.fn() },
  projectTask: { create: vi.fn() },
  hrEmployee: { findFirst: vi.fn() },
  payrollCompensation: { upsert: vi.fn() },
  role: { findFirst: vi.fn() },
  user: { upsert: vi.fn() },
  auditLog: { create: vi.fn() },
  $transaction: vi.fn(),
};

const mockRequireCurrentTenant = vi.fn();
const mockGetServerAuthSession = vi.fn();
const mockSendEmail = vi.fn();
const mockCreateInvitation = vi.fn();

class RedirectSignal extends Error {
  constructor(public url: string) {
    super(`redirect:${url}`);
  }
}

vi.mock("@/lib/db", () => ({ db: mockDb }));
vi.mock("@/lib/tenant", () => ({ requireCurrentTenant: mockRequireCurrentTenant }));
vi.mock("@/lib/auth/session", () => ({ getServerAuthSession: mockGetServerAuthSession }));
vi.mock("@/lib/email", () => ({ sendEmail: mockSendEmail }));
vi.mock("@/lib/auth/invitations", () => ({
  createInvitation: mockCreateInvitation,
  resendInvitation: vi.fn(),
  revokeInvitation: vi.fn(),
  markInvitationDeliveryFailed: vi.fn(),
  InvitationError: class InvitationError extends Error {},
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new RedirectSignal(url);
  },
}));

const projectsService = await import("@/modules/projects/service");
const payrollService = await import("@/modules/payroll/service");
const { inviteMember } = await import("@/app/app/(overview)/administration/actions");

const ORG = "org-1";

beforeEach(() => {
  vi.clearAllMocks();
});

/**
 * Regression tests for §4 of docs/HARDENING_PLAN.md — every one of these
 * paths previously accepted a foreign-organization id without validation.
 */
describe("Projects service — cross-tenant IDOR fixes", () => {
  it("addProjectMember rejects a project id from another organization", async () => {
    mockDb.project.findFirst.mockResolvedValue(null); // not found under ORG

    await expect(projectsService.addProjectMember(ORG, "proj-foreign", "user-1")).rejects.toThrow(
      projectsService.NotFoundError,
    );
    expect(mockDb.project.findFirst).toHaveBeenCalledWith({ where: { id: "proj-foreign", organizationId: ORG } });
    expect(mockDb.projectMember.upsert).not.toHaveBeenCalled();
  });

  it("addProjectMember rejects a user who isn't an active member of the organization", async () => {
    mockDb.project.findFirst.mockResolvedValue({ id: "proj-1", organizationId: ORG });
    mockDb.organizationMember.findFirst.mockResolvedValue(null);

    await expect(projectsService.addProjectMember(ORG, "proj-1", "user-foreign")).rejects.toThrow(
      projectsService.NotFoundError,
    );
    expect(mockDb.projectMember.upsert).not.toHaveBeenCalled();
  });

  it("addProjectMember succeeds when both the project and user belong to the organization", async () => {
    mockDb.project.findFirst.mockResolvedValue({ id: "proj-1", organizationId: ORG });
    mockDb.organizationMember.findFirst.mockResolvedValue({ id: "mem-1", userId: "user-1", organizationId: ORG });
    mockDb.projectMember.upsert.mockResolvedValue({ projectId: "proj-1", userId: "user-1" });

    await projectsService.addProjectMember(ORG, "proj-1", "user-1");
    expect(mockDb.projectMember.upsert).toHaveBeenCalled();
  });

  it("removeProjectMember rejects a project id from another organization", async () => {
    mockDb.project.findFirst.mockResolvedValue(null);

    await expect(projectsService.removeProjectMember(ORG, "proj-foreign", "user-1")).rejects.toThrow(
      projectsService.NotFoundError,
    );
    expect(mockDb.projectMember.delete).not.toHaveBeenCalled();
  });

  it("createMilestone rejects a project id from another organization", async () => {
    mockDb.project.findFirst.mockResolvedValue(null);

    await expect(
      projectsService.createMilestone(ORG, { projectId: "proj-foreign", name: "M1" }),
    ).rejects.toThrow(projectsService.NotFoundError);
    expect(mockDb.projectMilestone.create).not.toHaveBeenCalled();
  });

  it("createTask rejects a project id from another organization", async () => {
    mockDb.project.findFirst.mockResolvedValue(null);

    await expect(
      projectsService.createTask(ORG, { projectId: "proj-foreign", title: "T1" }),
    ).rejects.toThrow(projectsService.NotFoundError);
    expect(mockDb.projectTask.create).not.toHaveBeenCalled();
  });

  it("createTask rejects a milestone id that doesn't belong to the given project", async () => {
    mockDb.project.findFirst.mockResolvedValue({ id: "proj-1", organizationId: ORG });
    mockDb.projectMilestone.findFirst.mockResolvedValue(null); // foreign milestone

    await expect(
      projectsService.createTask(ORG, { projectId: "proj-1", milestoneId: "mile-foreign", title: "T1" }),
    ).rejects.toThrow(projectsService.NotFoundError);
    expect(mockDb.projectTask.create).not.toHaveBeenCalled();
  });

  it("createTask rejects an assignee who isn't an active member of the organization", async () => {
    mockDb.project.findFirst.mockResolvedValue({ id: "proj-1", organizationId: ORG });
    mockDb.organizationMember.findFirst.mockResolvedValue(null);

    await expect(
      projectsService.createTask(ORG, { projectId: "proj-1", assigneeId: "user-foreign", title: "T1" }),
    ).rejects.toThrow(projectsService.NotFoundError);
    expect(mockDb.projectTask.create).not.toHaveBeenCalled();
  });

  it("createTask succeeds when project, milestone, and assignee all belong to the organization", async () => {
    mockDb.project.findFirst.mockResolvedValue({ id: "proj-1", organizationId: ORG });
    mockDb.projectMilestone.findFirst.mockResolvedValue({ id: "mile-1", projectId: "proj-1" });
    mockDb.organizationMember.findFirst.mockResolvedValue({ id: "mem-1", userId: "user-1" });
    mockDb.projectTask.create.mockResolvedValue({ id: "task-1" });

    await projectsService.createTask(ORG, {
      projectId: "proj-1",
      milestoneId: "mile-1",
      assigneeId: "user-1",
      title: "T1",
    });
    expect(mockDb.projectTask.create).toHaveBeenCalled();
  });
});

describe("Payroll service — cross-tenant compensation IDOR fix", () => {
  it("setCompensation rejects an employee id from another organization", async () => {
    mockDb.hrEmployee.findFirst.mockResolvedValue(null);

    await expect(
      payrollService.setCompensation(ORG, {
        employeeId: "emp-foreign",
        baseSalary: "1000.00",
        effectiveDate: new Date("2026-01-01"),
      }),
    ).rejects.toThrow(payrollService.NotFoundError);
    expect(mockDb.hrEmployee.findFirst).toHaveBeenCalledWith({ where: { id: "emp-foreign", organizationId: ORG } });
    expect(mockDb.payrollCompensation.upsert).not.toHaveBeenCalled();
  });

  it("setCompensation succeeds when the employee belongs to the organization", async () => {
    mockDb.hrEmployee.findFirst.mockResolvedValue({ id: "emp-1", organizationId: ORG });
    mockDb.payrollCompensation.upsert.mockResolvedValue({ employeeId: "emp-1" });

    await payrollService.setCompensation(ORG, {
      employeeId: "emp-1",
      baseSalary: "1000.00",
      effectiveDate: new Date("2026-01-01"),
    });
    expect(mockDb.payrollCompensation.upsert).toHaveBeenCalled();
  });
});

describe("Administration inviteMember() — cross-tenant role IDOR fix", () => {
  function tenant() {
    return {
      organizationId: ORG,
      organization: { name: "Org One" },
      permissions: ["org.settings.manage"],
    };
  }

  function formData(roleId: string) {
    const fd = new FormData();
    fd.set("name", "New User");
    fd.set("email", "new.user@example.com");
    fd.set("roleId", roleId);
    return fd;
  }

  it("rejects a roleId belonging to another organization (Prisma's OR clause excludes it, findFirst resolves null)", async () => {
    mockRequireCurrentTenant.mockResolvedValue(tenant());
    // A role scoped to OTHER_ORG and not a system role never satisfies
    // `OR: [{organizationId: ORG}, {isSystem: true}]` — simulate Prisma
    // correctly returning null for it, exactly as it would against the real DB.
    mockDb.role.findFirst.mockResolvedValue(null);

    await expect(inviteMember(formData("role-from-other-org"))).rejects.toThrow(RedirectSignal);
    await expect(inviteMember(formData("role-from-other-org"))).rejects.toThrow("?error=invalid-role");

    expect(mockDb.role.findFirst).toHaveBeenCalledWith({
      where: { id: "role-from-other-org", OR: [{ organizationId: ORG }, { isSystem: true }] },
    });
    expect(mockDb.user.upsert).not.toHaveBeenCalled();
  });

  it("accepts a roleId that belongs to the caller's own organization", async () => {
    mockRequireCurrentTenant.mockResolvedValue(tenant());
    mockDb.role.findFirst.mockResolvedValue({ id: "role-1", name: "CRM Manager", organizationId: ORG, isSystem: false });
    mockGetServerAuthSession.mockResolvedValue({ user: { id: "actor-1" } });
    mockDb.$transaction.mockImplementation(async (fn: (tx: typeof mockDb) => Promise<unknown>) => fn(mockDb));
    mockDb.user.upsert.mockResolvedValue({ id: "user-new" });
    mockDb.organizationMember.upsert.mockResolvedValue({ id: "mem-new" });
    mockDb.auditLog.create.mockResolvedValue({});
    mockCreateInvitation.mockResolvedValue("tok-1");
    mockSendEmail.mockResolvedValue({ ok: true });

    await expect(inviteMember(formData("role-1"))).rejects.toThrow("?invited=1");
    expect(mockDb.user.upsert).toHaveBeenCalled();
    expect(mockCreateInvitation).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId: ORG, membershipId: "mem-new" }),
    );
  });
});
