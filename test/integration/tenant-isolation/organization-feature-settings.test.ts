import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as school from "@/modules/school/service";
import { getOrganizationFeatureValues, isOrganizationFeatureEnabled, setOrganizationFeature } from "@/platform/organizations/feature-config-service";
import { getOrganizationModuleConfiguration, listOrganizationModuleRows } from "@/platform/organizations/module-configuration-view";
import { cleanupTestOrg, createTestOrg, type TestOrg } from "../setup/fixtures";
import { testDb } from "../setup/db";

/**
 * Real-Postgres proof for per-organization feature configuration: defaults
 * without rows, organization scoping, server-side enforcement in School,
 * dependency and stale-change refusal, legacy add-on columns, and the audit
 * trail. See docs/MODULE_FEATURE_CONFIGURATION.md.
 */

let orgA: TestOrg;
let orgB: TestOrg;

beforeAll(async () => {
  [orgA, orgB] = await Promise.all([createTestOrg("features-a"), createTestOrg("features-b")]);
  // Start from a realistic tenant: portal granted, guardian messaging not.
  await testDb.organization.update({ where: { id: orgA.organizationId }, data: { schoolPortalGranted: true, schoolGuardianMessagingGranted: false } });
});

afterAll(async () => {
  await cleanupTestOrg(orgA);
  await cleanupTestOrg(orgB);
});

describe("organization feature configuration", () => {
  it("defaults included capabilities on with no rows, and keeps each organization separate", async () => {
    expect(await testDb.organizationFeatureSetting.count({ where: { organizationId: { in: [orgA.organizationId, orgB.organizationId] } } })).toBe(0);
    expect(await isOrganizationFeatureEnabled(orgA.organizationId, "school.transport")).toBe(true);

    await setOrganizationFeature({ actorUserId: orgA.userId, organizationId: orgA.organizationId, moduleKey: "school", featureKey: "school.transport", enabled: false, expected: true });
    expect(await isOrganizationFeatureEnabled(orgA.organizationId, "school.transport")).toBe(false);
    expect(await isOrganizationFeatureEnabled(orgB.organizationId, "school.transport")).toBe(true);

    const audit = await testDb.auditLog.findFirst({ where: { organizationId: orgA.organizationId, action: "organization_feature.updated" }, orderBy: { createdAt: "desc" } });
    expect(audit?.userId).toBe(orgA.userId);
    expect(audit?.changes).toMatchObject({ module: "school", feature: "school.transport", oldValue: true, newValue: false });
    expect(await testDb.auditLog.count({ where: { organizationId: orgB.organizationId, action: "organization_feature.updated" } })).toBe(0);
  });

  it("enforces a switched-off School capability in the service layer and keeps its records", async () => {
    const campus = await school.createSchoolCampus(orgB.organizationId, { code: `L${Date.now()}`, name: "Library Campus" });
    const book = await school.createSchoolLibraryBook(orgB.organizationId, { accessionCode: `ACC${Date.now()}`, title: "Things Fall Apart", totalCopies: 2 });
    expect(campus.id).toBeTruthy();

    await setOrganizationFeature({ actorUserId: orgB.userId, organizationId: orgB.organizationId, moduleKey: "school", featureKey: "school.library", enabled: false, expected: true });
    await expect(school.createSchoolLibraryBook(orgB.organizationId, { accessionCode: `X${Date.now()}`, title: "Blocked", totalCopies: 1 })).rejects.toMatchObject({ code: "feature-off" });
    await expect(school.listSchoolLibraryBookPage(orgB.organizationId)).rejects.toMatchObject({ code: "feature-off" });
    // Another organization is unaffected.
    await expect(school.listSchoolLibraryBookPage(orgA.organizationId)).resolves.toBeTruthy();

    await setOrganizationFeature({ actorUserId: orgB.userId, organizationId: orgB.organizationId, moduleKey: "school", featureKey: "school.library", enabled: true, expected: false });
    const page = await school.listSchoolLibraryBookPage(orgB.organizationId);
    expect(JSON.stringify(page)).toContain(book.id);
  });

  it("refuses dependency violations and stale changes without writing", async () => {
    await expect(setOrganizationFeature({ actorUserId: orgA.userId, organizationId: orgB.organizationId, moduleKey: "school", featureKey: "schoolGuardianMessaging", enabled: true, expected: false })).resolves.toBeTruthy();
    // orgB had the portal granted by the fixture, so messaging could turn on; now the portal cannot be revoked under it.
    await expect(setOrganizationFeature({ actorUserId: orgB.userId, organizationId: orgB.organizationId, moduleKey: "school", featureKey: "schoolPortal", enabled: false, expected: true })).rejects.toMatchObject({ code: "dependency" });
    expect((await testDb.organization.findUniqueOrThrow({ where: { id: orgB.organizationId } })).schoolPortalGranted).toBe(true);

    await expect(setOrganizationFeature({ actorUserId: orgB.userId, organizationId: orgB.organizationId, moduleKey: "school", featureKey: "schoolGuardianMessaging", enabled: false, expected: false })).rejects.toMatchObject({ code: "stale" });
    expect((await testDb.organization.findUniqueOrThrow({ where: { id: orgB.organizationId } })).schoolGuardianMessagingGranted).toBe(true);
  });

  it("writes add-ons through their existing grant columns with who and when", async () => {
    await setOrganizationFeature({ actorUserId: orgA.userId, organizationId: orgA.organizationId, moduleKey: "school", featureKey: "schoolGuardianMessaging", enabled: true, expected: false });
    const organization = await testDb.organization.findUniqueOrThrow({ where: { id: orgA.organizationId } });
    expect(organization.schoolGuardianMessagingGranted).toBe(true);
    expect(organization.schoolGuardianMessagingGrantedById).toBe(orgA.userId);
    expect(organization.schoolGuardianMessagingGrantedAt).toBeInstanceOf(Date);
    const values = await getOrganizationFeatureValues(orgA.organizationId);
    expect(values?.values).toMatchObject({ schoolPortal: true, schoolGuardianMessaging: true, "school.transport": false, "school.library": true });
  });

  it("derives module status and the configuration view from the real entitlement rule", async () => {
    const rows = await listOrganizationModuleRows(orgA.organizationId);
    const schoolRow = rows.find((row) => row.code === "school");
    expect(schoolRow?.status).toBe("enabled");
    const view = await getOrganizationModuleConfiguration(orgA.organizationId, schoolRow!.moduleId);
    expect(view?.organization.id).toBe(orgA.organizationId);
    expect(view?.features.find((entry) => entry.feature.key === "school.transport")?.value).toBe(false);
    expect(view?.features.find((entry) => entry.feature.key === "schoolPortal")?.blockedReason).toMatch(/Turn off Guardian messaging first/);
    expect(view?.dependencies.requiredBy.map((dependent) => dependent.code)).toContain("hostel");
  });
});
