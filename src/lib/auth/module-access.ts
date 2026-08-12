import "server-only";

import { redirect } from "next/navigation";
import { requireCurrentTenant, type TenantContext } from "@/lib/tenant";
import { canAccessModule, isPlatformOperator } from "@/lib/auth/permissions";
import type { BusinessModuleKey } from "@/platform/modules/registry";

/**
 * Revalidates tenant, module enablement, and the user's module permission at
 * the sensitive page/action boundary. Layout checks remain useful for the
 * shell UI, but cannot be the authorization boundary because layouts may be
 * reused during client navigation.
 */
export async function requireModuleAccess(moduleKey: BusinessModuleKey): Promise<TenantContext> {
  const tenant = await requireCurrentTenant().catch((error: unknown) => {
    if (error instanceof Error && error.message === "No organization membership found for the current user.") {
      redirect("/app/dashboard?error=no-organization-access");
    }
    throw error;
  });
  if (isPlatformOperator(tenant)) {
    redirect("/app/platform/dashboard");
  }
  if (!canAccessModule(tenant, moduleKey)) {
    redirect("/app/modules?error=module-unavailable");
  }
  return tenant;
}

/** Revalidates the Rock Frost operator role before any platform-wide read. */
export async function requirePlatformOperator(): Promise<TenantContext> {
  const tenant = await requireCurrentTenant().catch((error: unknown) => {
    if (error instanceof Error && error.message === "No organization membership found for the current user.") {
      redirect("/app/dashboard?error=no-organization-access");
    }
    throw error;
  });
  if (!isPlatformOperator(tenant)) {
    redirect("/app/dashboard?error=forbidden");
  }
  return tenant;
}
