"use client";

import { useState } from "react";
import { FileText } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const MAX_BYTES = 4 * 1024 * 1024;

/**
 * Optional contract PDF on the new-contract form. Checks type and size in the
 * browser so an oversized file never reaches the 5 MB Server Action limit;
 * the server re-validates the type, size, and %PDF signature.
 */
export function ContractPdfField() {
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<{ name: string; size: number } | null>(null);
  return (
    <div className="space-y-1.5">
      <Label htmlFor="contractPdf">Contract PDF</Label>
      <Input
        id="contractPdf"
        name="contractPdf"
        type="file"
        accept=".pdf,application/pdf"
        aria-describedby="contractPdf-hint"
        aria-invalid={error ? true : undefined}
        onChange={(event) => {
          const input = event.currentTarget;
          const file = input.files?.[0];
          let message = "";
          if (file && !(file.type === "application/pdf" || /\.pdf$/i.test(file.name))) message = "Choose a PDF file.";
          else if (file && file.size > MAX_BYTES) message = "The PDF must be 4 MB or smaller.";
          input.setCustomValidity(message);
          setError(message || null);
          setSelected(file && !message ? { name: file.name, size: file.size } : null);
        }}
      />
      <p id="contractPdf-hint" className="text-xs text-muted-foreground">PDF only, up to 4 MB. It is stored privately as the primary contract document.</p>
      {selected ? <p className="flex items-center gap-1.5 text-sm"><FileText className="size-4 text-muted-foreground" aria-hidden />{selected.name} ({Math.max(1, Math.round(selected.size / 1024))} KB)</p> : null}
      {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
    </div>
  );
}
