"use server";

import { z } from "zod";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireModuleAccess } from "@/lib/auth/module-access";
import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import { setCompensation, NotFoundError, InvalidCompensationError } from "@/modules/payroll/service";
import { createEmployee } from "@/modules/hr/service";
import { moneyAmount, cuid, dateInput, email, parseWithSchema } from "@/lib/validation";

function clean(value: FormDataEntryValue | null) {
  const str = String(value ?? "").trim();
  return str.length > 0 ? str : null;
}

const PAY_FREQUENCIES = ["MONTHLY", "BIWEEKLY", "WEEKLY"] as const;

const compensationSchema = z.object({
  employeeId: cuid,
  baseSalary: moneyAmount,
  payFrequency: z.enum(PAY_FREQUENCIES).optional(),
  effectiveDate: dateInput,
});

const payrollEmployeeSchema = z.object({
  fullName: z.string().trim().min(2).max(160),
  email: email.nullable(),
  phone: z.string().trim().max(40).nullable(),
  jobTitle: z.string().trim().max(120).nullable(),
  department: z.string().trim().max(120).nullable(),
  hireDate: dateInput,
});

export async function createPayrollEmployee(formData: FormData): Promise<void> {
  const tenant = await requireModuleAccess("payroll");
  if (!hasPermission(tenant, PERMISSIONS.PAYROLL_COMPENSATION_MANAGE)) {
    redirect("/app/payroll/compensation?error=forbidden");
  }

  const parsed = parseWithSchema(payrollEmployeeSchema, {
    fullName: clean(formData.get("fullName")),
    email: clean(formData.get("email")),
    phone: clean(formData.get("phone")),
    jobTitle: clean(formData.get("jobTitle")),
    department: clean(formData.get("department")),
    hireDate: clean(formData.get("hireDate")),
  });
  if (!parsed.success) redirect("/app/payroll/compensation?error=invalid-employee");

  await createEmployee(tenant.organizationId, parsed.data);
  revalidatePath("/app/payroll/compensation");
  redirect("/app/payroll/compensation?employeeCreated=1");
}

export async function saveCompensation(formData: FormData): Promise<void> {
  const tenant = await requireModuleAccess("payroll");
  if (!hasPermission(tenant, PERMISSIONS.PAYROLL_COMPENSATION_MANAGE)) {
    redirect("/app/payroll/compensation?error=forbidden");
  }

  const parsed = parseWithSchema(compensationSchema, {
    employeeId: clean(formData.get("employeeId")),
    baseSalary: clean(formData.get("baseSalary")),
    payFrequency: clean(formData.get("payFrequency")),
    effectiveDate: clean(formData.get("effectiveDate")),
  });
  if (!parsed.success) {
    redirect("/app/payroll/compensation?error=missing-fields");
  }
  const { employeeId, baseSalary, payFrequency, effectiveDate } = parsed.data;

  try {
    await setCompensation(tenant.organizationId, {
      employeeId,
      baseSalary,
      payFrequency: payFrequency ?? "MONTHLY",
      effectiveDate,
    });
  } catch (error) {
    if (error instanceof NotFoundError) redirect("/app/payroll/compensation?error=not-found");
    if (error instanceof InvalidCompensationError) redirect("/app/payroll/compensation?error=invalid-salary");
    throw error;
  }

  revalidatePath("/app/payroll/compensation");
  redirect("/app/payroll/compensation?saved=1");
}
