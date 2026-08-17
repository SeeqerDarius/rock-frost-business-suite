import { Boxes, GraduationCap, PackageSearch, ShoppingCart, Truck } from "lucide-react";
import { Card } from "@/components/Card";
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
      <p style={{ fontSize: "0.875rem", color: "var(--rf-muted-foreground)" }}>
        No offline modules are enabled for your organization on this account.
      </p>
    );
  }

  return (
    <nav aria-label="Modules" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(15rem, 1fr))", gap: "0.85rem" }}>
      {available.map((module) => {
        const isSelected = module.key === selected;
        return (
          <button
            key={module.key}
            type="button"
            onClick={() => onSelect(module.key)}
            aria-current={isSelected ? "true" : undefined}
            style={{ all: "unset", cursor: "pointer" }}
          >
            <Card
              style={{
                borderColor: isSelected ? "var(--rf-primary)" : "var(--rf-border)",
                boxShadow: isSelected ? "0 0 0 1px var(--rf-primary)" : "var(--rf-shadow-sm)",
                display: "flex",
                gap: "0.75rem",
                alignItems: "flex-start",
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  width: "2.25rem",
                  height: "2.25rem",
                  borderRadius: "var(--rf-radius-md)",
                  background: "color-mix(in oklch, var(--rf-primary) 15%, transparent)",
                  flexShrink: 0,
                }}
              >
                <module.Icon size={18} color="var(--rf-primary)" aria-hidden="true" />
              </div>
              <div>
                <p style={{ margin: 0, fontWeight: 700, fontSize: "0.9375rem" }}>{module.label}</p>
                <p style={{ margin: "0.15rem 0 0", fontSize: "0.8125rem", color: "var(--rf-muted-foreground)" }}>{module.description}</p>
              </div>
            </Card>
          </button>
        );
      })}
    </nav>
  );
}

export { MODULES };
