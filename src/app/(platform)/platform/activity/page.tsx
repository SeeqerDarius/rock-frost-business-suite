import { Activity } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/feedback/empty-state";

export default function PlatformActivityPage() {
  return (
    <div className="space-y-6">
      <PageHeader title="System activity" description="Platform-wide audit trail and service health." />
      <EmptyState icon={Activity} title="Not built yet" description="Platform audit logging and service status indicators are a future roadmap phase." />
    </div>
  );
}
