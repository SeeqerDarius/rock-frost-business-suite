import Link from "next/link";
import Image from "next/image";
import { cn } from "@/lib/utils";

export function Logo({ className, href = "/", compact = false }: { className?: string; href?: string; compact?: boolean }) {
  return (
    <Link
      href={href as never}
      aria-label={compact ? "Rock Frost home" : undefined}
      className={cn("flex min-w-0 items-center gap-2 font-semibold tracking-tight", className)}
    >
      <Image src="/icon.png" alt="" width={30} height={30} className="shrink-0 rounded-lg" priority />
      {!compact ? <span className="truncate">Rock Frost</span> : null}
    </Link>
  );
}
