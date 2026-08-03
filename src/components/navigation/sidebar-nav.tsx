"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { getActiveNavigationHref } from "@/components/navigation/active-navigation";
import type { ModuleNavItem } from "@/types/module";

interface SidebarNavProps {
  items: ModuleNavItem[];
  collapsed?: boolean;
  onNavigate?: () => void;
}

export function SidebarNav({ items, collapsed = false, onNavigate }: SidebarNavProps) {
  const pathname = usePathname();
  const activeHref = getActiveNavigationHref(pathname, items);

  return (
    <nav aria-label="Section navigation" className="flex flex-col gap-0.5 px-2">
      {items.map((item, index) => {
        const isActive = activeHref === item.href;
        const showGroup = item.group && item.group !== items[index - 1]?.group;
        const link = (
          <Link
            href={item.href as never}
            aria-current={isActive ? "page" : undefined}
            aria-label={collapsed ? item.label : undefined}
            onClick={onNavigate}
            className={cn(
              "relative flex min-h-10 items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors focus-visible:ring-2 focus-visible:ring-sidebar-ring",
              collapsed && "justify-center px-0",
              isActive
                ? "bg-sidebar-primary/10 text-sidebar-primary before:absolute before:inset-y-2 before:left-0 before:w-0.5 before:rounded-full before:bg-sidebar-primary"
                : "text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
            )}
          >
            <span className="shrink-0 [&_svg]:size-4" aria-hidden="true">{item.icon}</span>
            {!collapsed ? <span className="truncate">{item.label}</span> : null}
          </Link>
        );

        return (
          <div key={item.href}>
            {showGroup && !collapsed ? (
              <p className="px-3 pb-1 pt-4 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground/80">
                {item.group}
              </p>
            ) : null}
            {showGroup && collapsed ? <div className="mx-3 my-2 border-t" aria-hidden="true" /> : null}
            {collapsed ? (
              <Tooltip>
                <TooltipTrigger render={link} />
                <TooltipContent side="right" sideOffset={8}>{item.label}</TooltipContent>
              </Tooltip>
            ) : link}
          </div>
        );
      })}
    </nav>
  );
}
