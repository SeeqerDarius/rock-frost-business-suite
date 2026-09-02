import { requireCurrentTenant } from "@/lib/tenant";
import { OfflineSyncCenter } from "./sync-center";

export default async function OfflineAccountPage() {
  const tenant = await requireCurrentTenant();
  return <OfflineSyncCenter organizationId={tenant.organizationId} organizationName={tenant.organization.name} userId={tenant.userId} />;
}
