import "server-only";

import { Prisma, type ContractConfidentiality, type ContractDocumentType, type ContractPartyRole, type ContractRenewalType, type ContractRiskLevel, type ContractStatus } from "@prisma/client";
import { db } from "@/lib/db";
import { logAuditEvent } from "@/lib/audit";
import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import type { TenantContext } from "@/lib/tenant";
import { isValidCurrencyCode } from "@/lib/localization";
import { zonedDateParts } from "@/lib/org-format";
import { readPrivateFile, sha256, storePrivateFile } from "@/lib/storage/private-files";
import {
  canViewContract,
  ContractRuleError,
  diffContract,
  formatContractNumber,
  formatUsesYear,
  renderTemplate,
  validateNumberFormat,
  VERSIONED_FIELDS,
  type AccessSubject,
  type TemplateContext,
} from "./rules";

export class ContractError extends Error {}
export class ContractNotFoundError extends ContractError {}
export class ContractForbiddenError extends ContractError {}

type Tx = Prisma.TransactionClient;

/** The authenticated actor, always derived from the server-side tenant context. */
export type ContractActor = {
  organizationId: string;
  userId: string;
  roleId: string | null;
  permissions: string[];
};

const can = (actor: ContractActor, key: string) => actor.permissions.includes(key);

function requirePermission(actor: ContractActor, key: string) {
  if (!can(actor, key)) throw new ContractForbiddenError("You do not have permission for this contract action.");
}

// --- Settings ----------------------------------------------------------------

export async function getContractSettings(organizationId: string, client: Tx | typeof db = db) {
  return client.contractSettings.upsert({ where: { organizationId }, update: {}, create: { organizationId } });
}

export async function updateContractSettings(actor: ContractActor, input: { numberFormat: string; numberPrefix: string; resetSequenceYearly: boolean; expiryAlertDays: number[]; confidentialAdminAccess: boolean }) {
  requirePermission(actor, PERMISSIONS.CONTRACTS_MANAGE_SETTINGS);
  const numberFormat = input.numberFormat.trim();
  const numberPrefix = input.numberPrefix.trim().toUpperCase();
  try {
    validateNumberFormat(numberFormat);
  } catch (error) {
    throw new ContractError((error as Error).message);
  }
  if (!/^[A-Z0-9-]{1,12}$/.test(numberPrefix)) throw new ContractError("The prefix uses up to 12 letters, numbers, or hyphens.");
  const expiryAlertDays = [...new Set(input.expiryAlertDays)].filter((days) => Number.isInteger(days) && days >= 1 && days <= 730).sort((a, b) => b - a);
  if (!expiryAlertDays.length) throw new ContractError("Choose at least one expiry alert between 1 and 730 days.");
  const previous = await getContractSettings(actor.organizationId);
  const saved = await db.contractSettings.update({ where: { organizationId: actor.organizationId }, data: { numberFormat, numberPrefix, resetSequenceYearly: input.resetSequenceYearly, expiryAlertDays, confidentialAdminAccess: input.confidentialAdminAccess } });
  await logAuditEvent({ organizationId: actor.organizationId, userId: actor.userId, module: "contracts", action: "contracts.settings_updated", entityName: "ContractSettings", entityId: actor.organizationId, metadata: { from: { numberFormat: previous.numberFormat, numberPrefix: previous.numberPrefix, expiryAlertDays: previous.expiryAlertDays, confidentialAdminAccess: previous.confidentialAdminAccess }, to: { numberFormat, numberPrefix, expiryAlertDays, confidentialAdminAccess: input.confidentialAdminAccess } } });
  return saved;
}

export async function createContractCategory(actor: ContractActor, input: { code: string; name: string }) {
  requirePermission(actor, PERMISSIONS.CONTRACTS_MANAGE_SETTINGS);
  const code = input.code.trim().toUpperCase().replace(/\s+/g, "_");
  if (!/^[A-Z0-9_-]{1,40}$/.test(code) || !input.name.trim()) throw new ContractError("Enter a code and a name.");
  try {
    return await db.contractCategory.create({ data: { organizationId: actor.organizationId, code, name: input.name.trim() } });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") throw new ContractError(`Category ${code} already exists.`);
    throw error;
  }
}

export async function createContractType(actor: ContractActor, input: { code: string; name: string; categoryId?: string | null }) {
  requirePermission(actor, PERMISSIONS.CONTRACTS_MANAGE_SETTINGS);
  const code = input.code.trim().toUpperCase().replace(/\s+/g, "_");
  if (!/^[A-Z0-9_-]{1,40}$/.test(code) || !input.name.trim()) throw new ContractError("Enter a code and a name.");
  if (input.categoryId && !(await db.contractCategory.findFirst({ where: { id: input.categoryId, organizationId: actor.organizationId }, select: { id: true } }))) throw new ContractNotFoundError("Category not found.");
  try {
    return await db.contractType.create({ data: { organizationId: actor.organizationId, code, name: input.name.trim(), categoryId: input.categoryId ?? null } });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") throw new ContractError(`Type ${code} already exists.`);
    throw error;
  }
}

// --- Access ------------------------------------------------------------------

async function accessSubject(actor: ContractActor, client: Tx | typeof db = db): Promise<AccessSubject> {
  const [settings, employee] = await Promise.all([
    getContractSettings(actor.organizationId, client),
    client.hrEmployee.findFirst({ where: { organizationId: actor.organizationId, userId: actor.userId }, select: { department: true } }),
  ]);
  return { userId: actor.userId, roleId: actor.roleId, department: employee?.department ?? null, canViewConfidential: can(actor, PERMISSIONS.CONTRACTS_VIEW_CONFIDENTIAL), confidentialAdminAccess: settings.confidentialAdminAccess };
}

/** Database filter matching canViewContract(), so lists never load hidden contracts. */
function accessWhere(subject: AccessSubject): Prisma.ContractWhereInput {
  const grantClauses: Prisma.ContractAccessGrantWhereInput[] = [{ userId: subject.userId }];
  if (subject.roleId) grantClauses.push({ roleId: subject.roleId });
  if (subject.department) grantClauses.push({ department: { equals: subject.department, mode: "insensitive" } });
  const or: Prisma.ContractWhereInput[] = [
    { confidentiality: "STANDARD" },
    { ownerId: subject.userId },
    { createdById: subject.userId },
    { accessGrants: { some: { OR: grantClauses } } },
  ];
  if (subject.canViewConfidential && subject.confidentialAdminAccess) or.push({ confidentiality: "CONFIDENTIAL" });
  return { OR: or };
}

/** Loads a contract the actor may see, or throws not-found (never reveals existence). */
async function loadAccessibleContract(actor: ContractActor, contractId: string, client: Tx | typeof db = db) {
  requirePermission(actor, PERMISSIONS.CONTRACTS_VIEW);
  const contract = await client.contract.findFirst({ where: { id: contractId, organizationId: actor.organizationId }, include: { accessGrants: true } });
  if (!contract) throw new ContractNotFoundError("Contract not found.");
  const subject = await accessSubject(actor, client);
  if (!canViewContract(subject, { confidentiality: contract.confidentiality, ownerId: contract.ownerId, createdById: contract.createdById, grants: contract.accessGrants })) {
    throw new ContractNotFoundError("Contract not found.");
  }
  return contract;
}

