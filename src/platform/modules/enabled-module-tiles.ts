import type { LucideIcon } from "lucide-react";
import { catalogueModuleRegistry, getModule } from "@/platform/modules/registry";
import { productGroupKeys } from "@/platform/modules/product-groups";

export interface EnabledModuleTile {
  key: string;
  name: string;
  icon: LucideIcon;
  routePrefix: string;
}

/**
 * Every module currently enabled and accessible for this tenant, in registry
 * order - the exact same "is this module usable right now" check
 * ModuleLauncher (src/components/navigation/module-launcher.tsx) already
 * makes for its enabled tiles, extracted so the sidebar's all-modules list
 * (AppShell) can never drift from what the launcher considers enabled.
 * Deliberately excludes coming-soon/locked modules - this list is for
 * switching between what's already active, not upselling.
 */
export function getEnabledModuleTiles(enabledModuleKeys: string[]): EnabledModuleTile[] {
  return catalogueModuleRegistry.flatMap((mod) => {
    if (mod.status !== "available") return [];
    const accessibleKey = productGroupKeys(mod.key).find((key) => enabledModuleKeys.includes(key));
    const accessibleModule = accessibleKey ? getModule(accessibleKey) : null;
    if (!accessibleModule) return [];
    return [{ key: mod.key, name: mod.name, icon: mod.icon, routePrefix: accessibleModule.routePrefix ?? mod.routePrefix }];
  });
}
