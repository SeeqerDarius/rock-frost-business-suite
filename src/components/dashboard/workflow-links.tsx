import Link from "next/link";
import { ArrowRight } from "lucide-react";

interface WorkflowLink {
  title: string;
  description: string;
  href: string;
  icon: React.ReactNode;
}

export function WorkflowLinks({ title, description, items }: { title: string; description: string; items: WorkflowLink[] }) {
  return (
    <section aria-labelledby="workflow-links-title" className="rounded-xl border bg-background p-5 sm:p-6">
      <div className="mb-5">
        <h2 id="workflow-links-title" className="text-base font-semibold">{title}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{description}</p>
      </div>
      <div className="grid gap-2 md:grid-cols-3">
        {items.map((item) => (
          <Link
            key={item.href}
            href={item.href as never}
            className="group flex min-h-24 items-start gap-3 rounded-lg border bg-card p-4 transition-colors hover:border-primary/30 hover:bg-primary/[0.03] focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            <span className="mt-0.5 text-primary [&_svg]:size-4" aria-hidden="true">{item.icon}</span>
            <span className="min-w-0 flex-1">
              <span className="flex items-center justify-between gap-2 text-sm font-medium">
                {item.title}
                <ArrowRight className="size-3.5 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
              </span>
              <span className="mt-1 block text-xs leading-relaxed text-muted-foreground">{item.description}</span>
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}
