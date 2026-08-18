import { Boxes, GraduationCap, PackageSearch, ShoppingCart, Truck } from "lucide-react";
import { Card } from "@/components/Card";
import { cn } from "@/lib/utils";
import type { OfflineModuleKey } from "@/contract/sync-contract";

interface ModuleMeta {
  key: OfflineModuleKey;
  label: string;
  description: string;
  Icon: typeof Truck;
}

const MODULES: ModuleMeta[] = [
  { key: "fleet", label: "Fleet", description: "Maintenance reports, inspections, trips, and driver payments.", Icon: Truck },
  { key: "installment", label: "Installment", description: "Collection entries and payment receipts.", Icon: PackageSearch },
  { key: "pos", label: "Point of Sale", description: "Offline sales and receipts.", Icon: ShoppingCart },
  { key: "inventory", label: "Inventory", description: "Stock counts and stock movements.", Icon: Boxes },
  { key: "school", label: "School", description: "Campuses, academic years, and terms.", Icon: GraduationCap },
];

interface ModuleLauncherProps {
  enabledModuleKeys: OfflineModuleKey[];
  onSelect: (moduleKey: OfflineModuleKey) => void;
  selected: OfflineModuleKey | null;
}

export function ModuleLauncher({ enabledModuleKeys, onSelect, selected }: ModuleLauncherProps) {
  const available = MODULES.filter((m) => enabledModuleKeys.includes(m.key));

  if (available.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No offline modules are enabled for your organization on this account.
      </p>
    );
  }

  return (
    <nav aria-label="Modules" className="grid gap-3.5 [grid-template-columns:repeat(auto-fill,minmax(15rem,1fr))]">
      {available.map((module) => {
        const isSelected = module.key === selected;
        return (
          <button
            key={module.key}
            type="button"
            onClick={() => onSelect(module.key)}
            aria-current={isSelected ? "true" : undefined}
            className="cursor-pointer text-left"
          >
            <Card className={cn("flex items-start gap-3", isSelected && "ring-2 ring-primary ring-offset-0")}>
              <div className="flex size-9 shrink-0 items-center justify-center rounded-md bg-primary/15">
                <module.Icon size={18} className="text-primary" aria-hidden="true" />
              </div>
              <div>
                <p className="m-0 text-[0.9375rem] font-bold">{module.label}</p>
                <p className="mt-0.5 mb-0 text-[0.8125rem] text-muted-foreground">{module.description}</p>
              </div>
            </Card>
          </button>
        );
      })}
    </nav>
  );
}

export { MODULES };
