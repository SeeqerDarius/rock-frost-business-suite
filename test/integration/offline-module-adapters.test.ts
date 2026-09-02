import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PERMISSIONS } from "@/lib/auth/permissions";
import type { TenantContext } from "@/lib/tenant";
import { testDb } from "./setup/db";
import { cleanupTestOrg, createTestOrg, type TestOrg } from "./setup/fixtures";

describe("offline module adapters", () => {
  let org: TestOrg;
  let deviceId: string;
  let tenant: TenantContext;

  beforeAll(async () => {
    org = await createTestOrg("offline-adapters");
    const device = await testDb.offlineDevice.create({ data: { organizationId: org.organizationId, userId: org.userId, membershipId: org.membershipId, name: "Adapter browser", platform: "browser:test", installationId: "00000000-0000-4000-8000-000000000201", tokenHash: `adapter-${Date.now()}`, moduleKeys: ["accounting"], tokenExpiresAt: new Date(Date.now() + 60_000), offlineAccessUntil: new Date(Date.now() + 60_000) } });
    deviceId = device.id;
    tenant = { userId: org.userId, organizationId: org.organizationId, organization: { id: org.organizationId, name: "Offline adapter test", tenantCode: org.tenantCode, industry: null, status: "ACTIVE" }, role: "Organization Owner", roleId: null, roleIsSystem: true, roleOrganizationId: null, permissions: [PERMISSIONS.ACCOUNTING_VIEW], branch: null, enabledModuleKeys: ["accounting"], accessibleModuleKeys: ["accounting"], memberships: [{ organizationId: org.organizationId, name: "Offline adapter test", tenantCode: org.tenantCode }] };
  });

  afterAll(async () => cleanupTestOrg(org));

  it("synchronizes an attachment-backed Accounting draft without posting money", async () => {
    const clientId = "00000000-0000-4000-8000-000000000202";
    const attachment = await testDb.offlineAttachmentUpload.create({ data: { organizationId: org.organizationId, userId: org.userId, deviceId, clientId, moduleKey: "accounting", fileName: "invoice.pdf", mimeType: "application/pdf", size: 8, sha256: "c".repeat(64), data: Buffer.from("%PDF-1.4"), expiresAt: new Date(Date.now() + 60_000) } });
    const ledgerId = `ledger-${Date.now()}`;
    const { applyOfflineModuleOperation } = await import("../../src/lib/pwa/server-adapters");
    const before = await Promise.all([
      testDb.accountingInvoice.count({ where: { organizationId: org.organizationId } }),
      testDb.accountingJournalEntry.count({ where: { organizationId: org.organizationId } }),
    ]);
    const result = await applyOfflineModuleOperation({ operationId: ledgerId, organizationId: org.organizationId, userId: org.userId, deviceId, module: "accounting", entityType: "accounting.invoice-draft", entityId: "local-invoice", operationType: "draft", clientTimestamp: new Date().toISOString(), baseServerVersion: 0, idempotencyKey: ledgerId, payloadSchemaVersion: 1, payload: { title: "Offline invoice", fields: { customer: "Draft only", amount: "100.00" } }, attachmentReferences: [attachment.id] }, tenant, ledgerId);
    expect(result.status).toBe("draft");
    await expect(testDb.offlineDraft.findUnique({ where: { sourceMutationId: ledgerId } })).resolves.toMatchObject({ moduleKey: "accounting", title: "Offline invoice" });
    await expect(testDb.offlineAttachmentUpload.findUnique({ where: { id: attachment.id } })).resolves.toMatchObject({ status: "CONSUMED" });
    await expect(Promise.all([testDb.accountingInvoice.count({ where: { organizationId: org.organizationId } }), testDb.accountingJournalEntry.count({ where: { organizationId: org.organizationId } })])).resolves.toEqual(before);
  });

  it("rejects a draft after its module permission is revoked", async () => {
    const { applyOfflineModuleOperation, OfflinePermanentError } = await import("../../src/lib/pwa/server-adapters");
    const revoked = { ...tenant, permissions: [] };
    const operationId = `revoked-${Date.now()}`;
    await expect(applyOfflineModuleOperation({ operationId, organizationId: org.organizationId, userId: org.userId, deviceId, module: "accounting", entityType: "accounting.invoice-draft", entityId: operationId, operationType: "draft", clientTimestamp: new Date().toISOString(), baseServerVersion: 0, idempotencyKey: operationId, payloadSchemaVersion: 1, payload: { title: "Blocked", fields: {} }, attachmentReferences: [] }, revoked, operationId)).rejects.toBeInstanceOf(OfflinePermanentError);
  });
});
