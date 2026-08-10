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
      <Image
        src="/RFGgg.png"
        alt="Rock Frost"
        width={1015}
        height={129}
        className={cn(
          "w-auto object-contain drop-shadow-[0_1px_1px_rgba(0,0,0,0.85)]",
          compact ? "h-4 max-w-12" : "h-6 max-w-[188px]",
        )}
        priority
      />
    </Link>
  );
}
