import { redirect } from "next/navigation";
import { requireModuleAccess } from "@/lib/auth/module-access";

/** Configuration moved into HR Settings as a tab. This stub keeps the old
 * URL working for anyone with it bookmarked or linked. */
export default async function HrConfigurationPage() {
  await requireModuleAccess("hr");
  redirect("/app/hr/settings");
}
