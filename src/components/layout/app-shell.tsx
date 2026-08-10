"use client";

import { useState, useSyncExternalStore } from "react";
import { usePathname } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { ChevronLeft, ChevronRight, Menu } from "lucide-react";
import { Logo } from "@/components/layout/logo";
import { useOrganizationBranding } from "@/components/theme/organization-branding-context";
import { SidebarNav } from "@/components/navigation/sidebar-nav";
import { ModuleLauncher } from "@/components/navigation/module-launcher";
import { UserMenu } from "@/components/navigation/user-menu";
import { OrganizationSwitcher } from "@/components/navigation/organization-switcher";
import { getActiveNavigationHref } from "@/components/navigation/active-navigation";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import type { ModuleNavItem } from "@/types/module";

interface AppShellProps {
  sectionLabel: string;
  navigation: ModuleNavItem[];
  footerNavigation?: ModuleNavItem[];
  children: React.ReactNode;
  enabledModuleKeys?: string[];
  homeHref?: string;
  showModuleLauncher?: boolean;
  organization?: {
    organizationId: string;
    memberships: { organizationId: string; name: string; tenantCode: string }[];
  };
}

/**
 * Renders the organization's own uploaded logo (Organization Settings >
 * Company logo) in place of the Rock Frost mark, for tenant-scoped shells
 * only (`organization` prop present — platform scope never passes it, so
 * platform operators always see the Rock Frost brand). Falls back to the
 * standard `Logo` when the organization hasn't uploaded one.
 */
function WorkspaceLogo({ homeHref, compact, hasOrganization }: { homeHref: string; compact?: boolean; hasOrganization: boolean }) {
  const branding = useOrganizationBranding();
  if (!hasOrganization || !branding.logoUrl) {
    return <Logo href={homeHref} compact={compact} />;
  }
  return (
    <Link
      href={homeHref as never}
      aria-label={compact ? (branding.name ? `${branding.name} home` : "Workspace home") : undefined}
      className="flex min-w-0 items-center gap-2 font-semibold tracking-tight"
    >
      <Image src={branding.logoUrl} alt="" width={30} height={30} unoptimized className="size-[30px] shrink-0 rounded-lg object-contain" />
      {!compact ? <span className="truncate">{branding.name ?? "Workspace"}</span> : null}
    </Link>
  );
}

function subscribeToSidebarPreference(onStoreChange: () => void) {
  window.addEventListener("rf-sidebar-change", onStoreChange);
  return () => window.removeEventListener("rf-sidebar-change", onStoreChange);
}

function getSidebarPreference() {
  return window.localStorage.getItem("rf-sidebar-collapsed") === "true";
}

function getServerSidebarPreference() {
  return false;
}

export function AppShell({
  sectionLabel,
  navigation,
  footerNavigation = [],
  children,
  enabledModuleKeys = [],
  organization,
  homeHref = "/app/dashboard",
  showModuleLauncher = true,
}: AppShellProps) {
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const sidebarCollapsed = useSyncExternalStore(
    subscribeToSidebarPreference,
    getSidebarPreference,
    getServerSidebarPreference,
  );
  const pathname = usePathname();
  const activeHref = getActiveNavigationHref(pathname, navigation);
  const currentItem = navigation.find((item) => item.href === activeHref);

  function toggleSidebar() {
    window.localStorage.setItem("rf-sidebar-collapsed", String(!sidebarCollapsed));
    window.dispatchEvent(new Event("rf-sidebar-change"));
  }

  return (
    <div className="flex min-h-dvh bg-muted/20">
      <aside
        aria-label={`${sectionLabel} sidebar`}
        data-collapsed={sidebarCollapsed}
        className={cn(
          "sticky top-0 hidden h-dvh shrink-0 flex-col border-r bg-sidebar transition-[width] duration-200 lg:flex",
          sidebarCollapsed ? "w-18" : "w-64",
        )}
      >
        <div className={cn("flex h-16 items-center border-b px-4", sidebarCollapsed && "justify-center px-2")}>
          <WorkspaceLogo homeHref={homeHref} compact={sidebarCollapsed} hasOrganization={Boolean(organization)} />
        </div>
        {organization && !sidebarCollapsed ? (
          <OrganizationSwitcher currentOrganizationId={organization.organizationId} memberships={organization.memberships} />
        ) : null}
        {!sidebarCollapsed ? <p className="px-5 pb-2 pt-4 text-xs font-medium uppercase tracking-wide text-muted-foreground">{sectionLabel}</p> : null}
        <div className="min-h-0 flex-1 overflow-y-auto py-1">
          <SidebarNav items={navigation} collapsed={sidebarCollapsed} />
        </div>
        {footerNavigation.length > 0 ? (
          <div className="border-t py-2">
            <SidebarNav items={footerNavigation} collapsed={sidebarCollapsed} />
          </div>
        ) : null}
        <div className="border-t p-2">
          <Button
            type="button"
            variant="ghost"
            size={sidebarCollapsed ? "icon" : "default"}
            className={cn("w-full text-muted-foreground", !sidebarCollapsed && "justify-start")}
            aria-label={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
            aria-expanded={!sidebarCollapsed}
            onClick={toggleSidebar}
          >
            {sidebarCollapsed ? <ChevronRight /> : <ChevronLeft />}
            {!sidebarCollapsed ? <span>Collapse sidebar</span> : null}
          </Button>
        </div>
      </aside>

      <Sheet open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
        <SheetContent side="left" className="flex h-dvh w-72 flex-col p-0">
          <SheetTitle className="sr-only">Navigation</SheetTitle>
          <div className="flex h-16 shrink-0 items-center border-b px-4">
            <WorkspaceLogo homeHref={homeHref} hasOrganization={Boolean(organization)} />
          </div>
          {organization ? (
            <OrganizationSwitcher currentOrganizationId={organization.organizationId} memberships={organization.memberships} />
          ) : null}
          <p className="px-5 pt-4 pb-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">{sectionLabel}</p>
          <div className="min-h-0 flex-1 overflow-y-auto pb-[max(1rem,env(safe-area-inset-bottom))] pt-1">
            <SidebarNav items={navigation} onNavigate={() => setMobileNavOpen(false)} />
          </div>
          {footerNavigation.length > 0 ? (
            <div className="border-t py-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
              <SidebarNav items={footerNavigation} onNavigate={() => setMobileNavOpen(false)} />
            </div>
          ) : null}
        </SheetContent>
      </Sheet>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-16 items-center justify-between gap-4 border-b bg-background/95 px-4 backdrop-blur sm:px-6">
          <Button variant="ghost" size="icon" className="lg:hidden" onClick={() => setMobileNavOpen(true)} aria-label="Open navigation">
            <Menu className="size-4" />
          </Button>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold">{currentItem?.shortLabel ?? currentItem?.label ?? sectionLabel}</p>
            <p className="hidden truncate text-xs text-muted-foreground sm:block">{sectionLabel}</p>
          </div>
          <div className="flex items-center gap-1">
            {showModuleLauncher ? <ModuleLauncher enabledModuleKeys={enabledModuleKeys} /> : null}
            <UserMenu />
          </div>
        </header>
        <main id="main-content" tabIndex={-1} className="flex-1 p-4 sm:p-6 lg:p-8">{children}</main>
      </div>
    </div>
  );
}
