import { CreditCard } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/feedback/empty-state";

export default function PlatformSubscriptionsPage() {
  return (
    <div className="space-y-6">
      <PageHeader title="Subscriptions" description="Billing plans and subscription status across all organizations." />
      <EmptyState icon={CreditCard} title="Not built yet" description="Subscription and billing management is a future roadmap phase." />
    </div>
  );
}