// --- Numbering ---------------------------------------------------------------

async function nextContractNumber(tx: Tx, organizationId: string, issuedAt: Date) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`${organizationId}:contract-number`}))`;
  const [settings, organization] = await Promise.all([getContractSettings(organizationId, tx), tx.organization.findUniqueOrThrow({ where: { id: organizationId }, select: { timezone: true } })]);
  const parts = zonedDateParts(issuedAt, organization.timezone);
  const year = Number(parts.year);
  let sequence = settings.resetSequenceYearly && formatUsesYear(settings.numberFormat) && settings.sequenceYear !== year ? 1 : settings.nextSequence;
  let contractNumber = formatContractNumber(settings.numberFormat, settings.numberPrefix, { year, month: Number(parts.month) }, sequence);
  // Skip any number already used (for example after a format change).
  while (await tx.contract.findUnique({ where: { organizationId_contractNumber: { organizationId, contractNumber } }, select: { id: true } })) {
    sequence += 1;
    contractNumber = formatContractNumber(settings.numberFormat, settings.numberPrefix, { year, month: Number(parts.month) }, sequence);
  }
  await tx.contractSettings.update({ where: { organizationId }, data: { nextSequence: sequence + 1, sequenceYear: year } });
  return contractNumber;
}

// --- Create and update -------------------------------------------------------

export type ContractInput = {
  title: string;
  categoryId?: string | null;
  typeId?: string | null;
  branchId?: string | null;
  ownerId?: string | null;
  department?: string | null;
  counterpartyName: string;
  value?: string | null;
  currency: string;
  taxTreatment?: string | null;
  startDate?: Date | null;
  effectiveDate?: Date | null;
  expirationDate?: Date | null;
  renewalDate?: Date | null;
  noticePeriodDays?: number | null;
  renewalType: ContractRenewalType;
  paymentTerms?: string | null;
  billingFrequency?: string | null;
  governingLaw?: string | null;
  governingJurisdiction?: string | null;
  language?: string | null;
  riskLevel: ContractRiskLevel;
  confidentiality: ContractConfidentiality;
  description?: string | null;
  body?: string | null;
  tags?: string[];
  notes?: string | null;
};

const text = (value: string | null | undefined, max = 500) => (value?.trim() ? value.trim().slice(0, max) : null);

async function validateInput(actor: ContractActor, input: ContractInput, client: Tx | typeof db = db) {
  const title = input.title.trim();
  const counterpartyName = input.counterpartyName.trim();
  if (!title) throw new ContractError("Enter a contract title.");
  if (!counterpartyName) throw new ContractError("Enter the counterparty.");
  const currency = input.currency.trim().toUpperCase();
  if (!isValidCurrencyCode(currency)) throw new ContractError("Choose a valid currency.");
  let value: Prisma.Decimal | null = null;
  if (input.value?.trim()) {
    try {
      value = new Prisma.Decimal(input.value.trim());
    } catch {
      throw new ContractError("Contract value must be a number.");
    }
    if (!value.isFinite() || value.isNegative() || value.decimalPlaces() > 2) throw new ContractError("Contract value must be zero or more with at most two decimal places.");
  }
  if (input.startDate && input.expirationDate && input.expirationDate < input.startDate) throw new ContractError("The expiration date cannot be before the start date.");
  if (input.noticePeriodDays !== null && input.noticePeriodDays !== undefined && (!Number.isInteger(input.noticePeriodDays) || input.noticePeriodDays < 0 || input.noticePeriodDays > 3650)) throw new ContractError("Notice period must be between 0 and 3650 days.");
  // Every related record must belong to the same organization.
  const org = actor.organizationId;
  const checks: [string | null | undefined, () => Promise<unknown>, string][] = [
    [input.categoryId, () => client.contractCategory.findFirst({ where: { id: input.categoryId!, organizationId: org }, select: { id: true } }), "Category not found."],
    [input.typeId, () => client.contractType.findFirst({ where: { id: input.typeId!, organizationId: org }, select: { id: true } }), "Contract type not found."],
    [input.branchId, () => client.branch.findFirst({ where: { id: input.branchId!, organizationId: org }, select: { id: true } }), "Branch not found."],
    [input.ownerId, () => client.organizationMember.findFirst({ where: { userId: input.ownerId!, organizationId: org, status: "ACTIVE" }, select: { id: true } }), "The owner must be an active member of this organization."],
  ];
  for (const [id, lookup, message] of checks) if (id && !(await lookup())) throw new ContractNotFoundError(message);
  const tags = [...new Set((input.tags ?? []).map((tag) => tag.trim().toLowerCase()).filter(Boolean))].slice(0, 20).map((tag) => tag.slice(0, 40));
  return {
    title: title.slice(0, 200), categoryId: input.categoryId || null, typeId: input.typeId || null, branchId: input.branchId || null, ownerId: input.ownerId || null,
    department: text(input.department, 120), counterpartyName: counterpartyName.slice(0, 200), value, currency, taxTreatment: text(input.taxTreatment, 120),
    startDate: input.startDate ?? null, effectiveDate: input.effectiveDate ?? null, expirationDate: input.expirationDate ?? null, renewalDate: input.renewalDate ?? null,
    noticePeriodDays: input.noticePeriodDays ?? null, renewalType: input.renewalType, paymentTerms: text(input.paymentTerms, 200), billingFrequency: text(input.billingFrequency, 60),
    governingLaw: text(input.governingLaw, 120), governingJurisdiction: text(input.governingJurisdiction, 120), language: text(input.language, 20), riskLevel: input.riskLevel,
    confidentiality: input.confidentiality, description: text(input.description, 5000), body: input.body?.trim() ? input.body.slice(0, 200_000) : null, tags, notes: text(input.notes, 5000),
  };
}

function snapshotOf(contract: Record<string, unknown>) {
  const snapshot: Record<string, unknown> = {};
  for (const field of VERSIONED_FIELDS) {
    const value = contract[field];
    snapshot[field] = value instanceof Date ? value.toISOString() : value instanceof Prisma.Decimal ? value.toFixed(2) : value ?? null;
  }
  return snapshot as Prisma.InputJsonValue;
}

/** Audit-safe change summary: long text bodies are recorded as changed, not copied. */
function auditChanges(changes: Record<string, { from: unknown; to: unknown }>) {
  const safe: Record<string, unknown> = {};
  for (const [field, change] of Object.entries(changes)) safe[field] = field === "body" || field === "notes" || field === "description" ? "changed" : change;
  return safe;
}

export async function createContract(actor: ContractActor, input: ContractInput & { templateId?: string | null; parties?: PartyInput[] }) {
  requirePermission(actor, PERMISSIONS.CONTRACTS_CREATE);
  const data = await validateInput(actor, input);
  let template: { id: string; version: number; body: string } | null = null;
  if (input.templateId) {
    template = await db.contractTemplate.findFirst({ where: { id: input.templateId, organizationId: actor.organizationId, status: "ACTIVE" }, select: { id: true, version: true, body: true } });
    if (!template) throw new ContractNotFoundError("Template not found or not active.");
  }
  return db.$transaction(async (tx) => {
    const contractNumber = await nextContractNumber(tx, actor.organizationId, new Date());
    let body = data.body;
    if (template && !body) body = await renderContractTemplate(tx, actor.organizationId, template.body, { ...data, contractNumber });
    const contract = await tx.contract.create({
      data: { ...data, body, organizationId: actor.organizationId, contractNumber, templateId: template?.id ?? null, templateVersion: template?.version ?? null, createdById: actor.userId, ownerId: data.ownerId ?? actor.userId },
    });
    for (const [index, party] of (input.parties ?? []).entries()) await createParty(tx, actor, contract.id, party, index);
    await tx.contractVersion.create({ data: { organizationId: actor.organizationId, contractId: contract.id, version: 1, snapshot: snapshotOf(contract), changedFields: [], reason: "Created", changedById: actor.userId } });
    await logAuditEvent({ organizationId: actor.organizationId, userId: actor.userId, module: "contracts", action: "contract.created", entityName: "Contract", entityId: contract.id, metadata: { contractNumber, title: contract.title, confidentiality: contract.confidentiality, templateId: template?.id ?? null } }, tx);
    return contract;
  }, { timeout: 20_000 });
}

const EDITABLE_STATUSES: ContractStatus[] = ["DRAFT", "PENDING_APPROVAL", "APPROVED", "ACTIVE"];

export async function updateContract(actor: ContractActor, contractId: string, input: ContractInput, reason?: string | null) {
  requirePermission(actor, PERMISSIONS.CONTRACTS_UPDATE);
  return db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`contract:${contractId}`}))`;
    const current = await loadAccessibleContract(actor, contractId, tx);
    if (!EDITABLE_STATUSES.includes(current.status)) throw new ContractError("Terminated, expired, cancelled, and archived contracts cannot be edited.");
    if (current.status === "ACTIVE" && !reason?.trim()) throw new ContractError("Enter a reason for changing an active contract.");
    const data = await validateInput(actor, input, tx);
    // A contract always has an owner: leaving the owner blank keeps the current one.
    if (!data.ownerId) data.ownerId = current.ownerId;
    if (!can(actor, PERMISSIONS.CONTRACTS_VIEW_FINANCIALS)) {
      // Without financial access the financial fields stay as they are.
      data.value = current.value;
      data.taxTreatment = current.taxTreatment;
      data.paymentTerms = current.paymentTerms;
      data.billingFrequency = current.billingFrequency;
    }
    if (current.confidentiality !== data.confidentiality && current.ownerId !== actor.userId && !can(actor, PERMISSIONS.CONTRACTS_VIEW_CONFIDENTIAL)) {
      throw new ContractForbiddenError("Only the owner or a user with confidential access can change confidentiality.");
    }
    const changes = diffContract(current as unknown as Record<string, unknown>, data as unknown as Record<string, unknown>);
    if (!Object.keys(changes).length) return current;
    const version = current.currentVersion + 1;
    const updated = await tx.contract.update({ where: { id: contractId }, data: { ...data, currentVersion: version } });
    await tx.contractVersion.create({ data: { organizationId: actor.organizationId, contractId, version, snapshot: snapshotOf(updated), changedFields: Object.keys(changes), changes: auditChanges(changes) as Prisma.InputJsonValue, reason: reason?.trim().slice(0, 500) || null, changedById: actor.userId } });
    await logAuditEvent({ organizationId: actor.organizationId, userId: actor.userId, module: "contracts", action: "confidentiality" in changes ? "contract.confidentiality_changed" : "contract.updated", entityName: "Contract", entityId: contractId, metadata: { version, changes: auditChanges(changes), reason: reason?.trim() || null } }, tx);
    return updated;
  }, { timeout: 20_000 });
}

