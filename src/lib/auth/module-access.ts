import "server-only";

import { redirect } from "next/navigation";
import { getCurrentTenant, type TenantContext } from "@/lib/tenant";
import { canAccessModule, isPlatformOperator } from "@/lib/auth/permissions";
import type { BusinessModuleKey } from "@/platform/modules/registry";

/**
 * Revalidates tenant, module enablement, and the user's module permission at
 * the sensitive page/action boundary. Layout checks remain useful for the
 * shell UI, but cannot be the authorization boundary because layouts may be
 * reused during client navigation.
 */
export async function requireModuleAccess(moduleKey: BusinessModuleKey): Promise<TenantContext> {
  const tenant = await getCurrentTenant();
  // Nested layouts/pages can render in parallel. Redirect instead of throwing
  // when the parent app layout has already identified an account without a
  // workspace, so direct module URLs never become noisy 500 responses.
  if (!tenant) redirect("/app/dashboard?error=no-organization-access");
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
  const tenant = await getCurrentTenant();
  if (!tenant) redirect("/app/dashboard?error=no-organization-access");
  if (!isPlatformOperator(tenant)) {
    redirect("/app/dashboard?error=forbidden");
  }
  return tenant;
}
