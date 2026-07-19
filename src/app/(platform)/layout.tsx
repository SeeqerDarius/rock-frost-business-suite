import { AppShell } from "@/components/layout/app-shell";
import { platformNavigation } from "@/platform/modules/platform-navigation";

export default function PlatformLayout({ children }: { children: React.ReactNode }) {
  return (
    <AppShell sectionLabel="Platform Administration" navigation={platformNavigation}>
      {children}
    </AppShell>
  );
}