/**
 * Simple status transitions available without an approval workflow.
 * Archiving is the delete operation: contracts are never removed, so legal
 * and financial history stays intact and can be restored.
 */
const STATUS_ACTIONS = {
  ACTIVATE: { from: ["DRAFT", "APPROVED"] as ContractStatus[], to: "ACTIVE" as ContractStatus, permission: PERMISSIONS.CONTRACTS_UPDATE, audit: "contract.activated" },
  CANCEL: { from: ["DRAFT", "PENDING_APPROVAL", "APPROVED"] as ContractStatus[], to: "CANCELLED" as ContractStatus, permission: PERMISSIONS.CONTRACTS_UPDATE, audit: "contract.cancelled" },
  MARK_EXPIRED: { from: ["ACTIVE"] as ContractStatus[], to: "EXPIRED" as ContractStatus, permission: PERMISSIONS.CONTRACTS_UPDATE, audit: "contract.expired" },
  ARCHIVE: { from: ["DRAFT", "CANCELLED", "EXPIRED", "TERMINATED"] as ContractStatus[], to: "ARCHIVED" as ContractStatus, permission: PERMISSIONS.CONTRACTS_DELETE, audit: "contract.archived" },
} as const;
export type ContractStatusAction = keyof typeof STATUS_ACTIONS | "RESTORE";

