"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

/**
 * Collapsed by default: cross-tenant figures (other organizations' revenue
 * and business data) are a legitimate thing for a platform operator to want
 * on hand, but showing another company's financial figures by default,
 * every time this page loads, is more than most operators need most of the
 * time. Kept out of the way until asked for.
 */
export function CollapsibleSection({ label, children }: { label: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger render={<Button variant="outline" size="sm" className="gap-1.5" />}>
        {open ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
        {open ? "Hide" : "Show"} {label}
      </CollapsibleTrigger>
      <CollapsibleContent className="pt-4">{children}</CollapsibleContent>
    </Collapsible>
  );
}
