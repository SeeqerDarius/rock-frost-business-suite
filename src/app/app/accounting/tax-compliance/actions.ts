"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { TAX_FLASH_COOKIE } from "@/modules/tax/flash";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireModuleAccess } from "@/lib/auth/module-access";
import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import {
  createJurisdiction,
  createTaxCategory,
  createTaxExemption,
  createTaxRate,
  createTaxRateVersion,
  createTaxRule,
  provisionJurisdictionPack,
  setTaxRuleActive,
  TaxConfigurationError,
  upsertTaxRegistration,
} from "@/modules/tax/service";

const PATH = "/app/accounting/tax-compliance";

function value(formData: FormData, key: string) { return String(formData.get(key) ?? "").trim(); }
function optional(formData: FormData, key: string) { return value(formData, key) || null; }

/** Every action resolves the organization from the session and requires settings permission. */
async function authorize() {
  const tenant = await requireModuleAccess("accounting");
  if (!hasPermission(tenant, PERMISSIONS.ACCOUNTING_SETTINGS_MANAGE)) redirect(`${PATH}?error=forbidden`);
  return tenant;
}

async function run(section: string, operation: () => Promise<unknown>) {
  try {
    await operation();
  } catch (error) {
    if (error instanceof TaxConfigurationError || error instanceof z.ZodError) {
      const message = error instanceof z.ZodError ? "Check the highlighted fields and try again." : error.message;
      (await cookies()).set(TAX_FLASH_COOKIE, message.slice(0, 240), { httpOnly: true, sameSite: "strict", secure: process.env.NODE_ENV === "production", path: PATH, maxAge: 30 });
      redirect(`${PATH}?section=${section}&error=1`);
    }
    throw error;
  }
  revalidatePath(PATH);
  redirect(`${PATH}?section=${section}&saved=1`);
}

const LEVELS = ["SUPRANATIONAL", "COUNTRY", "STATE", "COUNTY", "CITY", "DISTRICT"] as const;
const KINDS = ["VAT", "GST", "SALES", "USE", "LEVY", "EXCISE", "WITHHOLDING", "PAYROLL", "INCOME", "OTHER"] as const;
const TREATMENTS = ["STANDARD", "REDUCED", "ZERO_RATED", "EXEMPT", "REVERSE_CHARGE", "OUT_OF_SCOPE"] as const;
const STATUSES = ["NOT_REGISTERED", "MONITORING", "REGISTERED", "DEREGISTERED"] as const;
const FREQUENCIES = ["MONTHLY", "QUARTERLY", "SEMI_ANNUAL", "ANNUAL"] as const;
const EXEMPTIONS = ["RESALE", "GOVERNMENT", "NON_PROFIT", "DIPLOMATIC", "EXPORT", "OTHER"] as const;
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export async function provisionPackAction(formData: FormData) {
  const tenant = await authorize();
  await run("packs", () => provisionJurisdictionPack(tenant.organizationId, value(formData, "packKey"), tenant.userId));
}

export async function createJurisdictionAction(formData: FormData) {
  const tenant = await authorize();
  await run("jurisdictions", async () => {
    const level = z.enum(LEVELS).parse(value(formData, "level"));
    return createJurisdiction(tenant.organizationId, tenant.userId, { code: value(formData, "code"), name: value(formData, "name"), level, countryCode: optional(formData, "countryCode"), parentCode: optional(formData, "parentCode") });
  });
}

export async function createCategoryAction(formData: FormData) {
  const tenant = await authorize();
  await run("categories", () => createTaxCategory(tenant.organizationId, tenant.userId, { code: value(formData, "code"), name: value(formData, "name"), description: optional(formData, "description") }));
}

export async function createRateAction(formData: FormData) {
  const tenant = await authorize();
  await run("rates", async () => createTaxRate(tenant.organizationId, tenant.userId, {
    code: value(formData, "code"), name: value(formData, "name"), jurisdictionCode: value(formData, "jurisdictionCode"), taxKind: z.enum(KINDS).parse(value(formData, "taxKind")),
    rate: value(formData, "rate"), compound: formData.get("compound") === "on", recoverable: formData.get("recoverable") === "on", effectiveFrom: date.parse(value(formData, "effectiveFrom")),
    sourceReference: optional(formData, "sourceReference"), outputAccountCode: optional(formData, "outputAccountCode"), inputAccountCode: optional(formData, "inputAccountCode"),
  }));
}

export async function createRateVersionAction(formData: FormData) {
  const tenant = await authorize();
  if (formData.get("confirm") !== "on") redirect(`${PATH}?section=rates&error=confirm`);
  await run("rates", async () => createTaxRateVersion(tenant.organizationId, tenant.userId, { code: value(formData, "code"), rate: value(formData, "rate"), effectiveFrom: date.parse(value(formData, "effectiveFrom")), sourceReference: optional(formData, "sourceReference") }));
}

export async function createRuleAction(formData: FormData) {
  const tenant = await authorize();
  await run("rules", async () => createTaxRule(tenant.organizationId, tenant.userId, {
    code: value(formData, "code"), name: value(formData, "name"), jurisdictionCode: value(formData, "jurisdictionCode"), categoryCode: optional(formData, "categoryCode"),
    treatment: z.enum(TREATMENTS).parse(value(formData, "treatment")), rateCodes: formData.getAll("rateCodes").map(String).filter(Boolean), effectiveFrom: date.parse(value(formData, "effectiveFrom")), sourceReference: optional(formData, "sourceReference"),
  }));
}

export async function toggleRuleAction(formData: FormData) {
  const tenant = await authorize();
  await run("rules", () => setTaxRuleActive(tenant.organizationId, tenant.userId, value(formData, "ruleId"), formData.get("active") === "true"));
}

export async function saveRegistrationAction(formData: FormData) {
  const tenant = await authorize();
  await run("registrations", async () => upsertTaxRegistration(tenant.organizationId, tenant.userId, {
    jurisdictionCode: value(formData, "jurisdictionCode"), registrationNumber: optional(formData, "registrationNumber"), status: z.enum(STATUSES).parse(value(formData, "status")),
    collectionEnabled: formData.get("collectionEnabled") === "on", filingFrequency: optional(formData, "filingFrequency") ? z.enum(FREQUENCIES).parse(value(formData, "filingFrequency")) : null,
    effectiveFrom: optional(formData, "effectiveFrom") ? date.parse(value(formData, "effectiveFrom")) : null, notes: optional(formData, "notes"),
  }));
}

export async function createExemptionAction(formData: FormData) {
  const tenant = await authorize();
  await run("exemptions", async () => createTaxExemption(tenant.organizationId, tenant.userId, {
    contactId: value(formData, "contactId"), jurisdictionCode: optional(formData, "jurisdictionCode"), exemptionType: z.enum(EXEMPTIONS).parse(value(formData, "exemptionType")),
    certificateNumber: optional(formData, "certificateNumber"), reason: optional(formData, "reason"), validFrom: date.parse(value(formData, "validFrom")), validTo: optional(formData, "validTo") ? date.parse(value(formData, "validTo")) : null,
  }));
}
