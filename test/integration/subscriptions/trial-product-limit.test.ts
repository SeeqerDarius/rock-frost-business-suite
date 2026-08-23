import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { cleanupTestOrg, createTestOrg, type TestOrg } from "../setup/fixtures";
import { testDb } from "../setup/db";
import { assertTrialProductLimit, TRIAL_PRODUCT_LIMIT, TrialProductLimitError } from "@/platform/trials/service";

let org: TestOrg;

beforeAll(async () => {
  org = await createTestOrg("trial-product-limit");
  await testDb.organization.update({ where: { id: org.organizationId }, data: { status: "TRIAL" } });
  await testDb.organizationModule.updateMany({ where: { organizationId: org.organizationId }, data: { enabled: false } });
  const modules = await testDb.module.findMany({ where: { code: { in: ["crm", "inventory", "fleet"] } } });
  for (const module_ of modules) await testDb.organizationModule.upsert({
    where: { organizationId_moduleId: { organizationId: org.organizationId, moduleId: module_.id } },
    update: { enabled: true },
    create: { organizationId: org.organizationId, moduleId: module_.id, enabled: true },
  });
});

afterAll(async () => cleanupTestOrg(org));

describe("trial product limit (real PostgreSQL)", () => {
  it("allows grouped companion modules but rejects a fourth product", async () => {
    expect(TRIAL_PRODUCT_LIMIT).toBe(3);
    await expect(testDb.$transaction((tx) => assertTrialProductLimit(tx, org.organizationId, ["procurement", "crm"]))).resolves.toBeUndefined();
    await expect(testDb.$transaction((tx) => assertTrialProductLimit(tx, org.organizationId, ["hotel"]))).rejects.toBeInstanceOf(TrialProductLimitError);
  });
});
