"use client";

import { Compass } from "lucide-react";
import { Button } from "@/components/ui/button";

export function ReplayTourButton() {
  return (
    <Button type="button" variant="outline" onClick={() => window.dispatchEvent(new Event("rf-tour-replay"))}>
      <Compass /> Replay guided tour
    </Button>
  );
}