export async function changeContractStatus(actor: ContractActor, contractId: string, action: ContractStatusAction, reason?: string | null) {
  return db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`contract:${contractId}`}))`;
    const current = await loadAccessibleContract(actor, contractId, tx);
    let to: ContractStatus;
    let auditAction: string;
    if (action === "RESTORE") {
      requirePermission(actor, PERMISSIONS.CONTRACTS_DELETE);
      if (current.status !== "ARCHIVED") throw new ContractError("Only archived contracts can be restored.");
      const previous = await tx.contractVersion.findFirst({ where: { contractId, NOT: { snapshot: { path: ["status"], equals: "ARCHIVED" } } }, orderBy: { version: "desc" } });
      to = ((previous?.snapshot as { status?: ContractStatus } | null)?.status ?? "DRAFT");
      auditAction = "contract.restored";
    } else {
      const rule = STATUS_ACTIONS[action];
      requirePermission(actor, rule.permission);
      if (!rule.from.includes(current.status)) throw new ContractError(`A ${current.status.toLowerCase().replace("_", " ")} contract cannot be changed that way.`);
      if (action === "ACTIVATE" && !current.startDate) throw new ContractError("Set a start date before activating the contract.");
      to = rule.to;
      auditAction = rule.audit;
    }
    const version = current.currentVersion + 1;
    const updated = await tx.contract.update({ where: { id: contractId }, data: { status: to, currentVersion: version, archivedAt: to === "ARCHIVED" ? new Date() : current.status === "ARCHIVED" ? null : current.archivedAt } });
    await tx.contractVersion.create({ data: { organizationId: actor.organizationId, contractId, version, snapshot: snapshotOf(updated), changedFields: ["status"], changes: { status: { from: current.status, to } }, reason: reason?.trim().slice(0, 500) || null, changedById: actor.userId } });
    await logAuditEvent({ organizationId: actor.organizationId, userId: actor.userId, module: "contracts", action: auditAction, entityName: "Contract", entityId: contractId, metadata: { from: current.status, to, reason: reason?.trim() || null } }, tx);
    return updated;
  }, { timeout: 20_000 });
}

// --- Parties ---------------------------------------------------------------------

export type PartyInput = { role: ContractPartyRole; customRole?: string | null; name: string; legalName?: string | null; email?: string | null; phone?: string | null; address?: string | null; taxId?: string | null; registrationNumber?: string | null; contactId?: string | null; isPrimary?: boolean; signatoryName?: string | null; signatoryTitle?: string | null };

async function createParty(tx: Tx, actor: ContractActor, contractId: string, input: PartyInput, sortOrder: number) {
  if (!input.name.trim()) throw new ContractError("Each party needs a name.");
  if (input.role === "OTHER" && !input.customRole?.trim()) throw new ContractError("Describe the custom party role.");
  if (input.contactId && !(await tx.accountingContact.findFirst({ where: { id: input.contactId, organizationId: actor.organizationId }, select: { id: true } }))) throw new ContractNotFoundError("Contact not found.");
  if (input.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email.trim())) throw new ContractError("Enter a valid party email address.");
  return tx.contractParty.create({
    data: {
      organizationId: actor.organizationId, contractId, role: input.role, customRole: text(input.customRole, 80), name: input.name.trim().slice(0, 200), legalName: text(input.legalName, 200),
      email: text(input.email, 320), phone: text(input.phone, 40), address: text(input.address, 500), taxId: text(input.taxId, 60), registrationNumber: text(input.registrationNumber, 80),
      contactId: input.contactId || null, isPrimary: input.isPrimary ?? false, signatoryName: text(input.signatoryName, 120), signatoryTitle: text(input.signatoryTitle, 120), sortOrder,
    },
  });
}

export async function addContractParty(actor: ContractActor, contractId: string, input: PartyInput) {
  requirePermission(actor, PERMISSIONS.CONTRACTS_UPDATE);
  return db.$transaction(async (tx) => {
    const contract = await loadAccessibleContract(actor, contractId, tx);
    if (!EDITABLE_STATUSES.includes(contract.status)) throw new ContractError("Parties cannot change on a closed contract.");
    const count = await tx.contractParty.count({ where: { contractId } });
    const party = await createParty(tx, actor, contractId, input, count);
    await logAuditEvent({ organizationId: actor.organizationId, userId: actor.userId, module: "contracts", action: "contract.party_added", entityName: "Contract", entityId: contractId, metadata: { partyId: party.id, role: party.role, name: party.name } }, tx);
    return party;
  });
}

export async function removeContractParty(actor: ContractActor, contractId: string, partyId: string) {
  requirePermission(actor, PERMISSIONS.CONTRACTS_UPDATE);
  return db.$transaction(async (tx) => {
    const contract = await loadAccessibleContract(actor, contractId, tx);
    if (!EDITABLE_STATUSES.includes(contract.status)) throw new ContractError("Parties cannot change on a closed contract.");
    const party = await tx.contractParty.findFirst({ where: { id: partyId, contractId, organizationId: actor.organizationId } });
    if (!party) throw new ContractNotFoundError("Party not found.");
    await tx.contractParty.delete({ where: { id: party.id } });
    await logAuditEvent({ organizationId: actor.organizationId, userId: actor.userId, module: "contracts", action: "contract.party_removed", entityName: "Contract", entityId: contractId, metadata: { partyId, role: party.role, name: party.name } }, tx);
  });
}

// --- Documents ----------------------------------------------------------------------

export async function uploadContractDocument(actor: ContractActor, contractId: string, input: { documentType: ContractDocumentType; title: string; fileName: string; mimeType: string; bytes: Uint8Array }) {
  requirePermission(actor, PERMISSIONS.CONTRACTS_UPDATE);
  const title = input.title.trim().slice(0, 200) || input.fileName;
  return db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`contract-docs:${contractId}`}))`;
    const contract = await loadAccessibleContract(actor, contractId, tx);
    const previous = await tx.contractDocument.findFirst({ where: { contractId, documentType: input.documentType, title, removedAt: null }, orderBy: { version: "desc" } });
    const { asset, checksum } = await storePrivateFile(tx, { organizationId: actor.organizationId, uploadedById: actor.userId, fileName: input.fileName, mimeType: input.mimeType, bytes: input.bytes, purpose: "contract-document", branchId: contract.branchId });
    const document = await tx.contractDocument.create({ data: { organizationId: actor.organizationId, contractId, documentType: input.documentType, title, version: (previous?.version ?? 0) + 1, fileAssetId: asset.id, checksumSha256: checksum, supersedesId: previous?.id ?? null, uploadedById: actor.userId } });
    await logAuditEvent({ organizationId: actor.organizationId, userId: actor.userId, module: "contracts", action: "contract.document_uploaded", entityName: "Contract", entityId: contractId, metadata: { documentId: document.id, documentType: input.documentType, title, version: document.version, checksumSha256: checksum, size: input.bytes.byteLength } }, tx);
    return document;
  }, { timeout: 30_000 });
}

/** Soft removal: the file and its history remain for audit. */
export async function removeContractDocument(actor: ContractActor, documentId: string, reason: string) {
  requirePermission(actor, PERMISSIONS.CONTRACTS_UPDATE);
  if (!reason.trim()) throw new ContractError("Enter a reason for removing the document.");
  return db.$transaction(async (tx) => {
    const document = await tx.contractDocument.findFirst({ where: { id: documentId, organizationId: actor.organizationId } });
    if (!document) throw new ContractNotFoundError("Document not found.");
    await loadAccessibleContract(actor, document.contractId, tx);
    if (document.removedAt) throw new ContractError("The document has already been removed.");
    await tx.contractDocument.update({ where: { id: document.id }, data: { removedAt: new Date(), removedById: actor.userId, removalReason: reason.trim().slice(0, 500) } });
    await logAuditEvent({ organizationId: actor.organizationId, userId: actor.userId, module: "contracts", action: "contract.document_removed", entityName: "Contract", entityId: document.contractId, metadata: { documentId, title: document.title, version: document.version, reason: reason.trim() } }, tx);
  });
}

/** Authorized download. Verifies the stored checksum and audits the access. */
export async function getContractDocumentForDownload(actor: ContractActor, documentId: string) {
  const document = await db.contractDocument.findFirst({ where: { id: documentId, organizationId: actor.organizationId } });
  if (!document) throw new ContractNotFoundError("Document not found.");
  await loadAccessibleContract(actor, document.contractId);
  const file = await readPrivateFile(actor.organizationId, document.fileAssetId);
  if (!file) throw new ContractNotFoundError("Document not found.");
  if (sha256(file.bytes) !== document.checksumSha256) throw new ContractError("The stored document failed its integrity check.");
  await logAuditEvent({ organizationId: actor.organizationId, userId: actor.userId, module: "contracts", action: "contract.document_downloaded", entityName: "Contract", entityId: document.contractId, metadata: { documentId, title: document.title, version: document.version } });
  return { ...file, document };
}

// --- Access grants ----------------------------------------------------------------

