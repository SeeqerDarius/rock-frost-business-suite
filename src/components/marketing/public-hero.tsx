import { cn } from "@/lib/utils";

export function PublicHero({ eyebrow, title, description, actions, children, centered = false, className }: { eyebrow: string; title: string; description: string; actions?: React.ReactNode; children?: React.ReactNode; centered?: boolean; className?: string }) {
  return <section className={cn("public-hero", className)}><div className={cn("mx-auto grid max-w-6xl gap-10 px-6 py-20 lg:py-24", children && "lg:grid-cols-[1.15fr_.85fr] lg:items-center", centered && "text-center")}><div className={cn("space-y-6", centered && "mx-auto max-w-4xl")}><p className="public-eyebrow">{eyebrow}</p><h1 className="public-display">{title}</h1><p className={cn("max-w-2xl text-base leading-7 text-muted-foreground sm:text-lg", centered && "mx-auto")}>{description}</p>{actions ? <div className={cn("flex flex-wrap gap-3", centered && "justify-center")}>{actions}</div> : null}</div>{children}</div></section>;
}
