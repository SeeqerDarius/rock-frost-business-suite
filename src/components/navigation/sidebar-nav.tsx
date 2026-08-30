"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { AnimatedIconHoverScope } from "@/components/icons/animated-icon-hover-context";
import { getActiveNavigationHref } from "@/components/navigation/active-navigation";
import { NotificationBadge } from "@/components/notifications/notification-badge";
import type { ModuleNavItem } from "@/types/module";

/** Icon chip for a nav item - same treatment IconBadge uses everywhere else, sized down for an inline row. Kept as one consistent accent color rather than a distinct color per item, per IconBadge's own "never hardcode a color inline" rule. */
function NavIcon({ children, active }: { children: React.ReactNode; active: boolean }) {
  return (
    <span
      className={cn(
        "flex size-7 shrink-0 items-center justify-center rounded-md [&_svg]:size-4",
        active ? "bg-sidebar-primary/15 text-sidebar-primary" : "bg-sidebar-accent/60 text-muted-foreground",
      )}
      aria-hidden="true"
    >
      {children}
    </span>
  );
}

interface SidebarNavProps {
  items: ModuleNavItem[];
  collapsed?: boolean;
  onNavigate?: () => void;
  /**
   * Stamps each link with a stable data-tour-nav target for the onboarding
   * tour to spotlight one step per nav item. Only ever true for AppShell's
   * desktop <aside> instance - the mobile Sheet renders this same component
   * with the same items but no tour targets, since onboarding tours don't
   * run on mobile (see docs/ONBOARDING_TOURS.md) and having the same
   * selector exist twice in the DOM would risk targeting a hidden element.
   */
  tourTargets?: boolean;
}

export function SidebarNav({ items, collapsed = false, onNavigate, tourTargets = false }: SidebarNavProps) {
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
            data-tour-nav={tourTargets ? item.href : undefined}
            onClick={onNavigate}
            className={cn(
              "relative flex min-h-10 items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors focus-visible:ring-2 focus-visible:ring-sidebar-ring",
              collapsed && "justify-center px-0",
              isActive
                ? "bg-sidebar-primary/10 text-sidebar-primary before:absolute before:inset-y-2 before:left-0 before:w-0.5 before:rounded-full before:bg-sidebar-primary"
                : "text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
            )}
          >
            <NavIcon active={isActive}>{item.icon}</NavIcon>
            {!collapsed ? <span className="truncate">{item.label}</span> : null}
            {/* Notifications is the only nav item with a live unread count today - a generic badge field on ModuleNavItem would need threading through every module's own navigation builder for a count only this one item has. */}
            {!collapsed && item.href === "/app/notifications" ? <NotificationBadge /> : null}
          </Link>
        );

        return (
          <AnimatedIconHoverScope key={item.href}>
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
          </AnimatedIconHoverScope>
        );
      })}
    </nav>
  );
}
