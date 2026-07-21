import { CreditCard } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/feedback/empty-state";

export default function PlatformSubscriptionsPage() {
  return (
    <div className="space-y-6">
      <PageHeader title="Subscriptions" description="Billing plans and subscription status across all organizations." />
      <EmptyState
        icon={CreditCard}
        title="Planned — requirements not yet defined"
        description="Billing and subscriptions were never part of this project's implemented scope. No pricing tiers, checkout, usage metering, or payment-provider integration exist yet, and none are planned until requirements are defined."
      />
    </div>
  );
}
