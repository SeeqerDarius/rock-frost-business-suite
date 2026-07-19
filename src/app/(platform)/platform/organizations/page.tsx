import { Building2 } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/feedback/empty-state";

export default function PlatformOrganizationsPage() {
  return (
    <div className="space-y-6">
      <PageHeader title="Organizations" description="Every organization using Rock Frost Business Suite." />
      <EmptyState icon={Building2} title="Not built yet" description="Organization management will be implemented alongside authentication." />
    </div>
  );
}