export async function addContractAccessGrant(actor: ContractActor, contractId: string, input: { userId?: string | null; roleId?: string | null; department?: string | null }) {
  const targets = [input.userId, input.roleId, input.department?.trim()].filter(Boolean);
  if (targets.length !== 1) throw new ContractError("Grant access to exactly one user, role, or department.");
  return db.$transaction(async (tx) => {
    const contract = await loadAccessibleContract(actor, contractId, tx);
    if (contract.ownerId !== actor.userId && !can(actor, PERMISSIONS.CONTRACTS_VIEW_CONFIDENTIAL)) throw new ContractForbiddenError("Only the owner or a user with confidential access can manage access.");
    if (input.userId && !(await tx.organizationMember.findFirst({ where: { userId: input.userId, organizationId: actor.organizationId, status: "ACTIVE" }, select: { id: true } }))) throw new ContractNotFoundError("User not found in this organization.");
    if (input.roleId && !(await tx.role.findFirst({ where: { id: input.roleId, OR: [{ organizationId: actor.organizationId }, { organizationId: null, isSystem: true }] }, select: { id: true } }))) throw new ContractNotFoundError("Role not found.");
    const grant = await tx.contractAccessGrant.create({ data: { organizationId: actor.organizationId, contractId, userId: input.userId || null, roleId: input.roleId || null, department: input.department?.trim().slice(0, 120) || null, grantedById: actor.userId } });
    await logAuditEvent({ organizationId: actor.organizationId, userId: actor.userId, module: "contracts", action: "contract.permissions_changed", entityName: "Contract", entityId: contractId, metadata: { granted: { userId: grant.userId, roleId: grant.roleId, department: grant.department } } }, tx);
    return grant;
  });
}

export async function removeContractAccessGrant(actor: ContractActor, contractId: string, grantId: string) {
  return db.$transaction(async (tx) => {
    const contract = await loadAccessibleContract(actor, contractId, tx);
    if (contract.ownerId !== actor.userId && !can(actor, PERMISSIONS.CONTRACTS_VIEW_CONFIDENTIAL)) throw new ContractForbiddenError("Only the owner or a user with confidential access can manage access.");
    const grant = await tx.contractAccessGrant.findFirst({ where: { id: grantId, contractId, organizationId: actor.organizationId } });
    if (!grant) throw new ContractNotFoundError("Access grant not found.");
    await tx.contractAccessGrant.delete({ where: { id: grant.id } });
    await logAuditEvent({ organizationId: actor.organizationId, userId: actor.userId, module: "contracts", action: "contract.permissions_changed", entityName: "Contract", entityId: contractId, metadata: { revoked: { userId: grant.userId, roleId: grant.roleId, department: grant.department } } }, tx);
  });
}

// --- Templates and clauses ------------------------------------------------------------

async function renderContractTemplate(tx: Tx, organizationId: string, body: string, contract: { contractNumber: string; title: string; counterpartyName: string; startDate: Date | null; expirationDate: Date | null; effectiveDate: Date | null; value: Prisma.Decimal | null; currency: string; paymentTerms: string | null; governingLaw: string | null; noticePeriodDays: number | null }) {
  const organization = await tx.organization.findUniqueOrThrow({ where: { id: organizationId }, select: { name: true, legalName: true, address: true, country: true, businessRegistrationNumber: true, taxNumber: true, timezone: true } });
  const day = (date: Date | null) => (date ? date.toISOString().slice(0, 10) : null);
  const context: TemplateContext = {
    "organization.name": organization.name, "organization.legalName": organization.legalName ?? organization.name, "organization.address": organization.address, "organization.country": organization.country,
    "organization.registrationNumber": organization.businessRegistrationNumber, "organization.taxNumber": organization.taxNumber,
    "counterparty.name": contract.counterpartyName, "contract.number": contract.contractNumber, "contract.title": contract.title, "contract.startDate": day(contract.startDate),
    "contract.endDate": day(contract.expirationDate), "contract.effectiveDate": day(contract.effectiveDate), "contract.value": contract.value?.toFixed(2) ?? null, "contract.currency": contract.currency,
    "contract.paymentTerms": contract.paymentTerms, "contract.governingLaw": contract.governingLaw, "contract.noticePeriodDays": contract.noticePeriodDays,
  };
  return renderTemplate(body, context).text;
}

function normalizeCode(code: string) {
  const value = code.trim().toUpperCase().replace(/\s+/g, "_");
  if (!/^[A-Z0-9_-]{1,40}$/.test(value)) throw new ContractError("Codes use up to 40 letters, numbers, hyphens, or underscores.");
  return value;
}

export async function createContractTemplate(actor: ContractActor, input: { code: string; name: string; categoryId?: string | null; description?: string | null; body: string }) {
  requirePermission(actor, PERMISSIONS.CONTRACTS_MANAGE_TEMPLATES);
  const code = normalizeCode(input.code);
  if (!input.name.trim() || !input.body.trim()) throw new ContractError("Templates need a name and body.");
  if (input.categoryId && !(await db.contractCategory.findFirst({ where: { id: input.categoryId, organizationId: actor.organizationId }, select: { id: true } }))) throw new ContractNotFoundError("Category not found.");
  if (await db.contractTemplate.findFirst({ where: { organizationId: actor.organizationId, code }, select: { id: true } })) throw new ContractError(`Template ${code} already exists. Create a new version instead.`);
  const template = await db.contractTemplate.create({ data: { organizationId: actor.organizationId, code, name: input.name.trim().slice(0, 200), categoryId: input.categoryId || null, description: text(input.description, 1000), body: input.body.slice(0, 200_000), createdById: actor.userId } });
  await logAuditEvent({ organizationId: actor.organizationId, userId: actor.userId, module: "contracts", action: "contract_template.created", entityName: "ContractTemplate", entityId: template.id, metadata: { code, version: 1 } });
  return template;
}

