"use client";

import { useState } from "react";
import Link from "next/link";
import { Grid3x3 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogTrigger } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { moduleRegistry } from "@/platform/modules/registry";

export function ModuleLauncher({ enabledModuleKeys = [] }: { enabledModuleKeys?: string[] }) {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="ghost" size="icon" aria-label="Open module launcher" />}>
        <Grid3x3 className="size-4" />
      </DialogTrigger>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Modules</DialogTitle>
          <DialogDescription>Switch to any module enabled for your organization.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-2 sm:grid-cols-2">
          {moduleRegistry.map((mod) => {
            const isEnabled = mod.status === "available" && enabledModuleKeys.includes(mod.key);

            if (isEnabled) {
              return (
                <Link
                  key={mod.key}
                  href={mod.routePrefix as never}
                  onClick={() => setOpen(false)}
                  className="flex items-start gap-3 rounded-lg border p-3 text-left transition-colors hover:bg-secondary/50"
                >
                  <mod.icon className="mt-0.5 size-5 text-muted-foreground" />
                  <div>
                    <p className="text-sm font-medium">{mod.name}</p>
                    <p className="text-xs text-muted-foreground">{mod.description}</p>
                  </div>
                </Link>
              );
            }

            const badgeLabel = mod.status === "coming-soon" ? "Coming soon" : "Not enabled";

            return (
              <div
                key={mod.key}
                className="flex items-start gap-3 rounded-lg border border-dashed p-3 text-left opacity-60"
              >
                <mod.icon className="mt-0.5 size-5 text-muted-foreground" />
                <div>
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium">{mod.name}</p>
                    <Badge variant="outline" className="text-[10px]">
                      {badgeLabel}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">{mod.description}</p>
                </div>
              </div>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
}
