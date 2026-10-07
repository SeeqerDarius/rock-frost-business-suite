"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { ContractConfidentiality, ContractPartyRole, ContractRenewalType, ContractRiskLevel } from "@prisma/client";
import { requireModuleAccess } from "@/lib/auth/module-access";
import { CONTRACTS_FLASH_COOKIE, CONTRACTS_FLASH_PATH } from "@/modules/contracts/flash";
import {
  actorFromTenant,
  addContractAccessGrant,
  addContractParty,
  attachContractClause,
  changeContractStatus,
  ContractError,
  createContract,
  createContractCategory,
  createContractClause,
  createContractClauseVersion,
  createContractTemplate,
  createContractTemplateVersion,
  createContractType,
  detachContractClause,
  duplicateContractTemplate,
  removeContractAccessGrant,
  removeContractDocument,
  removeContractParty,
  setContractClauseStatus,
  setContractTemplateStatus,
  updateContract,
  updateContractSettings,
  type ContractInput,
  type ContractStatusAction,
  type PartyInput,
} from "@/modules/contracts/service";

const RENEWAL_TYPES = ["FIXED_TERM", "EVERGREEN", "AUTO_RENEWAL", "MANUAL_RENEWAL", "NO_RENEWAL"] as const;
const RISK_LEVELS = ["LOW", "MEDIUM", "HIGH", "CRITICAL"] as const;
const CONFIDENTIALITY = ["STANDARD", "CONFIDENTIAL", "RESTRICTED"] as const;
const PARTY_ROLES = ["BUYER", "SELLER", "CLIENT", "VENDOR", "EMPLOYER", "EMPLOYEE", "CONTRACTOR", "OWNER", "PARTNER", "GUARANTOR", "WITNESS", "SERVICE_PROVIDER", "LANDLORD", "TENANT", "OTHER"] as const;
const CLAUSE_USAGE = ["RECOMMENDED", "REQUIRED", "OPTIONAL", "RESTRICTED"] as const;

function str(formData: FormData, key: string) { return String(formData.get(key) ?? "").trim(); }
function opt(formData: FormData, key: string) { return str(formData, key) || null; }
function oneOf<T extends string>(value: string, allowed: readonly T[], fallback: T): T { return (allowed as readonly string[]).includes(value) ? (value as T) : fallback; }
function date(formData: FormData, key: string): Date | null {
  const value = str(formData, key);
  if (!value) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new ContractError("Enter dates as calendar dates.");
  return new Date(`${value}T00:00:00.000Z`);
}

/** The organization and actor always come from the authenticated session. */
async function actor() {
  const tenant = await requireModuleAccess("contracts");
  return actorFromTenant(tenant);
}

/** Runs a mutation; on a known error, stores the message in a flash cookie and returns to `back`. */
async function run(back: string, operation: () => Promise<string | void>) {
  let destination: string | void;
  try {
    destination = await operation();
  } catch (error) {
    if (error instanceof ContractError) {
      (await cookies()).set(CONTRACTS_FLASH_COOKIE, error.message.slice(0, 240), { httpOnly: true, sameSite: "strict", secure: process.env.NODE_ENV === "production", path: CONTRACTS_FLASH_PATH, maxAge: 30 });
      redirect(`${back}${back.includes("?") ? "&" : "?"}error=1`);
    }
    throw error;
  }
  revalidatePath("/app/contracts", "layout");
  const target = destination ?? back;
  redirect(`${target}${target.includes("?") ? "&" : "?"}saved=1`);
}

