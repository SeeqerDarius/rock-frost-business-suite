"use client";

import { AlertTriangle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function AppError({ reset }: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex min-h-[60vh] items-center justify-center p-6">
      <div className="max-w-md space-y-4 text-center">
        <span className="mx-auto flex size-12 items-center justify-center rounded-full bg-destructive/10 text-destructive">
          <AlertTriangle className="size-6" aria-hidden="true" />
        </span>
        <div className="space-y-2">
          <h1 className="text-xl font-semibold">This page could not be loaded</h1>
          <p className="text-sm text-muted-foreground">
            Your data has not been changed. Try loading the page again; if the problem continues, contact platform support.
          </p>
        </div>
        <Button onClick={reset}><RefreshCw aria-hidden="true" />Try again</Button>
      </div>
    </div>
  );
}
