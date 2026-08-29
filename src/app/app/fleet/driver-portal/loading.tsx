import { Skeleton } from "@/components/ui/skeleton";

/**
 * First real use of the Skeleton primitive in this app - shaped to match
 * the Overview tab (the default landing tab) so the loading state doesn't
 * jump/reflow once real data arrives: a header, then the KPI grid.
 */
export default function DriverPortalLoading() {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Skeleton className="h-7 w-48" />
        <Skeleton className="h-4 w-64" />
      </div>
      <Skeleton className="h-10 w-full max-w-md" />
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton key={i} className="h-32 rounded-xl" />
        ))}
      </div>
    </div>
  );
}
