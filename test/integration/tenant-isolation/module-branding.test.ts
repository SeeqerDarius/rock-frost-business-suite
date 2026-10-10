import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { testDb } from "../setup/db";
import { createTestOrg, cleanupTestOrg, type TestOrg } from "../setup/fixtures";

let orgA: TestOrg;
let orgB: TestOrg;

beforeAll(async () => {
  [orgA, orgB] = await Promise.all([createTestOrg("module-branding-a"), createTestOrg("module-branding-b")]);
});

afterAll(async () => {
  await cleanupTestOrg(orgA);
  await cleanupTestOrg(orgB);
});

describe("organization module branding tenant isolation", () => {
  it("keeps each module identity scoped to its organization and allows one row per module", async () => {
    await testDb.organizationModuleBranding.create({
      data: { organizationId: orgA.organizationId, moduleKey: "school", displayName: "Affordit Preparatory School", primaryColor: "#173b73" },
    });
    await testDb.organizationModuleBranding.create({
      data: { organizationId: orgB.organizationId, moduleKey: "school", displayName: "Other Academy", primaryColor: "#742b38" },
    });

    const rowsA = await testDb.organizationModuleBranding.findMany({ where: { organizationId: orgA.organizationId } });
    const rowsB = await testDb.organizationModuleBranding.findMany({ where: { organizationId: orgB.organizationId } });
    expect(rowsA.map((row) => row.displayName)).toEqual(["Affordit Preparatory School"]);
    expect(rowsB.map((row) => row.displayName)).toEqual(["Other Academy"]);
    await expect(testDb.organizationModuleBranding.create({
      data: { organizationId: orgA.organizationId, moduleKey: "school", displayName: "Duplicate" },
    })).rejects.toMatchObject({ code: "P2002" });
  });

  it("returns no customized identity for a module that has not been configured", async () => {
    expect(await testDb.organizationModuleBranding.findUnique({
      where: { organizationId_moduleKey: { organizationId: orgA.organizationId, moduleKey: "pos" } },
    })).toBeNull();
  });
});
