import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PERMISSIONS } from "@/lib/auth/permissions";
import {
  addContractAccessGrant,
  addContractParty,
  attachContractClause,
  changeContractStatus,
  CONTRACT_PERMISSION_KEYS,
  compareContractVersions,
  ContractForbiddenError,
  ContractNotFoundError,
  createContract,
  createContractClause,
  createContractTemplate,
  createContractTemplateVersion,
  getContractDetail,
  getContractDocumentForDownload,
  listContracts,
  removeContractDocument,
  setContractClauseStatus,
  setContractTemplateStatus,
  updateContract,
  updateContractSettings,
  uploadContractDocument,
  type ContractActor,
  type ContractInput,
} from "@/modules/contracts/service";
import { testDb } from "../setup/db";
import { addSecondTestMember, cleanupTestOrg, createTestOrg, type TestOrg } from "../setup/fixtures";

let orgA: TestOrg;
let orgB: TestOrg;
let ownerA: ContractActor;
let colleagueA: ContractActor;
let viewerA: ContractActor;
let ownerB: ContractActor;

const ALL = [...CONTRACT_PERMISSION_KEYS];
const PDF = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37, 0x0a, 0x25, 0x25, 0x45, 0x4f, 0x46]);

const input = (overrides: Partial<ContractInput> = {}): ContractInput => ({
  title: "Vehicle lease", counterpartyName: "Accra Leasing Ltd", currency: "GHS", value: "120000.00", renewalType: "MANUAL_RENEWAL",
  riskLevel: "MEDIUM", confidentiality: "STANDARD", startDate: new Date("2026-11-01"), expirationDate: new Date("2027-10-31"), ...overrides,
});

beforeAll(async () => {
  orgA = await createTestOrg("contracts-a");
  orgB = await createTestOrg("contracts-b");
  await testDb.organization.update({ where: { id: orgA.organizationId }, data: { timezone: "Africa/Accra" } });
  const colleague = await addSecondTestMember(orgA, "contracts-colleague");
  const viewer = await addSecondTestMember(orgA, "contracts-viewer");
  const role = await testDb.role.findFirstOrThrow({ where: { organizationId: null, name: "Organization Owner" } });
  ownerA = { organizationId: orgA.organizationId, userId: orgA.userId, roleId: role.id, permissions: ALL };
  colleagueA = { organizationId: orgA.organizationId, userId: colleague.userId, roleId: null, permissions: ALL };
  viewerA = { organizationId: orgA.organizationId, userId: viewer.userId, roleId: null, permissions: [PERMISSIONS.CONTRACTS_VIEW] };
  ownerB = { organizationId: orgB.organizationId, userId: orgB.userId, roleId: role.id, permissions: ALL };
}, 90_000);

afterAll(async () => {
  await cleanupTestOrg(orgA);
  await cleanupTestOrg(orgB);
});

