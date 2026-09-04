"use client";

import { Button } from "@/components/ui/button";

export default function SchoolReportsError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <div className="mx-auto max-w-2xl rounded-lg border p-6 text-center"><h2 className="text-lg font-semibold">School reports could not load</h2><p className="mt-2 text-sm text-muted-foreground">Your filters and school records are unchanged. Try loading the report again.</p><Button className="mt-4" onClick={reset}>Try again</Button></div>;
}
