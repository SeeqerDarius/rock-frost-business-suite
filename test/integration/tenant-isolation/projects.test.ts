import { describe, it, expect, beforeAll, afterAll } from "vitest";
import * as projects from "@/modules/projects/service";
import { createTestOrg, cleanupTestOrg, type TestOrg } from "../setup/fixtures";

/**
 * Real-Postgres equivalent of the mocked IDOR coverage for
 * src/modules/projects/service.ts. Every foreign-id validation here goes
 * through requireProjectInOrg() (projectId scoped to organizationId) or a
 * direct organizationMember lookup (assigneeId), both of which throw the
 * module's own exported projects.NotFoundError.
 */

let orgA: TestOrg;
let orgB: TestOrg;

let orgBProject: Awaited<ReturnType<typeof projects.createProject>>;
let orgAProject: Awaited<ReturnType<typeof projects.createProject>>;
let orgBMilestone: Awaited<ReturnType<typeof projects.createMilestone>>;

beforeAll(async () => {
  orgA = await createTestOrg("orgA-projects");
  orgB = await createTestOrg("orgB-projects");

  orgBProject = await projects.createProject(orgB.organizationId, { name: "Org B Project" });
  orgAProject = await projects.createProject(orgA.organizationId, { name: "Org A Project" });
  orgBMilestone = await projects.createMilestone(orgB.organizationId, {
    projectId: orgBProject.id,
    name: "Org B Milestone",
  });
});

afterAll(async () => {
  await cleanupTestOrg(orgA);
  await cleanupTestOrg(orgB);
});

describe("Projects service — cross-tenant isolation against real Postgres", () => {
  it("addProjectMember rejects a projectId from another organization", async () => {
    await expect(
      projects.addProjectMember(orgA.organizationId, orgBProject.id, orgA.userId),
    ).rejects.toThrow(projects.NotFoundError);
  });

  it("removeProjectMember rejects a projectId from another organization", async () => {
    await expect(
      projects.removeProjectMember(orgA.organizationId, orgBProject.id, orgA.userId),
    ).rejects.toThrow(projects.NotFoundError);
  });

  it("createMilestone rejects a projectId from another organization", async () => {
    await expect(
      projects.createMilestone(orgA.organizationId, { projectId: orgBProject.id, name: "Should fail" }),
    ).rejects.toThrow(projects.NotFoundError);
  });

  it("createTask rejects a projectId from another organization", async () => {
    await expect(
      projects.createTask(orgA.organizationId, { projectId: orgBProject.id, title: "Should fail" }),
    ).rejects.toThrow(projects.NotFoundError);
  });

  it("createTask rejects a milestoneId from another organization, even under Org A's own project", async () => {
    await expect(
      projects.createTask(orgA.organizationId, {
        projectId: orgAProject.id,
        title: "Should fail",
        milestoneId: orgBMilestone.id,
      }),
    ).rejects.toThrow(projects.NotFoundError);
  });

  it("createTask rejects an assigneeId (userId) from another organization, even under Org A's own project", async () => {
    await expect(
      projects.createTask(orgA.organizationId, {
        projectId: orgAProject.id,
        title: "Should fail",
        assigneeId: orgB.userId,
      }),
    ).rejects.toThrow(projects.NotFoundError);
  });

  it("listProjects scoped to Org A never returns Org B's project", async () => {
    const list = await projects.listProjects(orgA.organizationId);
    expect(list.map((p) => p.id)).not.toContain(orgBProject.id);
    expect(list.map((p) => p.id)).toContain(orgAProject.id);
  });
});
