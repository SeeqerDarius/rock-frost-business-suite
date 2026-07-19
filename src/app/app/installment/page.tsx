import { Wallet } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/feedback/empty-state";

export default function InstallmentOverviewPage() {
  return (
    <div className="space-y-6">
      <PageHeader title="Installment Overview" description="Customer accounts, collections, and product performance at a glance." />
      <EmptyState
        icon={Wallet}
        title="Installment Management is not built yet"
        description="This module shell is in place. Customers, products, customer accounts, payments, collections, staff, and reports will be implemented in the Installment module migration phase, using validated business rules from the reference GLV system."
      />
    </div>
  );
}
