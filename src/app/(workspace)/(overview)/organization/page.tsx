import { Building2 } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/feedback/empty-state";

export default function OrganizationSettingsPage() {
  return (
    <div className="space-y-6">
      <PageHeader title="Organization" description="Organization profile, branches, and membership." />
      <EmptyState
        icon={Building2}
        title="Organization management is not built yet"
        description="Organization profile, branch management, and member administration will be implemented alongside authentication."
      />
    </div>
  );
}
