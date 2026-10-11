import { PowerOff } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/feedback/empty-state";

/** Shown when a platform operator has switched an included School capability off for this organization. Existing records are kept. */
export function SwitchedOffNotice({ title }: { title: string }) {
  return (
    <div className="mx-auto max-w-screen-xl space-y-6">
      <PageHeader title={title} />
      <EmptyState icon={PowerOff} title={`${title} is switched off`} description="This part of School is switched off for your organization. Existing records are kept and return if it is switched back on. Contact Rock Frost if you need it." />
    </div>
  );
}
