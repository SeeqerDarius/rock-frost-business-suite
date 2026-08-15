import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestOrg, cleanupTestOrg, type TestOrg } from "./setup/fixtures";
import { testDb } from "./setup/db";
import { processOfflineMutation } from "@/lib/offline-sync/service";
import { OfflineMutationDeniedError } from "@/lib/offline-sync/adapters";
import { authenticateOfflineDevice, createOfflineToken, type OfflineDeviceContext } from "@/lib/offline-sync/auth";

let orgA: TestOrg;
let orgB: TestOrg;
let context: OfflineDeviceContext;
let itemId: string;
let warehouseId: string;
let deviceToken: string;

beforeAll(async () => {
  orgA = await createTestOrg("offline-sync-a");
  orgB = await createTestOrg("offline-sync-b");
  const role = await testDb.organizationMember.findUniqueOrThrow({
    where: { id: orgA.membershipId },
    include: { role: { include: { rolePermissions: { include: { permission: true } } } } },
  });
  const item = await testDb.inventoryItem.create({ data: { organizationId: orgA.organizationId, sku: "OFF-1", name: "Offline item" } });
  const warehouse = await testDb.inventoryWarehouse.create({ data: { organizationId: orgA.organizationId, name: "Offline warehouse" } });
  itemId = item.id;
  warehouseId = warehouse.id;
  const device = await testDb.offlineDevice.create({
    data: {
      organizationId: orgA.organizationId,
      userId: orgA.userId,
      membershipId: orgA.membershipId,
      name: "Integration desktop",
      platform: "windows",
      installationId: "integration-device-1",
      tokenHash: "integration-token-placeholder",
      moduleKeys: ["inventory"],
      tokenExpiresAt: new Date(Date.now() + 86_400_000),
      offlineAccessUntil: new Date(Date.now() + 86_400_000),
    },
  });
  const credential = createOfflineToken(device.id);
  deviceToken = credential.token;
  await testDb.offlineDevice.update({ where: { id: device.id }, data: { tokenHash: credential.hash } });
  const permissions = role.role?.rolePermissions.map(({ permission }) => permission.key) ?? [];
  context = {
    device: { id: device.id, organizationId: orgA.organizationId, userId: orgA.userId, membershipId: orgA.membershipId, moduleKeys: ["inventory"], offlineAccessUntil: device.offlineAccessUntil },
    tenant: {
      userId: orgA.userId,
      organizationId: orgA.organizationId,
      organization: { id: orgA.organizationId, name: "Offline A", tenantCode: orgA.tenantCode, industry: null, status: "ACTIVE" },
      role: role.role?.name ?? null,
      roleId: role.roleId,
      roleIsSystem: role.role?.isSystem ?? false,
      roleOrganizationId: role.role?.organizationId ?? null,
      permissions,
      branch: null,
      enabledModuleKeys: ["inventory"],
      accessibleModuleKeys: ["inventory"],
      memberships: [{ organizationId: orgA.organizationId, name: "Offline A", tenantCode: orgA.tenantCode }],
    },
    authorizedModuleKeys: ["inventory"],
  };
}, 120_000);

afterAll(async () => {
  await cleanupTestOrg(orgA);
  await cleanupTestOrg(orgB);
}, 60_000);

describe("offline synchronization against real Postgres", () => {
  it("authenticates a hashed device credential and immediately enforces revocation", async () => {
    const request = new Request("https://app.example.invalid/api/desktop/sync/pull", { headers: { authorization: `Bearer ${deviceToken}` } });
    await expect(authenticateOfflineDevice(request)).resolves.toMatchObject({ device: { id: context.device.id } });
    await testDb.offlineDevice.update({ where: { id: context.device.id }, data: { status: "REVOKED", revokedAt: new Date() } });
    await expect(authenticateOfflineDevice(request)).rejects.toMatchObject({ status: 403 });
    await testDb.offlineDevice.update({ where: { id: context.device.id }, data: { status: "ACTIVE", revokedAt: null } });
  });

  it("removes an expired paid module from the device authorization scope", async () => {
    const inventoryModule = await testDb.module.findUniqueOrThrow({ where: { code: "inventory" } });
    const subscription = await testDb.subscription.create({
      data: {
        organizationId: orgA.organizationId,
        moduleId: inventoryModule.id,
        mode: "MANUAL_OFFLINE",
        status: "EXPIRED",
        durationMonths: 1,
        amount: "1.00",
        startsAt: new Date(Date.now() - 60 * 86_400_000),
        endsAt: new Date(Date.now() - 30 * 86_400_000),
        createdById: orgA.userId,
      },
    });
    const request = new Request("https://app.example.invalid/api/desktop/sync/pull", { headers: { authorization: `Bearer ${deviceToken}` } });
    await expect(authenticateOfflineDevice(request)).rejects.toMatchObject({ status: 403 });
    await testDb.subscription.delete({ where: { id: subscription.id } });
  });

  it("applies a retried client mutation exactly once", async () => {
    const input = {
      mutationId: "3b12f1df-5232-4804-897e-917bf397618a",
      organizationId: orgA.organizationId,
      moduleKey: "inventory" as const,
      entityType: "inventory.movement" as const,
      entityId: "local-movement-1",
      operation: "CREATE" as const,
      baseVersion: 0 as const,
      changedAt: new Date(),
      payload: { itemId, warehouseId, type: "RECEIPT", quantity: 4, occurredAt: new Date().toISOString() },
    };
    const first = await processOfflineMutation(context, input);
    const retry = await processOfflineMutation(context, input);
    expect(first.status).toBe("applied");
    expect(retry).toEqual(first);
    expect(await testDb.inventoryMovement.count({ where: { organizationId: orgA.organizationId, reference: null } })).toBe(1);
    expect((await testDb.inventoryStock.findUniqueOrThrow({ where: { itemId_warehouseId: { itemId, warehouseId } } })).quantity).toBe(4);
  });

  it("rejects a tenant id supplied by another organization", async () => {
    await expect(processOfflineMutation(context, {
      mutationId: "6838e082-e6e6-4f79-ae53-d9ad71bada8c",
      organizationId: orgB.organizationId,
      moduleKey: "inventory",
      entityType: "inventory.movement",
      entityId: "cross-tenant",
      operation: "CREATE",
      baseVersion: 0,
      changedAt: new Date(),
      payload: { itemId, warehouseId, type: "RECEIPT", quantity: 1, occurredAt: new Date().toISOString() },
    })).rejects.toThrow(OfflineMutationDeniedError);
  });
});