/** New template version; contracts drafted from earlier versions are unchanged. */
export async function createContractTemplateVersion(actor: ContractActor, templateId: string, input: { name?: string; body: string; description?: string | null }) {
  requirePermission(actor, PERMISSIONS.CONTRACTS_MANAGE_TEMPLATES);
  return db.$transaction(async (tx) => {
    const base = await tx.contractTemplate.findFirst({ where: { id: templateId, organizationId: actor.organizationId } });
    if (!base) throw new ContractNotFoundError("Template not found.");
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`${actor.organizationId}:template:${base.code}`}))`;
    const latest = await tx.contractTemplate.findFirstOrThrow({ where: { organizationId: actor.organizationId, code: base.code }, orderBy: { version: "desc" } });
    const created = await tx.contractTemplate.create({ data: { organizationId: actor.organizationId, code: base.code, name: input.name?.trim() || latest.name, categoryId: latest.categoryId, description: input.description !== undefined ? text(input.description, 1000) : latest.description, body: input.body.slice(0, 200_000), version: latest.version + 1, supersedesId: latest.id, createdById: actor.userId } });
    await logAuditEvent({ organizationId: actor.organizationId, userId: actor.userId, module: "contracts", action: "contract_template.version_created", entityName: "ContractTemplate", entityId: created.id, metadata: { code: base.code, version: created.version } }, tx);
    return created;
  });
}

/** Activating a version retires the previously active version of the same template. */
export async function setContractTemplateStatus(actor: ContractActor, templateId: string, status: "ACTIVE" | "RETIRED") {
  requirePermission(actor, PERMISSIONS.CONTRACTS_MANAGE_TEMPLATES);
  return db.$transaction(async (tx) => {
    const template = await tx.contractTemplate.findFirst({ where: { id: templateId, organizationId: actor.organizationId } });
    if (!template) throw new ContractNotFoundError("Template not found.");
    if (status === "ACTIVE") await tx.contractTemplate.updateMany({ where: { organizationId: actor.organizationId, code: template.code, status: "ACTIVE", NOT: { id: template.id } }, data: { status: "RETIRED" } });
    const updated = await tx.contractTemplate.update({ where: { id: template.id }, data: { status } });
    await logAuditEvent({ organizationId: actor.organizationId, userId: actor.userId, module: "contracts", action: status === "ACTIVE" ? "contract_template.activated" : "contract_template.retired", entityName: "ContractTemplate", entityId: template.id, metadata: { code: template.code, version: template.version } }, tx);
    return updated;
  });
}

export async function duplicateContractTemplate(actor: ContractActor, templateId: string, newCode: string) {
  requirePermission(actor, PERMISSIONS.CONTRACTS_MANAGE_TEMPLATES);
  const source = await db.contractTemplate.findFirst({ where: { id: templateId, organizationId: actor.organizationId } });
  if (!source) throw new ContractNotFoundError("Template not found.");
  return createContractTemplate(actor, { code: newCode, name: `${source.name} (copy)`, categoryId: source.categoryId, description: source.description, body: source.body });
}

export async function createContractClause(actor: ContractActor, input: { code: string; name: string; category: string; body: string; jurisdiction?: string | null; language?: string | null; usage: "RECOMMENDED" | "REQUIRED" | "OPTIONAL" | "RESTRICTED"; ownerId?: string | null; effectiveFrom?: Date | null }) {
  requirePermission(actor, PERMISSIONS.CONTRACTS_MANAGE_CLAUSES);
  const code = normalizeCode(input.code);
  if (!input.name.trim() || !input.body.trim() || !input.category.trim()) throw new ContractError("Clauses need a name, category, and text.");
  if (await db.contractClause.findFirst({ where: { organizationId: actor.organizationId, code }, select: { id: true } })) throw new ContractError(`Clause ${code} already exists. Create a new version instead.`);
  if (input.ownerId && !(await db.organizationMember.findFirst({ where: { userId: input.ownerId, organizationId: actor.organizationId }, select: { id: true } }))) throw new ContractNotFoundError("Owner not found.");
  const clause = await db.contractClause.create({ data: { organizationId: actor.organizationId, code, name: input.name.trim().slice(0, 200), category: input.category.trim().slice(0, 80), body: input.body.slice(0, 50_000), jurisdiction: text(input.jurisdiction, 60), language: text(input.language, 20) ?? "en", usage: input.usage, ownerId: input.ownerId || actor.userId, effectiveFrom: input.effectiveFrom ?? null, createdById: actor.userId } });
  await logAuditEvent({ organizationId: actor.organizationId, userId: actor.userId, module: "contracts", action: "contract_clause.created", entityName: "ContractClause", entityId: clause.id, metadata: { code, usage: input.usage } });
  return clause;
}

export async function createContractClauseVersion(actor: ContractActor, clauseId: string, input: { body: string; name?: string; usage?: "RECOMMENDED" | "REQUIRED" | "OPTIONAL" | "RESTRICTED" }) {
  requirePermission(actor, PERMISSIONS.CONTRACTS_MANAGE_CLAUSES);
  return db.$transaction(async (tx) => {
    const base = await tx.contractClause.findFirst({ where: { id: clauseId, organizationId: actor.organizationId } });
    if (!base) throw new ContractNotFoundError("Clause not found.");
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`${actor.organizationId}:clause:${base.code}`}))`;
    const latest = await tx.contractClause.findFirstOrThrow({ where: { organizationId: actor.organizationId, code: base.code }, orderBy: { version: "desc" } });
    const created = await tx.contractClause.create({ data: { organizationId: actor.organizationId, code: base.code, name: input.name?.trim() || latest.name, category: latest.category, body: input.body.slice(0, 50_000), jurisdiction: latest.jurisdiction, language: latest.language, usage: input.usage ?? latest.usage, ownerId: latest.ownerId, version: latest.version + 1, supersedesId: latest.id, createdById: actor.userId } });
    await logAuditEvent({ organizationId: actor.organizationId, userId: actor.userId, module: "contracts", action: "contract_clause.version_created", entityName: "ContractClause", entityId: created.id, metadata: { code: base.code, version: created.version } }, tx);
    return created;
  });
}

export async function setContractClauseStatus(actor: ContractActor, clauseId: string, status: "APPROVED" | "RETIRED") {
  requirePermission(actor, PERMISSIONS.CONTRACTS_MANAGE_CLAUSES);
  const result = await db.contractClause.updateMany({ where: { id: clauseId, organizationId: actor.organizationId }, data: { status } });
  if (result.count !== 1) throw new ContractNotFoundError("Clause not found.");
  await logAuditEvent({ organizationId: actor.organizationId, userId: actor.userId, module: "contracts", action: status === "APPROVED" ? "contract_clause.approved" : "contract_clause.retired", entityName: "ContractClause", entityId: clauseId });
}

/** Attaches an approved clause version. Restricted clauses need clause-management permission. */
export async function attachContractClause(actor: ContractActor, contractId: string, clauseId: string) {
  requirePermission(actor, PERMISSIONS.CONTRACTS_UPDATE);
  return db.$transaction(async (tx) => {
    const contract = await loadAccessibleContract(actor, contractId, tx);
    if (!EDITABLE_STATUSES.includes(contract.status)) throw new ContractError("Clauses cannot change on a closed contract.");
    const clause = await tx.contractClause.findFirst({ where: { id: clauseId, organizationId: actor.organizationId } });
    if (!clause) throw new ContractNotFoundError("Clause not found.");
    if (clause.status !== "APPROVED") throw new ContractError("Only approved clauses can be added to a contract.");
    if (clause.usage === "RESTRICTED" && !can(actor, PERMISSIONS.CONTRACTS_MANAGE_CLAUSES)) throw new ContractForbiddenError("Restricted clauses need clause-management permission.");
    const count = await tx.contractClauseLink.count({ where: { contractId } });
    const link = await tx.contractClauseLink.create({ data: { organizationId: actor.organizationId, contractId, clauseId, sortOrder: count } }).catch((error: unknown) => {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") throw new ContractError("That clause is already on the contract.");
      throw error;
    });
    await logAuditEvent({ organizationId: actor.organizationId, userId: actor.userId, module: "contracts", action: "contract.clause_added", entityName: "Contract", entityId: contractId, metadata: { clauseId, code: clause.code, version: clause.version } }, tx);
    return link;
  });
}

