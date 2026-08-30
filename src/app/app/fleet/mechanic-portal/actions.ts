"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireModuleAccess } from "@/lib/auth/module-access";
import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import { getServerAuthSession } from "@/lib/auth/session";
import { acceptMaintenanceAssignment, NotFoundError } from "@/modules/fleet/service";

function clean(value: FormDataEntryValue | null) {
  const str = String(value ?? "").trim();
  return str.length > 0 ? str : null;
}

export async function scheduleAssignedRepair(formData: FormData): Promise<void> {
  const tenant = await requireModuleAccess("fleet");
  if (!hasPermission(tenant, PERMISSIONS.FLEET_MECHANIC_SELF_SERVICE)) {
    redirect("/app/fleet/mechanic-portal?error=forbidden");
  }
  const session = await getServerAuthSession();
  if (!session?.user?.id) redirect("/login");

  const id = clean(formData.get("id"));
  const scheduledRepairAtRaw = clean(formData.get("scheduledRepairAt"));
  if (!id || !scheduledRepairAtRaw) redirect("/app/fleet/mechanic-portal?error=missing-fields");

  const scheduledRepairAt = new Date(scheduledRepairAtRaw);
  if (Number.isNaN(scheduledRepairAt.getTime())) redirect("/app/fleet/mechanic-portal?error=invalid-input");

  try {
    await acceptMaintenanceAssignment(tenant.organizationId, id, session.user.id, scheduledRepairAt);
  } catch (error) {
    if (error instanceof NotFoundError) redirect("/app/fleet/mechanic-portal?error=not-found");
    throw error;
  }

  revalidatePath("/app/fleet/mechanic-portal");
  redirect("/app/fleet/mechanic-portal?saved=1");
}
