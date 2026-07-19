import { AppShell } from "@/components/layout/app-shell";
import { fleetNavigation } from "@/modules/fleet/navigation";

export default function FleetLayout({ children }: { children: React.ReactNode }) {
  return (
    <AppShell sectionLabel="Fleet Management" navigation={fleetNavigation}>
      {children}
    </AppShell>
  );
}
