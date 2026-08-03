import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

interface OverviewMetricCardProps {
  label: string;
  value: string | number;
  description: string;
  href: string;
  icon: React.ReactNode;
}

export function OverviewMetricCard({ label, value, description, href, icon }: OverviewMetricCardProps) {
  return (
    <Link
      href={href as never}
      aria-label={`${label}: ${value}. ${description}`}
      className="group rounded-xl focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
    >
      <Card className="h-full transition-[transform,box-shadow] duration-200 group-hover:-translate-y-0.5 group-hover:shadow-md">
        <CardHeader>
          <div className="flex items-start justify-between gap-3">
            <div className="flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary" aria-hidden="true">
              {icon}
            </div>
            <ArrowUpRight className="size-4 text-muted-foreground transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" aria-hidden="true" />
          </div>
          <CardDescription className="pt-2 font-medium">{label}</CardDescription>
          <CardTitle className="text-3xl font-semibold tracking-tight">{value}</CardTitle>
          <p className="text-xs leading-relaxed text-muted-foreground">{description}</p>
        </CardHeader>
      </Card>
    </Link>
  );
}
