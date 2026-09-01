"use client";

import { usePathname } from "next/navigation";
import { SidebarNav } from "@/components/navigation/sidebar-nav";
import type { ModuleNavSection } from "@/platform/modules/full-navigation";
import type { ModuleNavItem } from "@/types/module";

function pathBelongsTo(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

/**
 * A section's routePrefix alone isn't enough to detect "am I inside this
 * module": HR and Inventory each combine a second route tree (Payroll,
 * Procurement) whose own pages live under a different prefix entirely
 * (/app/payroll, /app/procurement) - see
 * src/modules/inventory-procurement/navigation.tsx's own comment on this
 * exact consolidation. Checking each item's own href catches those too.
 */
function sectionMatchesPathname(section: ModuleNavSection, pathname: string) {
  if (pathBelongsTo(pathname, section.routePrefix)) return true;
  return section.items.some((item) => pathBelongsTo(pathname, item.href));
}

/**
 * The original sidebar design: every activated module is visible at once,
 * but only the module the current page actually belongs to shows its own
 * (permission-filtered) pages directly - every other enabled module is a
 * single flat link under one "Other modules" heading. Clicking one
 * navigates into it, where its own layout takes over and this component
 * then shows that module's pages in its place instead. No click-to-expand
 * step is needed to see what's inside the module you're already in, and no
 * state is needed here at all - the current section is derived fresh from
 * the pathname on every render.
 */
export function ModuleSectionsNav({
  sections,
  collapsed,
  onNavigate,
  tourTargets = false,
}: {
  sections: ModuleNavSection[];
  collapsed?: boolean;
  onNavigate?: () => void;
  /** Stamps the current module's own items with the onboarding tour's
   * data-tour-nav target (see SidebarNav) - only the section that matches
   * the actual current page, mirroring how the tour only ever describes
   * the module the user is actually in. */
  tourTargets?: boolean;
}) {
  const pathname = usePathname();

  if (sections.length === 0) return null;

  const currentSection = sections.find((section) => sectionMatchesPathname(section, pathname));
  const otherModuleItems: ModuleNavItem[] = sections
    .filter((section) => section.key !== currentSection?.key)
    .map((section) => ({ label: section.name, href: section.routePrefix, icon: section.icon, group: "Other modules" }));

  return (
    <div className="flex flex-col gap-2">
      {currentSection ? (
        <SidebarNav items={currentSection.items} collapsed={collapsed} onNavigate={onNavigate} tourTargets={tourTargets} />
      ) : null}
      {otherModuleItems.length > 0 ? (
        <div className={!collapsed && currentSection ? "border-t pt-2" : undefined}>
          <SidebarNav items={otherModuleItems} collapsed={collapsed} onNavigate={onNavigate} />
        </div>
      ) : null}
    </div>
  );
}
