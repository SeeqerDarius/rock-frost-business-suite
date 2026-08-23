import Link from "next/link";
import Image from "next/image";
import { cn } from "@/lib/utils";

export function Logo({
  className,
  href = "/",
  compact = false,
}: {
  className?: string;
  href?: string;
  compact?: boolean;
}) {
  return (
    <Link
      href={href as never}
      aria-label={compact ? "Rock Frost home" : undefined}
      className={cn("flex min-w-0 items-center", className)}
    >
      <span
        className={cn(
          "logo-shimmer relative inline-block shrink-0",
          compact ? "h-4 max-w-12" : "h-6 max-w-[188px]",
        )}
      >
        <Image
          src="/rft.png"
          alt="Rock Frost"
          width={1015}
          height={180}
          className="h-full w-full object-contain drop-shadow-[0_1px_1px_rgba(0,0,0,0.85)]"
          priority
        />
        <span aria-hidden="true" className="logo-shimmer-band" />
      </span>
    </Link>
  );
}
