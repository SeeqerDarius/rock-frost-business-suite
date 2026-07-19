import { AppShell } from "@/components/layout/app-shell";
import { workspaceNavigation } from "@/platform/modules/workspace-navigation";

export default function OverviewLayout({ children }: { children: React.ReactNode }) {
  return (
    <AppShell sectionLabel="Workspace" navigation={workspaceNavigation}>
      {children}
    </AppShell>
  );
}