function contractInput(formData: FormData): ContractInput {
  const notice = str(formData, "noticePeriodDays");
  return {
    title: str(formData, "title"),
    categoryId: opt(formData, "categoryId"),
    typeId: opt(formData, "typeId"),
    branchId: opt(formData, "branchId"),
    ownerId: opt(formData, "ownerId"),
    department: opt(formData, "department"),
    counterpartyName: str(formData, "counterpartyName"),
    value: opt(formData, "value"),
    currency: str(formData, "currency"),
    taxTreatment: opt(formData, "taxTreatment"),
    startDate: date(formData, "startDate"),
    effectiveDate: date(formData, "effectiveDate"),
    expirationDate: date(formData, "expirationDate"),
    renewalDate: date(formData, "renewalDate"),
    noticePeriodDays: notice ? Number(notice) : null,
    renewalType: oneOf<ContractRenewalType>(str(formData, "renewalType"), RENEWAL_TYPES, "FIXED_TERM"),
    paymentTerms: opt(formData, "paymentTerms"),
    billingFrequency: opt(formData, "billingFrequency"),
    governingLaw: opt(formData, "governingLaw"),
    governingJurisdiction: opt(formData, "governingJurisdiction"),
    language: opt(formData, "language"),
    riskLevel: oneOf<ContractRiskLevel>(str(formData, "riskLevel"), RISK_LEVELS, "LOW"),
    confidentiality: oneOf<ContractConfidentiality>(str(formData, "confidentiality"), CONFIDENTIALITY, "STANDARD"),
    description: opt(formData, "description"),
    body: opt(formData, "body"),
    tags: str(formData, "tags").split(",").map((tag) => tag.trim()).filter(Boolean),
    notes: opt(formData, "notes"),
  };
}

function partyInput(formData: FormData, prefix = ""): PartyInput {
  return {
    role: oneOf<ContractPartyRole>(str(formData, `${prefix}role`), PARTY_ROLES, "CLIENT"),
    customRole: opt(formData, `${prefix}customRole`),
    name: str(formData, `${prefix}name`),
    legalName: opt(formData, `${prefix}legalName`),
    email: opt(formData, `${prefix}email`),
    phone: opt(formData, `${prefix}phone`),
    address: opt(formData, `${prefix}address`),
    taxId: opt(formData, `${prefix}taxId`),
    registrationNumber: opt(formData, `${prefix}registrationNumber`),
    contactId: opt(formData, `${prefix}contactId`),
    isPrimary: formData.get(`${prefix}isPrimary`) === "on",
    signatoryName: opt(formData, `${prefix}signatoryName`),
    signatoryTitle: opt(formData, `${prefix}signatoryTitle`),
  };
}

// --- Contracts ---------------------------------------------------------------

export async function createContractAction(formData: FormData) {
  const current = await actor();
  await run("/app/contracts/new", async () => {
    const counterpartyParty = str(formData, "party_name") ? [partyInput(formData, "party_")] : [];
    const contract = await createContract(current, { ...contractInput(formData), templateId: opt(formData, "templateId"), parties: counterpartyParty });
    return `/app/contracts/${contract.id}`;
  });
}

export async function updateContractAction(formData: FormData) {
  const current = await actor();
  const id = str(formData, "contractId");
  await run(`/app/contracts/${id}/edit`, async () => {
    await updateContract(current, id, contractInput(formData), opt(formData, "reason"));
    return `/app/contracts/${id}`;
  });
}

export async function changeContractStatusAction(formData: FormData) {
  const current = await actor();
  const id = str(formData, "contractId");
  const action = oneOf<ContractStatusAction>(str(formData, "action"), ["ACTIVATE", "CANCEL", "MARK_EXPIRED", "ARCHIVE", "RESTORE"], "ACTIVATE");
  await run(`/app/contracts/${id}`, async () => {
    await changeContractStatus(current, id, action, opt(formData, "reason"));
  });
}

export async function addPartyAction(formData: FormData) {
  const current = await actor();
  const id = str(formData, "contractId");
  await run(`/app/contracts/${id}?tab=parties`, async () => { await addContractParty(current, id, partyInput(formData)); });
}

export async function removePartyAction(formData: FormData) {
  const current = await actor();
  const id = str(formData, "contractId");
  await run(`/app/contracts/${id}?tab=parties`, async () => { await removeContractParty(current, id, str(formData, "partyId")); });
}

export async function removeDocumentAction(formData: FormData) {
  const current = await actor();
  const id = str(formData, "contractId");
  await run(`/app/contracts/${id}?tab=documents`, async () => { await removeContractDocument(current, str(formData, "documentId"), str(formData, "reason")); });
}

export async function addAccessGrantAction(formData: FormData) {
  const current = await actor();
  const id = str(formData, "contractId");
  const target = str(formData, "target");
  const [kind, ...rest] = target.split(":");
  const value = rest.join(":");
  await run(`/app/contracts/${id}?tab=access`, async () => {
    await addContractAccessGrant(current, id, kind === "user" ? { userId: value } : kind === "role" ? { roleId: value } : { department: str(formData, "department") });
  });
}

