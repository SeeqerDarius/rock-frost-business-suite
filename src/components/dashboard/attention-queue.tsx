import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export interface AttentionQueueItem {
  id: string;
  title: string;
  value: string | number;
  description: string;
  href: string;
  severity?: "urgent" | "review";
}

interface AttentionQueueProps {
  items: AttentionQueueItem[];
  title?: string;
  description?: string;
  emptyTitle?: string;
  emptyDescription?: string;
}

/**
 * A compact, source-backed follow-up list for operational dashboards. It
 * deliberately renders only caller-selected records and links each count to
 * the source workflow, so a headline warning always has a useful next step.
 */
export function AttentionQueue({
  items,
  title = "Needs attention",
  description = "Current items that may need a follow-up in their source module.",
  emptyTitle = "No tracked follow-ups",
  emptyDescription = "There are no items in this dashboard's follow-up categories right now.",
}: AttentionQueueProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{items.length > 0 ? title : emptyTitle}</CardTitle>
        <CardDescription>{items.length > 0 ? description : emptyDescription}</CardDescription>
      </CardHeader>
      {items.length > 0 ? (
        <CardContent className="space-y-2">
          {items.map((item) => (
            <Link
              key={item.id}
              href={item.href as never}
              className="group flex items-center gap-3 rounded-lg border p-3 transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              <Badge variant={item.severity === "urgent" ? "destructive" : "secondary"} className="min-w-8 justify-center tabular-nums">
                {item.value}
              </Badge>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium">{item.title}</span>
                <span className="block text-xs text-muted-foreground">{item.description}</span>
              </span>
              <ArrowUpRight className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" aria-hidden="true" />
            </Link>
          ))}
        </CardContent>
      ) : null}
    </Card>
  );
}