describe("contract creation, numbering, and versions (real Postgres)", () => {
  it("numbers contracts per organization and starts each with version 1", async () => {
    const first = await createContract(ownerA, input());
    const second = await createContract(ownerA, input({ title: "Maintenance agreement" }));
    const otherOrg = await createContract(ownerB, input());
    expect(first.contractNumber).toMatch(/^CTR\/\d{4}\/000001$/);
    expect(second.contractNumber).toMatch(/^CTR\/\d{4}\/000002$/);
    // Sequences never collide across tenants, and never leak counts.
    expect(otherOrg.contractNumber).toMatch(/^CTR\/\d{4}\/000001$/);
    expect(first.status).toBe("DRAFT");
    const versions = await testDb.contractVersion.findMany({ where: { contractId: first.id } });
    expect(versions.map((v) => v.version)).toEqual([1]);
  }, 60_000);

  it("uses the configured format and records every change as a new version", async () => {
    await updateContractSettings(ownerA, { numberFormat: "{PREFIX}-{YY}-{SEQ:4}", numberPrefix: "LEASE", resetSequenceYearly: false, expiryAlertDays: [90, 30], confidentialAdminAccess: false });
    const contract = await createContract(ownerA, input({ title: "Formatted" }));
    expect(contract.contractNumber).toMatch(/^LEASE-\d{2}-\d{4}$/);
    const updated = await updateContract(ownerA, contract.id, input({ title: "Formatted (renegotiated)", value: "150000.00" }), "Price review");
    expect(updated.currentVersion).toBe(2);
    const version = await testDb.contractVersion.findUniqueOrThrow({ where: { contractId_version: { contractId: contract.id, version: 2 } } });
    expect(version.changedFields.sort()).toEqual(["title", "value"]);
    expect(version.reason).toBe("Price review");
    const diff = await compareContractVersions(ownerA, contract.id, 1, 2);
    expect(diff.title).toEqual({ from: "Formatted", to: "Formatted (renegotiated)" });
    // Nothing changed means no new version.
    expect((await updateContract(ownerA, contract.id, input({ title: "Formatted (renegotiated)", value: "150000.00" }))).currentVersion).toBe(2);
  }, 60_000);

  it("requires a start date to activate, a reason to edit an active contract, and archives instead of deleting", async () => {
    const contract = await createContract(ownerA, input({ startDate: null, expirationDate: null }));
    await expect(changeContractStatus(ownerA, contract.id, "ACTIVATE")).rejects.toThrow(/start date/);
    await updateContract(ownerA, contract.id, input({ expirationDate: null }));
    await changeContractStatus(ownerA, contract.id, "ACTIVATE");
    await expect(updateContract(ownerA, contract.id, input({ title: "Changed", expirationDate: null }))).rejects.toThrow(/reason/);
    await expect(changeContractStatus(ownerA, contract.id, "ARCHIVE")).rejects.toThrow();
    const cancelled = await createContract(ownerA, input({ title: "To archive" }));
    await changeContractStatus(ownerA, cancelled.id, "CANCEL", "Deal fell through");
    await changeContractStatus(ownerA, cancelled.id, "ARCHIVE", "Clean-up");
    expect(await testDb.contract.count({ where: { id: cancelled.id } })).toBe(1);
    const restored = await changeContractStatus(ownerA, cancelled.id, "RESTORE");
    expect(restored.status).toBe("CANCELLED");
    const audit = await testDb.auditLog.findMany({ where: { organizationId: orgA.organizationId, entityId: cancelled.id }, select: { action: true } });
    expect(audit.map((row) => row.action)).toEqual(expect.arrayContaining(["contract.created", "contract.cancelled", "contract.archived", "contract.restored"]));
  }, 60_000);
});

describe("confidentiality (real Postgres)", () => {
  it("hides a confidential contract from colleagues without a grant, in lists and by id", async () => {
    const secret = await createContract(ownerA, input({ title: "Executive employment", confidentiality: "CONFIDENTIAL" }));
    await expect(getContractDetail(colleagueA, secret.id)).rejects.toBeInstanceOf(ContractNotFoundError);
    const list = await listContracts(colleagueA, { q: "Executive employment" });
    expect(list.rows.some((row) => row.id === secret.id)).toBe(false);

    // The permission alone is not enough until the organization policy allows it.
    await updateContractSettings(ownerA, { numberFormat: "{PREFIX}/{YYYY}/{SEQ:6}", numberPrefix: "CTR", resetSequenceYearly: true, expiryAlertDays: [90, 30], confidentialAdminAccess: true });
    expect((await getContractDetail(colleagueA, secret.id)).contract.id).toBe(secret.id);
    await updateContractSettings(ownerA, { numberFormat: "{PREFIX}/{YYYY}/{SEQ:6}", numberPrefix: "CTR", resetSequenceYearly: true, expiryAlertDays: [90, 30], confidentialAdminAccess: false });
    await expect(getContractDetail(colleagueA, secret.id)).rejects.toBeInstanceOf(ContractNotFoundError);

    await addContractAccessGrant(ownerA, secret.id, { userId: colleagueA.userId });
    expect((await getContractDetail(colleagueA, secret.id)).contract.id).toBe(secret.id);
    expect((await listContracts(colleagueA, { q: "Executive employment" })).rows.map((row) => row.id)).toContain(secret.id);
    const viewed = await testDb.auditLog.count({ where: { organizationId: orgA.organizationId, entityId: secret.id, action: "contract.viewed" } });
    expect(viewed).toBeGreaterThan(0);
  }, 60_000);

  it("never opens a restricted contract through the organization-wide policy", async () => {
    const restricted = await createContract(ownerA, input({ title: "Board settlement", confidentiality: "RESTRICTED" }));
    await updateContractSettings(ownerA, { numberFormat: "{PREFIX}/{YYYY}/{SEQ:6}", numberPrefix: "CTR", resetSequenceYearly: true, expiryAlertDays: [90, 30], confidentialAdminAccess: true });
    await expect(getContractDetail(colleagueA, restricted.id)).rejects.toBeInstanceOf(ContractNotFoundError);
    await updateContractSettings(ownerA, { numberFormat: "{PREFIX}/{YYYY}/{SEQ:6}", numberPrefix: "CTR", resetSequenceYearly: true, expiryAlertDays: [90, 30], confidentialAdminAccess: false });
  }, 60_000);

  it("refuses an access grant to a user from another organization", async () => {
    const secret = await createContract(ownerA, input({ title: "Grant guard", confidentiality: "CONFIDENTIAL" }));
    await expect(addContractAccessGrant(ownerA, secret.id, { userId: orgB.userId })).rejects.toBeInstanceOf(ContractNotFoundError);
  }, 60_000);
});

