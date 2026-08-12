import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { IconBadge } from "@/components/ui/icon-badge";

interface OverviewMetricCardProps {
  label: string;
  value: string | number;
  description: string;
  href?: string;
  icon: React.ReactNode;
}

export function OverviewMetricCard({ label, value, description, href, icon }: OverviewMetricCardProps) {
  const card = (
    <Card className={href ? "h-full transition-[transform,box-shadow] duration-200 group-hover:-translate-y-0.5 group-hover:shadow-md" : "h-full"}>
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <IconBadge>{icon}</IconBadge>
          {href ? (
            <ArrowUpRight className="size-4 text-muted-foreground transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" aria-hidden="true" />
          ) : null}
        </div>
        <CardDescription className="pt-2 font-medium">{label}</CardDescription>
        <CardTitle className="text-3xl font-semibold tracking-tight">{value}</CardTitle>
        <p className="text-xs leading-relaxed text-muted-foreground">{description}</p>
      </CardHeader>
    </Card>
  );

  if (!href) return card;

  return (
    <Link
      href={href as never}
      aria-label={`${label}: ${value}. ${description}`}
      className="group rounded-xl focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
    >
      {card}
    </Link>
  );
}
