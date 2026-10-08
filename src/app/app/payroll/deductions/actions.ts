"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireModuleAccess } from "@/lib/auth/module-access";
import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import {
  applyUsFederalTemplate,
  confirmDeductionRule,
  createDeductionRule,
  PayrollDeductionError,
  setDeductionMode,
  setDeductionRuleActive,
  updateDeductionRule,
  type RuleWriteInput,
} from "@/modules/payroll/deduction-rules";
import { bracketsFromText } from "@/modules/payroll/statutory";
import { PAYROLL_FLASH_COOKIE } from "@/modules/payroll/flash";

const PATH = "/app/payroll/deductions";
const KINDS = ["EMPLOYEE_WITHHOLDING", "EMPLOYEE_CONTRIBUTION", "EMPLOYER_CONTRIBUTION"] as const;
const METHODS = ["PERCENTAGE", "BRACKETS"] as const;

function value(formData: FormData, key: string) { return String(formData.get(key) ?? "").trim(); }
function optional(formData: FormData, key: string) { return value(formData, key) || null; }

/** Every action resolves the organization from the session and requires Payroll settings permission. */
async function authorize() {
  const tenant = await requireModuleAccess("payroll");
  if (!hasPermission(tenant, PERMISSIONS.PAYROLL_SETTINGS_MANAGE)) redirect(`${PATH}?error=forbidden`);
  return tenant;
}

async function run(operation: () => Promise<unknown>, year?: string) {
  const suffix = year && /^\d{4}$/.test(year) ? `&year=${year}` : "";
  try {
    await operation();
  } catch (error) {
    if (error instanceof PayrollDeductionError || error instanceof z.ZodError) {
      const message = error instanceof z.ZodError ? "Check the highlighted fields and try again." : error.message;
      (await cookies()).set(PAYROLL_FLASH_COOKIE, message.slice(0, 300), { httpOnly: true, sameSite: "strict", secure: process.env.NODE_ENV === "production", path: "/app/payroll", maxAge: 30 });
      redirect(`${PATH}?error=1${suffix}`);
    }
    throw error;
  }
  revalidatePath(PATH);
  redirect(`${PATH}?saved=1${suffix}`);
}

function ruleFromForm(formData: FormData): RuleWriteInput {
  const method = z.enum(METHODS).parse(value(formData, "method"));
  const bracketText = value(formData, "brackets");
  return {
    code: value(formData, "code"),
    name: value(formData, "name"),
    kind: z.enum(KINDS).parse(value(formData, "kind")),
    method,
    taxYear: Number(value(formData, "taxYear")),
    rate: optional(formData, "rate"),
    brackets: method === "BRACKETS" && bracketText ? bracketsFromText(bracketText) : null,
    annualAllowance: optional(formData, "annualAllowance"),
    wageBase: optional(formData, "wageBase"),
    wageFloor: optional(formData, "wageFloor"),
    filingStatus: optional(formData, "filingStatus"),
    liabilityAccountCode: value(formData, "liabilityAccountCode"),
    expenseAccountCode: optional(formData, "expenseAccountCode"),
    sourceReference: optional(formData, "sourceReference"),
    sortOrder: Number(value(formData, "sortOrder") || "0") || 0,
  };
}

export async function saveDeductionRuleAction(formData: FormData) {
  const tenant = await authorize();
  const ruleId = optional(formData, "ruleId");
  await run(() => (ruleId ? updateDeductionRule(tenant.organizationId, tenant.userId, ruleId, ruleFromForm(formData)) : createDeductionRule(tenant.organizationId, tenant.userId, ruleFromForm(formData))), value(formData, "taxYear"));
}

export async function confirmDeductionRuleAction(formData: FormData) {
  const tenant = await authorize();
  await run(() => confirmDeductionRule(tenant.organizationId, tenant.userId, value(formData, "ruleId"), formData.get("attested") === "on"), value(formData, "taxYear"));
}

export async function toggleDeductionRuleAction(formData: FormData) {
  const tenant = await authorize();
  await run(() => setDeductionRuleActive(tenant.organizationId, tenant.userId, value(formData, "ruleId"), formData.get("active") === "true"), value(formData, "taxYear"));
}

export async function applyUsTemplateAction(formData: FormData) {
  const tenant = await authorize();
  await run(() => applyUsFederalTemplate(tenant.organizationId, tenant.userId, Number(value(formData, "taxYear"))), value(formData, "taxYear"));
}

export async function setDeductionModeAction(formData: FormData) {
  const tenant = await authorize();
  await run(() => setDeductionMode(tenant.organizationId, tenant.userId, z.enum(["FLAT_RATE", "RULES"]).parse(value(formData, "mode"))));
}
