import { AppShell } from "@/components/layout/app-shell";
import { installmentNavigation } from "@/modules/installment/navigation";

export default function InstallmentLayout({ children }: { children: React.ReactNode }) {
  return (
    <AppShell sectionLabel="Installment Management" navigation={installmentNavigation}>
      {children}
    </AppShell>
  );
}
