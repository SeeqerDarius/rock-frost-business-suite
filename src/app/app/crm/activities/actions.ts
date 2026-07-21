"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireCurrentTenant } from "@/lib/tenant";
import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import { getServerAuthSession } from "@/lib/auth/session";
import { createActivity, NotFoundError } from "@/modules/crm/service";
import type { CrmActivityType } from "@prisma/client";

function clean(value: FormDataEntryValue | null) {
  const str = String(value ?? "").trim();
  return str.length > 0 ? str : null;
}

const CAN_LOG_ACTIVITY = [PERMISSIONS.CRM_CONTACTS_MANAGE, PERMISSIONS.CRM_LEADS_MANAGE, PERMISSIONS.CRM_DEALS_MANAGE];

export async function logActivity(formData: FormData): Promise<void> {
  const tenant = await requireCurrentTenant();
  if (!CAN_LOG_ACTIVITY.some((permission) => hasPermission(tenant, permission))) {
    redirect("/app/crm/activities?error=forbidden");
  }

  const type = clean(formData.get("type")) as CrmActivityType | null;
  const subject = clean(formData.get("subject"));
  const occurredAtRaw = clean(formData.get("occurredAt"));
  const relatedTo = clean(formData.get("relatedTo")); // "contact:<id>" | "lead:<id>" | "deal:<id>" | null

  if (!type || !subject || !occurredAtRaw) {
    redirect("/app/crm/activities?error=missing-fields");
  }

  const [relatedKind, relatedId] = relatedTo?.split(":") ?? [];

  const session = await getServerAuthSession();

  try {
    await createActivity(tenant.organizationId, {
      type,
      subject,
      notes: clean(formData.get("notes")),
      occurredAt: new Date(`${occurredAtRaw}T00:00:00`),
      contactId: relatedKind === "contact" ? relatedId : null,
      leadId: relatedKind === "lead" ? relatedId : null,
      dealId: relatedKind === "deal" ? relatedId : null,
      createdById: session?.user?.id ?? null,
    });
  } catch (error) {
    if (error instanceof NotFoundError) redirect("/app/crm/activities?error=not-found");
    throw error;
  }

  revalidatePath("/app/crm/activities");
  redirect("/app/crm/activities?saved=1");
}
