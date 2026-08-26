"use client";

import { Printer } from "lucide-react";
import { Button } from "@/components/ui/button";

export function PrintReceiptButton() {
  return (
    <Button className="print:hidden" onClick={() => window.print()}>
      <Printer />
      Print receipt
    </Button>
  );
}
