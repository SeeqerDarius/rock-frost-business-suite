import { User } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/feedback/empty-state";

export default function AccountPage() {
  return (
    <div className="space-y-6">
      <PageHeader title="Your profile" description="Personal account details and preferences." />
      <EmptyState icon={User} title="Not built yet" description="Profile management (name, password, notification preferences) is not scheduled yet. Check docs/DEVELOPMENT_ROADMAP.md for current priorities." />
    </div>
  );
}
