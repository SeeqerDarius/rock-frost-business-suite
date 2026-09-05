import { FileDown, FileSpreadsheet, FileText } from "lucide-react";
import { buttonVariants } from "@/components/ui/button-variants";
import { cn } from "@/lib/utils";

/** Same shape as ReportExportLinks, but for a bespoke export route (with its own query params) rather than the generic /api/reports/[moduleKey] summary-card export. */
export function ReportDownloadLinks({ baseHref }: { baseHref: string }) {
  const separator = baseHref.includes("?") ? "&" : "?";
  return (
    <div className="flex gap-2">
      <a href={`${baseHref}${separator}format=pdf`} className={cn(buttonVariants({ variant: "outline", size: "sm" }))}>
        <FileDown />
        PDF
      </a>
      <a href={`${baseHref}${separator}format=xlsx`} className={cn(buttonVariants({ variant: "outline", size: "sm" }))}>
        <FileSpreadsheet />
        Excel
      </a>
      <a href={`${baseHref}${separator}format=csv`} className={cn(buttonVariants({ variant: "outline", size: "sm" }))}>
        <FileText />
        CSV
      </a>
    </div>
  );
}
