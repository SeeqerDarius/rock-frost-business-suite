import { DashboardShell } from "@/components/dashboard/DashboardShell";
import { requirePermission, PERMISSIONS } from "@/lib/permissions";
import { AssistantChat } from "./AssistantChat";

export default async function AssistantPage() {
  await requirePermission(PERMISSIONS.AI_ASSISTANT_USE);

  return (
    <DashboardShell
      title="AI Assistant"
      subtitle="Ask questions about fleet operations and how to use the platform."
    >
      <AssistantChat />
    </DashboardShell>
  );
}
