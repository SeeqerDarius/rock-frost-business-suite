"use client";

import { useState } from "react";
import { Menu } from "lucide-react";
import { Logo } from "@/components/layout/logo";
import { SidebarNav } from "@/components/navigation/sidebar-nav";
import { ModuleLauncher } from "@/components/navigation/module-launcher";
import { UserMenu } from "@/components/navigation/user-menu";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import type { ModuleNavItem } from "@/types/module";

interface AppShellProps {
  sectionLabel: string;
  navigation: ModuleNavItem[];
  children: React.ReactNode;
}

export function AppShell({ sectionLabel, navigation, children }: AppShellProps) {
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  return (
    <div className="flex min-h-screen">
      <aside className="hidden w-64 shrink-0 flex-col border-r lg:flex">
        <div className="flex h-16 items-center border-b px-4">
          <Logo href="/app/dashboard" />
        </div>
        <p className="px-5 pt-4 pb-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">{sectionLabel}</p>
        <div className="flex-1 overflow-y-auto py-1">
          <SidebarNav items={navigation} />
        </div>
      </aside>

      <Sheet open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
        <SheetContent side="left" className="w-64 p-0">
          <SheetTitle className="sr-only">Navigation</SheetTitle>
          <div className="flex h-16 items-center border-b px-4">
            <Logo />
          </div>
          <p className="px-5 pt-4 pb-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">{sectionLabel}</p>
          <div className="flex-1 overflow-y-auto py-1" onClick={() => setMobileNavOpen(false)}>
            <SidebarNav items={navigation} />
          </div>
        </SheetContent>
      </Sheet>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-16 items-center justify-between gap-4 border-b px-4 sm:px-6">
          <Button variant="ghost" size="icon" className="lg:hidden" onClick={() => setMobileNavOpen(true)} aria-label="Open navigation">
            <Menu className="size-4" />
          </Button>
          <div className="flex-1" />
          <div className="flex items-center gap-1">
            <ModuleLauncher />
            <UserMenu />
          </div>
        </header>
        <main className="flex-1 p-4 sm:p-6">{children}</main>
      </div>
    </div>
  );
}
