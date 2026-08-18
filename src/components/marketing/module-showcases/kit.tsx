import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

/**
 * Shared building blocks for module marketing previews. These are
 * illustrative, hand-built mockups, not live screenshots: every module
 * showcase built with this kit uses clearly fictional sample data, never a
 * real organization's records, same disclosure convention as
 * CustomerShowcase's isDemo entries. See module-showcases/school.tsx for the
 * first example.
 */

export function BrowserFrame({ path, children }: { path: string; children: React.ReactNode }) {
  return (
    <div className="overflow-hidden rounded-xl bg-card ring-1 ring-foreground/10">
      <div className="flex items-center gap-2 border-b bg-muted/40 px-3 py-2">
        <span className="flex gap-1.5" aria-hidden="true">
          <span className="size-2 rounded-full bg-foreground/15" />
          <span className="size-2 rounded-full bg-foreground/15" />
          <span className="size-2 rounded-full bg-foreground/15" />
        </span>
        <span className="ml-2 truncate rounded-full bg-background px-3 py-0.5 text-[11px] text-muted-foreground ring-1 ring-foreground/10">
          app.rockfrostgroup.com{path}
        </span>
      </div>
      <div className="p-4">{children}</div>
    </div>
  );
}

export function StatTile({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="rounded-lg border p-3">
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <p className="mt-1 text-xl font-semibold tracking-tight">{value}</p>
      <p className="mt-0.5 truncate text-[11px] text-muted-foreground">{sub}</p>
    </div>
  );
}

export function FieldBox({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className={cn("rounded-md border px-2.5 py-2", highlight && "bg-primary/5 ring-1 ring-primary/20")}>
      <p className="text-muted-foreground">{label}</p>
      <p className="font-medium">{value}</p>
    </div>
  );
}

export function PanelHeader({ title, badge }: { title: string; badge?: string }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <p className="text-xs font-medium text-muted-foreground">{title}</p>
      {badge ? (
        <Badge variant="outline" className="shrink-0 text-[10px]">
          {badge}
        </Badge>
      ) : null}
    </div>
  );
}

export function PanelNote({ children }: { children: React.ReactNode }) {
  return <p className="mt-3 text-[11px] text-muted-foreground">{children}</p>;
}

export function ShowcaseSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section aria-labelledby="module-showcase-title">
      <h2 id="module-showcase-title" className="text-2xl font-semibold tracking-tight">
        {title}
      </h2>
      <div className="mt-8 grid gap-4 lg:grid-cols-[1.15fr_1fr]">{children}</div>
      <p className="mt-4 text-xs text-muted-foreground">
        Illustrative previews built with sample data for demonstration, not a live customer record.
      </p>
    </section>
  );
}
