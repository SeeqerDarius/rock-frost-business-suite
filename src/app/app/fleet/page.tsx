import { Truck } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/feedback/empty-state";

export default function FleetOverviewPage() {
  return (
    <div className="space-y-6">
      <PageHeader title="Fleet Overview" description="Vehicles, drivers, owners, and maintenance at a glance." />
      <EmptyState
        icon={Truck}
        title="Fleet Management is not built yet"
        description="This module shell is in place. Vehicles, drivers, owners, maintenance, insurance, payments, and reports will be implemented in the Fleet module phase."
      />
    </div>
  );
}