export async function detachContractClause(actor: ContractActor, contractId: string, linkId: string) {
  requirePermission(actor, PERMISSIONS.CONTRACTS_UPDATE);
  return db.$transaction(async (tx) => {
    const contract = await loadAccessibleContract(actor, contractId, tx);
    if (!EDITABLE_STATUSES.includes(contract.status)) throw new ContractError("Clauses cannot change on a closed contract.");
    const link = await tx.contractClauseLink.findFirst({ where: { id: linkId, contractId, organizationId: actor.organizationId }, include: { clause: { select: { code: true } } } });
    if (!link) throw new ContractNotFoundError("Clause not found on this contract.");
    await tx.contractClauseLink.delete({ where: { id: link.id } });
    await logAuditEvent({ organizationId: actor.organizationId, userId: actor.userId, module: "contracts", action: "contract.clause_removed", entityName: "Contract", entityId: contractId, metadata: { code: link.clause.code } }, tx);
  });
}

// --- Reads -------------------------------------------------------------------------

export type ContractListFilters = {
  q?: string | null;
  status?: ContractStatus | null;
  view?: "all" | "drafts" | "active" | "expiring" | "expired" | "terminated" | "archived" | null;
  categoryId?: string | null;
  ownerId?: string | null;
  currency?: string | null;
  tag?: string | null;
  clauseCode?: string | null;
  expiringWithinDays?: number | null;
  minValue?: string | null;
  maxValue?: string | null;
  page?: number;
  pageSize?: number;
};

export async function listContracts(actor: ContractActor, filters: ContractListFilters = {}) {
  requirePermission(actor, PERMISSIONS.CONTRACTS_VIEW);
  const subject = await accessSubject(actor);
  const and: Prisma.ContractWhereInput[] = [{ organizationId: actor.organizationId }, accessWhere(subject)];
  const now = new Date();
  const view = filters.view ?? "all";
  if (view === "drafts") and.push({ status: "DRAFT" });
  else if (view === "active") and.push({ status: "ACTIVE" });
  else if (view === "expired") and.push({ OR: [{ status: "EXPIRED" }, { status: "ACTIVE", expirationDate: { lt: now } }] });
  else if (view === "terminated") and.push({ status: "TERMINATED" });
  else if (view === "archived") and.push({ status: "ARCHIVED" });
  else if (view === "expiring") and.push({ status: "ACTIVE", expirationDate: { gte: now, lte: new Date(now.getTime() + (filters.expiringWithinDays ?? 90) * 86_400_000) } });
  else and.push({ status: { not: "ARCHIVED" } });
  if (filters.status) and.push({ status: filters.status });
  if (filters.categoryId) and.push({ categoryId: filters.categoryId });
  if (filters.ownerId) and.push({ ownerId: filters.ownerId });
  if (filters.currency && /^[A-Z]{3}$/.test(filters.currency)) and.push({ currency: filters.currency });
  if (filters.tag) and.push({ tags: { has: filters.tag.trim().toLowerCase() } });
  if (filters.clauseCode) and.push({ clauses: { some: { clause: { code: filters.clauseCode.trim().toUpperCase() } } } });
  if (can(actor, PERMISSIONS.CONTRACTS_VIEW_FINANCIALS)) {
    const toDecimal = (value: string | null | undefined) => (value && /^\d+(\.\d{1,2})?$/.test(value) ? new Prisma.Decimal(value) : null);
    const min = toDecimal(filters.minValue);
    const max = toDecimal(filters.maxValue);
    if (min) and.push({ value: { gte: min } });
    if (max) and.push({ value: { lte: max } });
  }
  const q = filters.q?.trim();
  if (q) {
    and.push({ OR: [
      { contractNumber: { contains: q, mode: "insensitive" } },
      { title: { contains: q, mode: "insensitive" } },
      { counterpartyName: { contains: q, mode: "insensitive" } },
      { department: { contains: q, mode: "insensitive" } },
      { governingJurisdiction: { contains: q, mode: "insensitive" } },
      { tags: { has: q.toLowerCase() } },
      { parties: { some: { name: { contains: q, mode: "insensitive" } } } },
      { owner: { name: { contains: q, mode: "insensitive" } } },
    ] });
  }
  const pageSize = Math.min(Math.max(filters.pageSize ?? 25, 1), 100);
  const page = Math.max(filters.page ?? 1, 1);
  const where: Prisma.ContractWhereInput = { AND: and };
  const [rows, total] = await Promise.all([
    db.contract.findMany({
      where,
      select: { id: true, contractNumber: true, title: true, counterpartyName: true, status: true, riskLevel: true, confidentiality: true, currency: true, value: true, startDate: true, expirationDate: true, renewalType: true, tags: true, category: { select: { name: true } }, owner: { select: { name: true, email: true } } },
      orderBy: view === "expiring" ? [{ expirationDate: "asc" }] : [{ updatedAt: "desc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    db.contract.count({ where }),
  ]);
  const showValue = can(actor, PERMISSIONS.CONTRACTS_VIEW_FINANCIALS);
  return { rows: rows.map((row) => ({ ...row, value: showValue ? row.value : null })), total, page, pageSize };
}

export async function getContractDetail(actor: ContractActor, contractId: string) {
  const contract = await loadAccessibleContract(actor, contractId);
  const [detail, versions] = await Promise.all([
    db.contract.findUniqueOrThrow({
      where: { id: contract.id },
      include: {
        category: true, type: true, branch: { select: { name: true } }, owner: { select: { id: true, name: true, email: true } }, createdBy: { select: { name: true, email: true } }, template: { select: { code: true, name: true } },
        parties: { orderBy: { sortOrder: "asc" }, include: { contact: { select: { name: true } } } },
        documents: { orderBy: [{ documentType: "asc" }, { title: "asc" }, { version: "desc" }], include: { uploadedBy: { select: { name: true, email: true } }, fileAsset: { select: { fileName: true, mimeType: true, size: true } } } },
        clauses: { orderBy: { sortOrder: "asc" }, include: { clause: true } },
        accessGrants: true,
        links: true,
      },
    }),
    db.contractVersion.findMany({ where: { contractId: contract.id }, orderBy: { version: "desc" }, take: 50, include: { changedBy: { select: { name: true, email: true } } } }),
  ]);
  const showFinancials = can(actor, PERMISSIONS.CONTRACTS_VIEW_FINANCIALS);
  if (contract.confidentiality !== "STANDARD") {
    await logAuditEvent({ organizationId: actor.organizationId, userId: actor.userId, module: "contracts", action: "contract.viewed", entityName: "Contract", entityId: contract.id, metadata: { confidentiality: contract.confidentiality } });
  }
  const requiredClauses = await db.contractClause.findMany({ where: { organizationId: actor.organizationId, status: "APPROVED", usage: "REQUIRED" }, select: { code: true, name: true }, distinct: ["code"] });
  const attachedCodes = new Set(detail.clauses.map((link) => link.clause.code));
  return {
    contract: showFinancials ? detail : { ...detail, value: null, taxTreatment: null, paymentTerms: null, billingFrequency: null },
    versions: versions.map((version) => ({ ...version, changes: showFinancials ? version.changes : redactJson(version.changes), snapshot: undefined })),
    missingRequiredClauses: requiredClauses.filter((clause) => !attachedCodes.has(clause.code)),
    canViewFinancials: showFinancials,
  };
}

function redactJson(changes: Prisma.JsonValue) {
  if (!changes || typeof changes !== "object" || Array.isArray(changes)) return changes;
  const copy: Record<string, unknown> = { ...(changes as Record<string, unknown>) };
  for (const field of ["value", "taxTreatment", "paymentTerms", "billingFrequency"]) if (field in copy) copy[field] = "hidden";
  return copy as Prisma.JsonValue;
}

/** Field-level comparison of two versions of a contract. */
export async function compareContractVersions(actor: ContractActor, contractId: string, fromVersion: number, toVersion: number) {
  const contract = await loadAccessibleContract(actor, contractId);
  const versions = await db.contractVersion.findMany({ where: { contractId: contract.id, version: { in: [fromVersion, toVersion] } } });
  const from = versions.find((version) => version.version === fromVersion);
  const to = versions.find((version) => version.version === toVersion);
  if (!from || !to) throw new ContractNotFoundError("Version not found.");
  const changes = diffContract(from.snapshot as Record<string, unknown>, to.snapshot as Record<string, unknown>);
  return can(actor, PERMISSIONS.CONTRACTS_VIEW_FINANCIALS) ? changes : (redactJson(changes as Prisma.JsonValue) as typeof changes);
}

export async function getContractDashboard(actor: ContractActor) {
  requirePermission(actor, PERMISSIONS.CONTRACTS_VIEW);
  const subject = await accessSubject(actor);
  const visible: Prisma.ContractWhereInput = { AND: [{ organizationId: actor.organizationId, status: { not: "ARCHIVED" } }, accessWhere(subject)] };
  const now = new Date();
  const inDays = (days: number) => new Date(now.getTime() + days * 86_400_000);
  const contracts = await db.contract.findMany({
    where: visible,
    select: { id: true, status: true, riskLevel: true, currency: true, value: true, expirationDate: true, renewalDate: true, renewalType: true, department: true, counterpartyName: true, category: { select: { name: true } } },
    take: 10_000,
  });
  const showFinancials = can(actor, PERMISSIONS.CONTRACTS_VIEW_FINANCIALS);
  const countBy = <K extends string>(values: K[]) => values.reduce<Record<string, number>>((acc, key) => ({ ...acc, [key]: (acc[key] ?? 0) + 1 }), {});
  const active = contracts.filter((contract) => contract.status === "ACTIVE");
  const expiringWithin = (days: number) => active.filter((contract) => contract.expirationDate && contract.expirationDate >= now && contract.expirationDate <= inDays(days)).length;
  const sumBy = (rows: typeof contracts, key: (row: (typeof contracts)[number]) => string) => {
    const totals = new Map<string, Prisma.Decimal>();
    for (const row of rows) if (row.value) totals.set(key(row), (totals.get(key(row)) ?? new Prisma.Decimal(0)).plus(row.value));
    return [...totals.entries()].map(([label, total]) => ({ label, total: total.toFixed(2) })).sort((a, b) => Number(b.total) - Number(a.total));
  };
  const trend: { month: string; count: number }[] = [];
  for (let offset = 0; offset < 12; offset++) {
    const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + offset, 1));
    const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + offset + 1, 1));
    trend.push({ month: start.toISOString().slice(0, 7), count: active.filter((contract) => contract.expirationDate && contract.expirationDate >= start && contract.expirationDate < end).length });
  }
  return {
    total: contracts.length,
    byStatus: countBy(contracts.map((contract) => contract.status)),
    byRisk: countBy(contracts.map((contract) => contract.riskLevel)),
    byDepartment: countBy(contracts.map((contract) => contract.department ?? "Unassigned")),
    expiring30: expiringWithin(30),
    expiring60: expiringWithin(60),
    expiring90: expiringWithin(90),
    expiredStillActive: active.filter((contract) => contract.expirationDate && contract.expirationDate < now).length,
    autoRenewalsUpcoming: active.filter((contract) => contract.renewalType === "AUTO_RENEWAL" && contract.renewalDate && contract.renewalDate >= now && contract.renewalDate <= inDays(90)).length,
    renewalsRequiringDecision: active.filter((contract) => contract.renewalType === "MANUAL_RENEWAL" && (contract.renewalDate ?? contract.expirationDate) && (contract.renewalDate ?? contract.expirationDate)! <= inDays(90)).length,
    expiryTrend: trend,
    activeValueByCurrency: showFinancials ? sumBy(active, (row) => row.currency) : null,
    valueByCategory: showFinancials ? sumBy(active, (row) => `${row.category?.name ?? "Uncategorized"} (${row.currency})`) : null,
    valueByCounterparty: showFinancials ? sumBy(active, (row) => `${row.counterpartyName} (${row.currency})`).slice(0, 10) : null,
  };
}

