import Link from "next/link";
import Image from "next/image";
import { cn } from "@/lib/utils";

export function Logo({ className }: { className?: string }) {
  return (
    <Link href="/" className={cn("flex items-center gap-2 font-semibold tracking-tight", className)}>
      <Image src="/RFG.png" alt="Rock Frost" width={28} height={28} className="rounded-sm" />
      <span>Rock Frost</span>
    </Link>
  );
}
