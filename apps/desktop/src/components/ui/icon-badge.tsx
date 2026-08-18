import { cn } from "@/lib/utils";

const SIZES = {
  sm: "size-8",
  md: "size-9",
  lg: "size-10",
} as const;

/** The single RF-blue icon treatment used everywhere an icon represents a module, metric, or feature — never hardcode `bg-primary/10 text-primary` inline, so every surface stays in sync. */
export function IconBadge({
  children,
  size = "md",
  className,
}: {
  children: React.ReactNode;
  size?: keyof typeof SIZES;
  className?: string;
}) {
  return (
    <div className={cn("flex shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary", SIZES[size], className)} aria-hidden="true">
      {children}
    </div>
  );
}