export async function getContractFormOptions(organizationId: string) {
  const [categories, types, branches, members, templates, clauses, roles] = await Promise.all([
    db.contractCategory.findMany({ where: { organizationId, active: true }, orderBy: { name: "asc" } }),
    db.contractType.findMany({ where: { organizationId, active: true }, orderBy: { name: "asc" } }),
    db.branch.findMany({ where: { organizationId }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    db.organizationMember.findMany({ where: { organizationId, status: "ACTIVE" }, select: { user: { select: { id: true, name: true, email: true } } }, orderBy: { createdAt: "asc" } }),
    db.contractTemplate.findMany({ where: { organizationId, status: "ACTIVE" }, select: { id: true, code: true, name: true, version: true }, orderBy: { name: "asc" } }),
    db.contractClause.findMany({ where: { organizationId, status: "APPROVED" }, select: { id: true, code: true, name: true, version: true, usage: true, category: true }, orderBy: [{ code: "asc" }, { version: "desc" }] }),
    db.role.findMany({ where: { OR: [{ organizationId }, { organizationId: null, isSystem: true }] }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);
  return { categories, types, branches, members: members.map((member) => member.user), templates, clauses, roles };
}

export const CONTRACT_PERMISSION_KEYS = [
  PERMISSIONS.CONTRACTS_VIEW, PERMISSIONS.CONTRACTS_CREATE, PERMISSIONS.CONTRACTS_UPDATE, PERMISSIONS.CONTRACTS_DELETE, PERMISSIONS.CONTRACTS_APPROVE,
  PERMISSIONS.CONTRACTS_TERMINATE, PERMISSIONS.CONTRACTS_RENEW, PERMISSIONS.CONTRACTS_MANAGE_TEMPLATES, PERMISSIONS.CONTRACTS_MANAGE_CLAUSES,
  PERMISSIONS.CONTRACTS_VIEW_FINANCIALS, PERMISSIONS.CONTRACTS_VIEW_CONFIDENTIAL, PERMISSIONS.CONTRACTS_MANAGE_SETTINGS, PERMISSIONS.CONTRACTS_EXPORT,
] as const;

/**
 * Builds the actor from the server-side tenant. Permissions pass through
 * hasPermission(), so they are inactive whenever the organization is not
 * entitled to Contracts.
 */
export function actorFromTenant(tenant: TenantContext): ContractActor {
  return { organizationId: tenant.organizationId, userId: tenant.userId, roleId: tenant.roleId, permissions: CONTRACT_PERMISSION_KEYS.filter((key) => hasPermission(tenant, key)) };
}

export { ContractRuleError };