export async function removeAccessGrantAction(formData: FormData) {
  const current = await actor();
  const id = str(formData, "contractId");
  await run(`/app/contracts/${id}?tab=access`, async () => { await removeContractAccessGrant(current, id, str(formData, "grantId")); });
}

export async function attachClauseAction(formData: FormData) {
  const current = await actor();
  const id = str(formData, "contractId");
  await run(`/app/contracts/${id}?tab=clauses`, async () => { await attachContractClause(current, id, str(formData, "clauseId")); });
}

export async function detachClauseAction(formData: FormData) {
  const current = await actor();
  const id = str(formData, "contractId");
  await run(`/app/contracts/${id}?tab=clauses`, async () => { await detachContractClause(current, id, str(formData, "linkId")); });
}

// --- Templates and clauses -----------------------------------------------------

export async function createTemplateAction(formData: FormData) {
  const current = await actor();
  await run("/app/contracts/templates", async () => { await createContractTemplate(current, { code: str(formData, "code"), name: str(formData, "name"), categoryId: opt(formData, "categoryId"), description: opt(formData, "description"), body: String(formData.get("body") ?? "") }); });
}

export async function createTemplateVersionAction(formData: FormData) {
  const current = await actor();
  await run("/app/contracts/templates", async () => { await createContractTemplateVersion(current, str(formData, "templateId"), { body: String(formData.get("body") ?? ""), name: opt(formData, "name") ?? undefined }); });
}

export async function setTemplateStatusAction(formData: FormData) {
  const current = await actor();
  await run("/app/contracts/templates", async () => { await setContractTemplateStatus(current, str(formData, "templateId"), str(formData, "status") === "RETIRED" ? "RETIRED" : "ACTIVE"); });
}

export async function duplicateTemplateAction(formData: FormData) {
  const current = await actor();
  await run("/app/contracts/templates", async () => { await duplicateContractTemplate(current, str(formData, "templateId"), str(formData, "code")); });
}

export async function createClauseAction(formData: FormData) {
  const current = await actor();
  await run("/app/contracts/clauses", async () => {
    await createContractClause(current, { code: str(formData, "code"), name: str(formData, "name"), category: str(formData, "category"), body: String(formData.get("body") ?? ""), jurisdiction: opt(formData, "jurisdiction"), language: opt(formData, "language"), usage: oneOf(str(formData, "usage"), CLAUSE_USAGE, "OPTIONAL"), effectiveFrom: date(formData, "effectiveFrom") });
  });
}

export async function createClauseVersionAction(formData: FormData) {
  const current = await actor();
  await run("/app/contracts/clauses", async () => { await createContractClauseVersion(current, str(formData, "clauseId"), { body: String(formData.get("body") ?? ""), usage: oneOf(str(formData, "usage"), CLAUSE_USAGE, "OPTIONAL") }); });
}

export async function setClauseStatusAction(formData: FormData) {
  const current = await actor();
  await run("/app/contracts/clauses", async () => { await setContractClauseStatus(current, str(formData, "clauseId"), str(formData, "status") === "RETIRED" ? "RETIRED" : "APPROVED"); });
}

// --- Settings --------------------------------------------------------------------

export async function updateContractSettingsAction(formData: FormData) {
  const current = await actor();
  await run("/app/contracts/settings", async () => {
    await updateContractSettings(current, {
      numberFormat: str(formData, "numberFormat"),
      numberPrefix: str(formData, "numberPrefix"),
      resetSequenceYearly: formData.get("resetSequenceYearly") === "on",
      expiryAlertDays: str(formData, "expiryAlertDays").split(",").map((value) => Number(value.trim())).filter((value) => Number.isFinite(value)),
      confidentialAdminAccess: formData.get("confidentialAdminAccess") === "on",
    });
  });
}

export async function createCategoryAction(formData: FormData) {
  const current = await actor();
  await run("/app/contracts/settings", async () => { await createContractCategory(current, { code: str(formData, "code"), name: str(formData, "name") }); });
}

export async function createTypeAction(formData: FormData) {
  const current = await actor();
  await run("/app/contracts/settings", async () => { await createContractType(current, { code: str(formData, "code"), name: str(formData, "name"), categoryId: opt(formData, "categoryId") }); });
}
