import { FileDown, FileSpreadsheet } from "lucide-react";
import { buttonVariants } from "@/components/ui/button-variants";
import { cn } from "@/lib/utils";

/** Download links for a module's Reports page — hits /api/reports/[moduleKey], which re-derives the same summary the page already shows and applies the same *_REPORTS_VIEW gate server-side. */
export function ReportExportLinks({ moduleKey }: { moduleKey: string }) {
  return (
    <div className="flex gap-2">
      <a href={`/api/reports/${moduleKey}?format=pdf`} className={cn(buttonVariants({ variant: "outline", size: "sm" }))}>
        <FileDown />
        PDF
      </a>
      <a href={`/api/reports/${moduleKey}?format=xlsx`} className={cn(buttonVariants({ variant: "outline", size: "sm" }))}>
        <FileSpreadsheet />
        Excel
      </a>
    </div>
  );
}
