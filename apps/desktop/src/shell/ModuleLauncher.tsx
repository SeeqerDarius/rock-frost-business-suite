import { useState } from "react";
import { Boxes, GraduationCap, Grid3x3, PackageSearch, ShoppingCart, Truck } from "lucide-react";
import { Button } from "@/components/Button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
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

/** Header dialog for switching between modules, mirroring the web app's src/components/navigation/module-launcher.tsx. */
export function ModuleLauncher({ enabledModuleKeys, onSelect, selected }: ModuleLauncherProps) {
  const [open, setOpen] = useState(false);
  const available = MODULES.filter((m) => enabledModuleKeys.includes(m.key));

  if (available.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No offline modules are enabled for your organization on this account.
      </p>
    );
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button variant="ghost" size="icon" aria-label="Switch module" onClick={() => setOpen(true)}>
        <Grid3x3 className="size-4" aria-hidden="true" />
      </Button>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Modules</DialogTitle>
          <DialogDescription>Switch to any module enabled for your organization on this device.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-2 sm:grid-cols-2">
          {MODULES.map((module) => {
            const isEnabled = available.some((m) => m.key === module.key);
            const isSelected = module.key === selected;

            if (isEnabled) {
              return (
                <button
                  key={module.key}
                  type="button"
                  onClick={() => {
                    onSelect(module.key);
                    setOpen(false);
                  }}
                  aria-current={isSelected ? "true" : undefined}
                  className="flex items-start gap-3 rounded-lg border p-3 text-left transition-colors hover:bg-secondary/50 aria-[current=true]:border-primary aria-[current=true]:ring-1 aria-[current=true]:ring-primary"
                >
                  <div className="flex size-9 shrink-0 items-center justify-center rounded-md bg-primary/15">
                    <module.Icon size={18} className="text-primary" aria-hidden="true" />
                  </div>
                  <div>
                    <p className="m-0 text-sm font-medium">{module.label}</p>
                    <p className="m-0 text-xs text-muted-foreground">{module.description}</p>
                  </div>
                </button>
              );
            }

            return (
              <div key={module.key} className="flex items-start gap-3 rounded-lg border border-dashed p-3 text-left opacity-60">
                <div className="flex size-9 shrink-0 items-center justify-center rounded-md bg-muted">
                  <module.Icon size={18} className="text-muted-foreground" aria-hidden="true" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <p className="m-0 text-sm font-medium">{module.label}</p>
                    <Badge variant="outline" className="text-[10px]">Not enabled</Badge>
                  </div>
                  <p className="m-0 text-xs text-muted-foreground">{module.description}</p>
                </div>
              </div>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
}

export { MODULES };
