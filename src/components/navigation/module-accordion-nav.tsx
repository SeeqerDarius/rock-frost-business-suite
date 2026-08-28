"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { SidebarNav } from "@/components/navigation/sidebar-nav";
import type { ModuleNavSection } from "@/platform/modules/full-navigation";

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
 * A real accordion over every enabled module: click any module, not just
 * the one the current page belongs to, and its own (permission-filtered)
 * pages expand in place - no navigation needed to see what's inside it.
 * Only one module is open at a time, mirroring the reference ERP layout
 * this was modeled on. Whichever module the current route actually belongs
 * to starts open. No effect is needed to keep that synced across
 * navigation: every module lives under its own layout.tsx (see
 * docs/ARCHITECTURE.md's module isolation section), so moving to a
 * different module always unmounts this component and mounts a fresh one
 * inside that module's own layout - the initial state below is correct on
 * every real navigation, not just first load.
 */
export function ModuleAccordionNav({
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
  const currentSectionKey = sections.find((section) => sectionMatchesPathname(section, pathname))?.key;
  const [openKey, setOpenKey] = useState<string | null>(currentSectionKey ?? null);

  if (sections.length === 0) return null;

  return (
    <nav aria-label="Modules" className="flex flex-col gap-0.5 px-2">
      {sections.map((section) => {
        const isOpen = openKey === section.key;
        const isCurrent = section.key === currentSectionKey;
        const iconChip = (
          <span
            className={cn(
              "flex size-7 shrink-0 items-center justify-center rounded-md [&_svg]:size-4",
              isCurrent ? "bg-sidebar-primary/15 text-sidebar-primary" : "bg-sidebar-accent/60 text-muted-foreground",
            )}
            aria-hidden="true"
          >
            {section.icon}
          </span>
        );

        return (
          <div key={section.key}>
            {collapsed ? (
              <Link
                href={section.routePrefix as never}
                aria-label={section.name}
                onClick={onNavigate}
                className={cn(
                  "flex min-h-10 items-center justify-center rounded-lg text-sm font-medium transition-colors",
                  isCurrent ? "text-sidebar-primary" : "text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                )}
              >
                {iconChip}
              </Link>
            ) : (
              <button
                type="button"
                onClick={() => setOpenKey((prev) => (prev === section.key ? null : section.key))}
                aria-expanded={isOpen}
                className={cn(
                  "flex min-h-10 w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors focus-visible:ring-2 focus-visible:ring-sidebar-ring",
                  isCurrent ? "text-sidebar-primary" : "text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                )}
              >
                {iconChip}
                <span className="min-w-0 flex-1 truncate text-left">{section.name}</span>
                <ChevronDown className={cn("size-4 shrink-0 transition-transform duration-200", isOpen && "rotate-180")} aria-hidden="true" />
              </button>
            )}
            {isOpen && !collapsed ? (
              <div className="ml-[1.15rem] mt-0.5 border-l pl-2">
                <SidebarNav items={section.items} onNavigate={onNavigate} tourTargets={tourTargets && isCurrent} />
              </div>
            ) : null}
          </div>
        );
      })}
    </nav>
  );
}
