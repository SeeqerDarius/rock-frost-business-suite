"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requirePermission, PERMISSIONS } from "@/lib/permissions";
import { getServerAuthSession } from "@/lib/auth/session";
import { logAuditEvent } from "@/lib/audit";
import { generateCustomerCode } from "../ids";

function clean(value: FormDataEntryValue | null) {
  return String(value ?? "").trim();
}

async function resolveStaffId(tenant: { organizationId: string; role: string | null }, userId: string, formStaffId: string) {
  const isManagerTier = tenant.role === "Hire Purchase Manager" || tenant.role === "Organization Owner" || tenant.role === "Super Admin";

  if (isManagerTier) {
    if (!formStaffId) throw new Error("Please assign a staff member.");
    return formStaffId;
  }

  const ownStaff = await db.hirePurchaseStaff.findFirst({ where: { organizationId: tenant.organizationId, userId } });
  if (!ownStaff) throw new Error("Your account is not linked to a Hire Purchase staff profile.");
  return ownStaff.id;
}

export async function createCustomer(formData: FormData): Promise<void> {
  const tenant = await requirePermission(PERMISSIONS.HIREPURCHASE_CUSTOMERS_MANAGE);
  const session = await getServerAuthSession();
  const userId = session?.user?.id;
  if (!userId) redirect("/login");

  const fullName = clean(formData.get("fullName"));
  const phone = clean(formData.get("phone"));
  const address = clean(formData.get("address"));
  const nationalId = clean(formData.get("nationalId"));
  const formStaffId = clean(formData.get("staffId"));

  if (!fullName) {
    redirect("/hire-purchase/customers/new?error=name-required");
  }

  let staffId: string;
  try {
    staffId = await resolveStaffId(tenant, userId, formStaffId);
  } catch (error) {
    redirect(`/hire-purchase/customers/new?error=${encodeURIComponent(error instanceof Error ? error.message : "staff-required")}`);
  }

  const customerCode = await generateCustomerCode(tenant.organizationId, staffId);

  const customer = await db.hirePurchaseCustomer.create({
    data: {
      organizationId: tenant.organizationId,
      customerCode,
      fullName,
      phone: phone || null,
      address: address || null,
      nationalId: nationalId || null,
      staffId,
    },
  });

  await logAuditEvent({
    organizationId: tenant.organizationId,
    userId,
    action: "CREATE_CUSTOMER",
    entityName: "HirePurchaseCustomer",
    entityId: customer.id,
    changes: { customerCode, fullName, staffId },
  });

  revalidatePath("/hire-purchase/customers");
  redirect(`/hire-purchase/customers/${customer.id}`);
}

export async function updateCustomer(formData: FormData): Promise<void> {
  const tenant = await requirePermission(PERMISSIONS.HIREPURCHASE_CUSTOMERS_MANAGE);
  const session = await getServerAuthSession();
  const userId = session?.user?.id;

  const id = clean(formData.get("id"));
  const existing = await db.hirePurchaseCustomer.findFirst({ where: { id, organizationId: tenant.organizationId } });
  if (!existing) redirect("/hire-purchase/customers?error=customer-not-found");

  const updated = await db.hirePurchaseCustomer.update({
    where: { id },
    data: {
      fullName: clean(formData.get("fullName")),
      phone: clean(formData.get("phone")) || null,
      address: clean(formData.get("address")) || null,
      nationalId: clean(formData.get("nationalId")) || null,
    },
  });

  await logAuditEvent({
    organizationId: tenant.organizationId,
    userId,
    action: "UPDATE_CUSTOMER",
    entityName: "HirePurchaseCustomer",
    entityId: id,
    changes: { before: existing, after: updated },
  });

  revalidatePath("/hire-purchase/customers");
  revalidatePath(`/hire-purchase/customers/${id}`);
  redirect(`/hire-purchase/customers/${id}`);
}

export async function deleteCustomer(formData: FormData): Promise<void> {
  const tenant = await requirePermission(PERMISSIONS.HIREPURCHASE_CUSTOMERS_MANAGE);
  const session = await getServerAuthSession();
  const userId = session?.user?.id;

  const id = clean(formData.get("id"));
  const customer = await db.hirePurchaseCustomer.findFirst({
    where: { id, organizationId: tenant.organizationId },
    include: { _count: { select: { accounts: true } } },
  });

  if (!customer) redirect("/hire-purchase/customers?error=customer-not-found");
  if (customer._count.accounts > 0) {
    redirect(`/hire-purchase/customers/${id}?error=customer-has-accounts`);
  }

  await db.hirePurchaseCustomer.delete({ where: { id } });

  await logAuditEvent({
    organizationId: tenant.organizationId,
    userId,
    action: "DELETE_CUSTOMER",
    entityName: "HirePurchaseCustomer",
    entityId: id,
    changes: { deleted: customer },
  });

  revalidatePath("/hire-purchase/customers");
  redirect("/hire-purchase/customers?deleted=customer");
}