describe("documents (real Postgres)", () => {
  it("stores private versions, verifies checksums on download, and soft-removes", async () => {
    const contract = await createContract(ownerA, input({ title: "Signed lease" }));
    const v1 = await uploadContractDocument(ownerA, contract.id, { documentType: "PRIMARY", title: "Signed agreement", fileName: "lease.pdf", mimeType: "application/pdf", bytes: PDF });
    const v2 = await uploadContractDocument(ownerA, contract.id, { documentType: "PRIMARY", title: "Signed agreement", fileName: "lease-v2.pdf", mimeType: "application/pdf", bytes: PDF });
    expect([v1.version, v2.version]).toEqual([1, 2]);
    expect(v2.supersedesId).toBe(v1.id);
    const asset = await testDb.fileAsset.findUniqueOrThrow({ where: { id: v1.fileAssetId } });
    expect(asset.url).toBeNull();
    expect(asset.storagePath).toBe("private://contract-document");

    const download = await getContractDocumentForDownload(ownerA, v1.id);
    expect(Buffer.from(download.bytes).equals(Buffer.from(PDF))).toBe(true);
    await removeContractDocument(ownerA, v1.id, "Superseded by v2");
    expect((await testDb.contractDocument.findUniqueOrThrow({ where: { id: v1.id } })).removedAt).not.toBeNull();
    expect(await testDb.fileContent.count({ where: { fileAssetId: v1.fileAssetId } })).toBe(1);
    const audit = await testDb.auditLog.findMany({ where: { organizationId: orgA.organizationId, entityId: contract.id }, select: { action: true } });
    expect(audit.map((row) => row.action)).toEqual(expect.arrayContaining(["contract.document_uploaded", "contract.document_downloaded", "contract.document_removed"]));
  }, 60_000);

  it("rejects a file whose content does not match its declared type", async () => {
    const contract = await createContract(ownerA, input({ title: "Bad upload" }));
    await expect(uploadContractDocument(ownerA, contract.id, { documentType: "SUPPORTING", title: "Fake", fileName: "fake.pdf", mimeType: "application/pdf", bytes: new Uint8Array([1, 2, 3, 4, 5]) })).rejects.toThrow(/does not match/);
  }, 60_000);

  it("blocks document download of a confidential contract without access, and across tenants", async () => {
    const secret = await createContract(ownerA, input({ title: "Confidential document", confidentiality: "CONFIDENTIAL" }));
    const document = await uploadContractDocument(ownerA, secret.id, { documentType: "PRIMARY", title: "Secret", fileName: "secret.pdf", mimeType: "application/pdf", bytes: PDF });
    await expect(getContractDocumentForDownload(colleagueA, document.id)).rejects.toBeInstanceOf(ContractNotFoundError);
    await expect(getContractDocumentForDownload(ownerB, document.id)).rejects.toBeInstanceOf(ContractNotFoundError);
  }, 60_000);
});

