import Link from "next/link";
import { Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/**
 * Plain GET search keeps School list filters usable without JavaScript and
 * makes the result URL shareable. The page applies search in its tenant-scoped
 * server query.
 */
export function RecordSearch({ action, placeholder, label, defaultValue, resultSummary, filters, isFiltered, queryName = "q", hiddenFilters = {} }: { action: string; placeholder: string; label: string; defaultValue?: string; resultSummary: string; filters?: React.ReactNode; isFiltered?: boolean; queryName?: string; hiddenFilters?: Record<string, string | undefined> }) {
  const clearParams = new URLSearchParams();
  for (const [key, value] of Object.entries(hiddenFilters)) if (value) clearParams.set(key, value);
  const clearHref = clearParams.size ? `${action}?${clearParams.toString()}` : action;
  return (
    <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
      <form action={action} method="get" className="flex w-full flex-wrap items-end gap-2 lg:max-w-2xl">
        <div className="min-w-48 flex-1 space-y-1.5">
          <Label htmlFor="school-record-search">{label}</Label>
          <Input id={`school-record-search-${queryName}`} type="search" name={queryName} defaultValue={defaultValue} placeholder={placeholder} />
        </div>
        {Object.entries(hiddenFilters).map(([key, value]) => value ? <input key={key} type="hidden" name={key} value={value} /> : null)}
        {filters}
        <Button type="submit" size="sm" variant="outline">
          <Search />
          Search
        </Button>
        {isFiltered ?? defaultValue ? (
          <Button size="sm" variant="ghost" nativeButton={false} render={<Link href={clearHref} />}>
            <X />
            Clear
          </Button>
        ) : null}
      </form>
      <p aria-live="polite" className="text-sm whitespace-nowrap text-muted-foreground">{resultSummary}</p>
    </div>
  );
}
