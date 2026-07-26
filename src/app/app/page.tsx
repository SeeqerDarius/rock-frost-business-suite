import { redirect } from "next/navigation";
import { requireCurrentTenant } from "@/lib/tenant";
import { isPlatformOperator } from "@/lib/auth/permissions";

export default async function AppIndexPage() {
  const tenant = await requireCurrentTenant();
  redirect(isPlatformOperator(tenant) ? "/app/platform/dashboard" : "/app/dashboard");
}
