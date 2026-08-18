import type { HTMLAttributes } from "react";
import { Card as ShadcnCard, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

/**
 * A single padded box, delegating to the real ported shadcn `ui/card.tsx`
 * (`Card` + `CardContent` together, since shadcn's own `Card` alone has no
 * horizontal padding - it is meant to be composed with `CardContent`) so
 * this app's cards render with the same classes as the web app's. Keeps
 * the existing simple `<Card>{children}</Card>` call pattern used across
 * every module screen, rather than requiring each of the ~60 call sites to
 * adopt the compound Header/Content/Footer structure.
 */
export function Card({ children, className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return (
    <ShadcnCard className={cn("shadow-sm", className)} {...rest}>
      <CardContent>{children}</CardContent>
    </ShadcnCard>
  );
}