describe("templates and clauses (real Postgres)", () => {
  it("drafts from the active template version and never rewrites the contract when the template changes", async () => {
    const template = await createContractTemplate(ownerA, { code: "LEASE", name: "Vehicle lease", body: "Lease {{contract.number}} between {{organization.name}} and {{counterparty.name}} until {{contract.endDate}}." });
    await setContractTemplateStatus(ownerA, template.id, "ACTIVE");
    const contract = await createContract(ownerA, { ...input({ counterpartyName: "Kumasi Fleet Co" }), templateId: template.id });
    expect(contract.body).toContain(contract.contractNumber);
    expect(contract.body).toContain("Kumasi Fleet Co");
    expect(contract.body).toContain("2027-10-31");
    expect(contract.templateVersion).toBe(1);
    const v2 = await createContractTemplateVersion(ownerA, template.id, { body: "Completely new text" });
    await setContractTemplateStatus(ownerA, v2.id, "ACTIVE");
    expect((await testDb.contract.findUniqueOrThrow({ where: { id: contract.id } })).body).toContain("Kumasi Fleet Co");
    expect((await testDb.contractTemplate.findUniqueOrThrow({ where: { id: template.id } })).status).toBe("RETIRED");
  }, 60_000);

  it("attaches only approved clauses, and restricted clauses need clause-management permission", async () => {
    const contract = await createContract(ownerA, input({ title: "Clause test" }));
    const draft = await createContractClause(ownerA, { code: "CONF", name: "Confidentiality", category: "Confidentiality", body: "Each party keeps the other's information confidential.", usage: "REQUIRED" });
    await expect(attachContractClause(ownerA, contract.id, draft.id)).rejects.toThrow(/approved/);
    await setContractClauseStatus(ownerA, draft.id, "APPROVED");
    await attachContractClause(ownerA, contract.id, draft.id);
    const restricted = await createContractClause(ownerA, { code: "NONCOMPETE", name: "Non-compete", category: "Non-compete", body: "Restricted text.", usage: "RESTRICTED" });
    await setContractClauseStatus(ownerA, restricted.id, "APPROVED");
    const editorWithoutClauses: ContractActor = { ...colleagueA, permissions: ALL.filter((key) => key !== PERMISSIONS.CONTRACTS_MANAGE_CLAUSES) };
    await expect(attachContractClause(editorWithoutClauses, contract.id, restricted.id)).rejects.toBeInstanceOf(ContractForbiddenError);
    const detail = await getContractDetail(ownerA, contract.id);
    expect(detail.contract.clauses.map((link) => link.clause.code)).toEqual(["CONF"]);
  }, 60_000);
});

describe("permissions and tenant isolation (real Postgres)", () => {
  it("enforces permissions server-side and hides financials from viewers", async () => {
    const contract = await createContract(ownerA, input({ title: "Permission test" }));
    await expect(updateContract(viewerA, contract.id, input({ title: "Hijacked" }))).rejects.toBeInstanceOf(ContractForbiddenError);
    await expect(createContract(viewerA, input())).rejects.toBeInstanceOf(ContractForbiddenError);
    await expect(changeContractStatus(viewerA, contract.id, "CANCEL")).rejects.toBeInstanceOf(ContractForbiddenError);
    const detail = await getContractDetail(viewerA, contract.id);
    expect(detail.contract.value).toBeNull();
    expect(detail.canViewFinancials).toBe(false);
    const list = await listContracts(viewerA, { q: "Permission test" });
    expect(list.rows[0].value).toBeNull();
  }, 60_000);

  it("never exposes another organization's contract, even with a guessed id", async () => {
    const contract = await createContract(ownerA, input({ title: "Tenant A only" }));
    await expect(getContractDetail(ownerB, contract.id)).rejects.toBeInstanceOf(ContractNotFoundError);
    await expect(updateContract(ownerB, contract.id, input({ title: "Forged" }))).rejects.toBeInstanceOf(ContractNotFoundError);
    await expect(addContractParty(ownerB, contract.id, { role: "CLIENT", name: "Intruder" })).rejects.toBeInstanceOf(ContractNotFoundError);
    await expect(changeContractStatus(ownerB, contract.id, "CANCEL")).rejects.toBeInstanceOf(ContractNotFoundError);
    await expect(uploadContractDocument(ownerB, contract.id, { documentType: "OTHER", title: "x", fileName: "x.pdf", mimeType: "application/pdf", bytes: PDF })).rejects.toBeInstanceOf(ContractNotFoundError);
    // A forged organization id on the actor cannot reach A's data through B's membership either.
    const forged: ContractActor = { ...ownerB, organizationId: orgB.organizationId };
    expect((await listContracts(forged, { q: "Tenant A only" })).total).toBe(0);
    expect((await testDb.contract.findUniqueOrThrow({ where: { id: contract.id } })).title).toBe("Tenant A only");
  }, 60_000);

  it("rejects related records from another organization", async () => {
    const foreignContact = await testDb.accountingContact.create({ data: { organizationId: orgB.organizationId, name: "Org B contact" } });
    const contract = await createContract(ownerA, input({ title: "Party guard" }));
    await expect(addContractParty(ownerA, contract.id, { role: "CLIENT", name: "Linked", contactId: foreignContact.id })).rejects.toBeInstanceOf(ContractNotFoundError);
    await expect(createContract(ownerA, input({ ownerId: orgB.userId }))).rejects.toBeInstanceOf(ContractNotFoundError);
  }, 60_000);
});
