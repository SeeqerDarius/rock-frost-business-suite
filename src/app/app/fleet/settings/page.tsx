import { Settings } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/feedback/empty-state";

export default function FleetSettingsPage() {
  return (
    <div className="space-y-6">
      <PageHeader title="Fleet Settings" description="Module-wide configuration for Fleet Management." />
      <EmptyState
        icon={Settings}
        title="No fleet-wide settings yet"
        description="There's no fleet-specific configuration to manage yet. Vehicles, drivers, and owners are all configured directly on their own pages. This page is a placeholder for future settings (e.g. default maintenance approval thresholds) rather than fabricated options with nothing behind them."
      />
    </div>
  );
}
