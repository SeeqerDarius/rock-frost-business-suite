import Link from "next/link";
import { Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/**
 * Search box for School record lists.
 *
 * This is a plain GET form, so it works without JavaScript and the result
 * is a shareable URL. The School service functions currently accept only an
 * `organizationId` and return the full list, so the matching page filters
 * the already-loaded rows by the `q` parameter. That is honest — nothing is
 * hidden that the page did not receive — but it does not scale to large
 * schools; server-side filtering is recorded as a backend contract in
 * docs/SCHOOL_UI_CUSTOMER_READINESS.md.
 */
export function RecordSearch({ action, placeholder, label, defaultValue, resultSummary, filters, isFiltered }: { action: string; placeholder: string; label: string; defaultValue?: string; resultSummary: string; filters?: React.ReactNode; isFiltered?: boolean }) {
  return (
    <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
      <form action={action} method="get" className="flex w-full flex-wrap items-end gap-2 lg:max-w-2xl">
        <div className="min-w-48 flex-1 space-y-1.5">
          <Label htmlFor="school-record-search">{label}</Label>
          <Input id="school-record-search" type="search" name="q" defaultValue={defaultValue} placeholder={placeholder} />
        </div>
        {filters}
        <Button type="submit" size="sm" variant="outline">
          <Search />
          Search
        </Button>
        {isFiltered ?? defaultValue ? (
          <Button size="sm" variant="ghost" nativeButton={false} render={<Link href={action} />}>
            <X />
            Clear
          </Button>
        ) : null}
      </form>
      <p aria-live="polite" className="text-sm whitespace-nowrap text-muted-foreground">{resultSummary}</p>
    </div>
  );
}
