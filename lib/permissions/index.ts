import "server-only";

import { redirect } from "next/navigation";
import { requireCurrentTenant, type TenantContext } from "@/lib/tenant";
import { PERMISSIONS, type PermissionKey } from "./constants";

export { PERMISSIONS, type PermissionKey };

export function hasPermission(tenant: Pick<TenantContext, "permissions"> | null, key: PermissionKey): boolean {
  return Boolean(tenant?.permissions.includes(key));
}

/**
 * Resolves the current tenant and redirects to /dashboard if the user lacks
 * the given permission. Use in a page/layout to guard an entire route.
 */
export async function requirePermission(key: PermissionKey): Promise<TenantContext> {
  const tenant = await requireCurrentTenant();
  if (!hasPermission(tenant, key)) {
    redirect("/dashboard");
  }
  return tenant;
}
