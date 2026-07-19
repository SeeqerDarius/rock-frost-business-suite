import { ShieldCheck } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/feedback/empty-state";

export default function AdministrationPage() {
  return (
    <div className="space-y-6">
      <PageHeader title="Administration" description="Users, roles, permissions, and audit logs for your organization." />
      <EmptyState
        icon={ShieldCheck}
        title="Administration tools are not built yet"
        description="User management, roles and permissions, and audit logs will be implemented as part of the authentication and authorization phase."
      />
    </div>
  );
}
