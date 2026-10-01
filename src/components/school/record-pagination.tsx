import Link from "next/link";

function pageHref(path: string, page: number, filters: Record<string, string | undefined>, pageName: string) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) if (value) params.set(key, value);
  params.set(pageName, String(page));
  return `${path}?${params.toString()}`;
}

export function RecordPagination({
  path,
  page,
  pageCount,
  filters,
  label,
  queryName = "page",
}: {
  path: string;
  page: number;
  pageCount: number;
  filters: Record<string, string | undefined>;
  label: string;
  queryName?: string;
}) {
  if (pageCount < 2) return null;

  return (
    <nav aria-label={`${label} pages`} className="flex items-center justify-between gap-3 border-t pt-4">
      <p className="text-sm text-muted-foreground" aria-live="polite">Page {page} of {pageCount}</p>
      <div className="flex gap-2">
        {page > 1 ? (
          <Link href={pageHref(path, page - 1, filters, queryName)} rel="prev" className="inline-flex h-9 items-center justify-center rounded-lg border bg-background px-3 text-sm font-medium shadow-sm hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">
            Previous
          </Link>
        ) : null}
        {page < pageCount ? (
          <Link href={pageHref(path, page + 1, filters, queryName)} rel="next" className="inline-flex h-9 items-center justify-center rounded-lg border bg-background px-3 text-sm font-medium shadow-sm hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">
            Next
          </Link>
        ) : null}
      </div>
    </nav>
  );
}
