import { AccountingModuleShowcase } from "@/components/marketing/module-showcases/accounting";
import { AnalyticsModuleShowcase } from "@/components/marketing/module-showcases/analytics";
import { CrmModuleShowcase } from "@/components/marketing/module-showcases/crm";
import { FleetModuleShowcase } from "@/components/marketing/module-showcases/fleet";
import { HostelModuleShowcase } from "@/components/marketing/module-showcases/hostel";
import { HotelModuleShowcase } from "@/components/marketing/module-showcases/hotel";
import { HospitalModuleShowcase } from "@/components/marketing/module-showcases/hospital";
import { HrModuleShowcase } from "@/components/marketing/module-showcases/hr";
import { InstallmentModuleShowcase } from "@/components/marketing/module-showcases/installment";
import { InventoryModuleShowcase } from "@/components/marketing/module-showcases/inventory";
import { PayrollModuleShowcase } from "@/components/marketing/module-showcases/payroll";
import { PharmacyModuleShowcase } from "@/components/marketing/module-showcases/pharmacy";
import { PosModuleShowcase } from "@/components/marketing/module-showcases/pos";
import { ProcurementModuleShowcase } from "@/components/marketing/module-showcases/procurement";
import { ProjectsModuleShowcase } from "@/components/marketing/module-showcases/projects";
import { SchoolModuleShowcase } from "@/components/marketing/module-showcases/school";

export const MODULE_SHOWCASES: Partial<Record<string, React.ComponentType>> = {
  fleet: FleetModuleShowcase,
  installment: InstallmentModuleShowcase,
  crm: CrmModuleShowcase,
  inventory: InventoryModuleShowcase,
  accounting: AccountingModuleShowcase,
  hr: HrModuleShowcase,
  payroll: PayrollModuleShowcase,
  procurement: ProcurementModuleShowcase,
  projects: ProjectsModuleShowcase,
  analytics: AnalyticsModuleShowcase,
  pos: PosModuleShowcase,
  hotel: HotelModuleShowcase,
  hostel: HostelModuleShowcase,
  school: SchoolModuleShowcase,
  pharmacy: PharmacyModuleShowcase,
  hospital: HospitalModuleShowcase,
};

/** Renders an illustrative in-app preview for modules that have one configured; otherwise renders nothing. */
export function ModuleShowcase({ moduleKey }: { moduleKey: string }) {
  const Showcase = MODULE_SHOWCASES[moduleKey];
  if (!Showcase) return null;
  return (
    <div className="mx-auto max-w-6xl px-6 py-20">
      <Showcase />
    </div>
  );
}
